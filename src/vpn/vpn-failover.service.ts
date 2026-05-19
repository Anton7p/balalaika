import { HttpService } from '@nestjs/axios';
import { Inject, Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import type Redis from 'ioredis';
import { firstValueFrom } from 'rxjs';
import { CryptoService } from '../crypto/crypto.service';
import { NOTIFY_HTML } from '../common/content/notify-html';
import { PrismaService } from '../prisma/prisma.service';
import { REDIS_CLIENT } from '../redis/redis.constants';
import { LoadBalancerService } from './load-balancer.service';
import { NodeQueueRoutingService } from './node-queue-routing.service';
import { PanelNodeRegistryService } from './panel-node-registry.service';
import type { VpnProvider } from './vpn-provider.interface';
import { AppNamespaceService } from '../common/app-namespace.service';
import { VPN_PROVIDER } from './vpn.tokens';
import { XuiPanelHttpClient } from './xui-panel-http.client';

interface PanelInboundClient {
  readonly id: string;
  readonly email: string;
  readonly tgId: number;
  readonly subId: string;
}

export interface VpnFailoverRequest {
  readonly fromInboundId: number;
  readonly toInboundId: number;
}

@Injectable()
export class VpnFailoverService {
  constructor(
    private readonly config: ConfigService,
    private readonly appNs: AppNamespaceService,
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly panel: XuiPanelHttpClient,
    @Inject(VPN_PROVIDER) private readonly vpn: VpnProvider,
    private readonly loadBalancer: LoadBalancerService,
    private readonly panelRegistry: PanelNodeRegistryService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly http: HttpService,
    @InjectPinoLogger(VpnFailoverService.name)
    private readonly log: PinoLogger,
    @Optional() private readonly nodeQueue?: NodeQueueRoutingService,
  ) {}

  async applyFailover(req: VpnFailoverRequest): Promise<{
    migrated: number;
    notified: number;
  }> {
    const now = new Date();
    const rows = await this.prisma.subscription.findMany({
      where: {
        panelInboundId: req.fromInboundId,
        expiresAt: { gt: now },
        panelClientUuid: { not: null },
      },
      select: {
        id: true,
        panelClientUuid: true,
        panelSubId: true,
        user: { select: { telegramId: true } },
      },
    });

    let notified = 0;
    for (const row of rows) {
      const uuid = row.panelClientUuid;
      if (uuid === null || uuid.length === 0) {
        continue;
      }
      try {
        const onTarget = await this.resolveTargetClientWithRetry(row, req);
        const vless = await this.vpn.fetchClientVlessUri(
          req.toInboundId,
          onTarget.email,
        );
        const cipher = this.crypto.encryptUtf8(vless);
        await this.prisma.subscription.update({
          where: { id: row.id },
          data: {
            panelInboundId: req.toInboundId,
            panelClientUuid: onTarget.id,
            vpnPayloadCipher: cipher,
            ...(onTarget.subId.length > 0
              ? { panelSubId: onTarget.subId }
              : {}),
          },
        });
        this.log.info(
          {
            subscriptionId: row.id,
            toInboundId: req.toInboundId,
            panelEmail: onTarget.email,
          },
          'vpn_failover_subscription_persisted',
        );
        await this.sendTelegramHtml(
          row.user.telegramId,
          NOTIFY_HTML.VPN_NODE_FAILOVER(),
        );
        await this.sendTelegramHtml(
          row.user.telegramId,
          NOTIFY_HTML.SUBSCRIPTION_SUCCESS(vless),
        );
        notified += 1;
      } catch (err: unknown) {
        this.log.error(
          {
            err,
            subscriptionId: row.id,
            fromInboundId: req.fromInboundId,
            toInboundId: req.toInboundId,
            telegramId: String(row.user.telegramId),
          },
          'vpn_failover_user_notify_failed',
        );
      }
    }

    if (this.nodeQueue?.usesNodeIpQueue()) {
      const headInbound = await this.nodeQueue.currentWorkingInboundId();
      if (req.fromInboundId === headInbound) {
        await this.nodeQueue.syncWorkingIndexToInbound(req.toInboundId);
      }
    } else {
      await this.patchWorkingInboundList(req.fromInboundId, req.toInboundId);
    }

    const adminId = this.config.get<string>('TELEGRAM_ADMIN_ID')?.trim();
    if (adminId !== undefined && adminId.length > 0) {
      const fromLabel = await this.formatInboundForAdmin(req.fromInboundId);
      const toLabel = await this.formatInboundForAdmin(req.toInboundId);
      await this.sendTelegramPlain(
        BigInt(adminId),
        `⚠️ Auto-failover: ${fromLabel} → ${toLabel}. ` +
          `Подписок обновлено: ${String(notified)} / ${String(rows.length)}.`,
      ).catch((err: unknown) => {
        this.log.warn({ err }, 'vpn_failover_admin_notify_failed');
      });
    }

    return { migrated: rows.length, notified };
  }

  private async resolveTargetClientWithRetry(
    row: {
      readonly panelClientUuid: string | null;
      readonly panelSubId: string | null;
      readonly user: { readonly telegramId: bigint };
    },
    req: VpnFailoverRequest,
    attempts = 8,
    delayMs = 500,
  ): Promise<PanelInboundClient> {
    let lastErr: Error | undefined;
    for (let i = 0; i < attempts; i += 1) {
      try {
        return await this.resolveTargetClient(row, req);
      } catch (err: unknown) {
        lastErr = err instanceof Error ? err : new Error(String(err));
        if (i < attempts - 1) {
          await new Promise((r) => setTimeout(r, delayMs));
        }
      }
    }
    throw lastErr ?? new Error('resolveTargetClient failed');
  }

  /**
   * Клиент на целевом inbound после copyClients.
   * 1) panelSubId в Postgres; 2) email со старого inbound; 3) tgId / суффикс email на целевом.
   */
  private async resolveTargetClient(
    row: {
      readonly panelClientUuid: string | null;
      readonly panelSubId: string | null;
      readonly user: { readonly telegramId: bigint };
    },
    req: VpnFailoverRequest,
  ): Promise<PanelInboundClient> {
    const targetClients = await this.loadInboundClients(req.toInboundId);
    const subId = row.panelSubId?.trim() ?? '';
    if (subId.length > 0) {
      const bySub = targetClients.find((c) => c.subId === subId);
      if (bySub !== undefined) {
        return bySub;
      }
    }

    const uuid = row.panelClientUuid?.trim() ?? '';
    if (uuid.length > 0) {
      try {
        const sourceEmail = await this.findEmailByUuid(
          req.fromInboundId,
          uuid,
        );
        return this.matchClientInList(
          req.toInboundId,
          sourceEmail,
          targetClients,
        );
      } catch (err: unknown) {
        const byTg = this.findClientByTelegramId(
          targetClients,
          row.user.telegramId,
        );
        if (byTg !== undefined) {
          return byTg;
        }
        throw err;
      }
    }

    const byTg = this.findClientByTelegramId(
      targetClients,
      row.user.telegramId,
    );
    if (byTg !== undefined) {
      return byTg;
    }
    throw new Error(
      `no client on inbound ${req.toInboundId} for telegram ${row.user.telegramId.toString()}`,
    );
  }

  private findClientByTelegramId(
    clients: readonly PanelInboundClient[],
    telegramId: bigint,
  ): PanelInboundClient | undefined {
    const wantTg = this.telegramIdToPanelNumber(telegramId);
    const suffix = `-${telegramId.toString()}`;
    for (const c of clients) {
      if (wantTg > 0 && c.tgId === wantTg) {
        return c;
      }
      if (c.email.endsWith(suffix)) {
        return c;
      }
    }
    return undefined;
  }

  private telegramIdToPanelNumber(id: bigint): number {
    if (id > BigInt(Number.MAX_SAFE_INTEGER)) {
      return 0;
    }
    return Number(id);
  }

  private async findEmailByUuid(
    inboundId: number,
    clientUuid: string,
  ): Promise<string> {
    const clients = await this.loadInboundClients(inboundId);
    for (const c of clients) {
      if (c.id === clientUuid && c.email.length > 0) {
        return c.email;
      }
    }
    throw new Error(`client ${clientUuid} not found on inbound ${inboundId}`);
  }

  /**
   * После copyClients 3x-ui часто меняет email (например `user@x` → `user@x_2` на inbound 2).
   */
  private matchClientInList(
    inboundId: number,
    sourceEmail: string,
    clients: readonly PanelInboundClient[],
  ): PanelInboundClient {
    const want = sourceEmail.trim().toLowerCase();
    const suffixInbound = `${want}_${String(inboundId)}`;
    let prefixMatch: PanelInboundClient | undefined;

    for (const c of clients) {
      const e = c.email.toLowerCase();
      if (e === want || e === suffixInbound) {
        return c;
      }
      if (e.startsWith(`${want}_`) && prefixMatch === undefined) {
        prefixMatch = c;
      }
    }
    if (prefixMatch !== undefined) {
      return prefixMatch;
    }
    throw new Error(`client ${sourceEmail} not found on inbound ${inboundId}`);
  }

  private async loadInboundClients(
    inboundId: number,
  ): Promise<readonly PanelInboundClient[]> {
    const data = await this.panel.getJson<{
      obj?: { settings?: string };
    }>(this.panel.apiPath(`/panel/api/inbounds/get/${inboundId}`));
    const settingsRaw = data.obj?.settings;
    if (typeof settingsRaw !== 'string') {
      throw new Error(`inbound ${inboundId} settings missing`);
    }
    const settings = JSON.parse(settingsRaw) as { clients?: unknown };
    if (!Array.isArray(settings.clients)) {
      throw new Error(`inbound ${inboundId} settings.clients missing`);
    }
    const out: PanelInboundClient[] = [];
    for (const c of settings.clients) {
      if (typeof c !== 'object' || c === null) {
        continue;
      }
      const raw = c as {
        id?: string;
        email?: string;
        tgId?: number | string;
        subId?: string;
      };
      const id = String(raw.id ?? '').trim();
      const email = String(raw.email ?? '').trim();
      if (id.length === 0 || email.length === 0) {
        continue;
      }
      const tgRaw = raw.tgId;
      const tgId =
        typeof tgRaw === 'number'
          ? tgRaw
          : typeof tgRaw === 'string'
            ? Number.parseInt(tgRaw, 10) || 0
            : 0;
      out.push({
        id,
        email,
        tgId,
        subId: String(raw.subId ?? '').trim(),
      });
    }
    return out;
  }

  /** Для админского Telegram: IP:port (inbound N) из NODE_IPS, иначе только id. */
  private async formatInboundForAdmin(inboundId: number): Promise<string> {
    if (!this.panelRegistry.usesNodeIpQueue()) {
      return `inbound ${inboundId}`;
    }
    try {
      const queue = await this.panelRegistry.resolveQueueFromPanel();
      const node = queue.find((n) => n.inboundId === inboundId);
      if (node !== undefined) {
        return `${node.address}:${String(node.port)} (inbound ${inboundId})`;
      }
    } catch (err: unknown) {
      this.log.warn(
        { err, inboundId },
        'vpn_failover_resolve_inbound_label_failed',
      );
    }
    return `inbound ${inboundId}`;
  }

  private async patchWorkingInboundList(
    deadId: number,
    replacementId: number,
  ): Promise<void> {
    const current = [...(await this.loadBalancer.workingInboundIdsAsync())];
    const next = current
      .filter((id) => id !== deadId)
      .concat(current.includes(replacementId) ? [] : [replacementId]);
    if (next.length === 0) {
      next.push(replacementId);
    }
    await this.redis.set(this.appNs.redisWorkingInboundIdsKey, next.join(','));
    this.log.warn(
      { deadId, replacementId, next },
      'vpn_working_inbound_ids_updated_redis',
    );
  }

  private async sendTelegramHtml(
    telegramId: bigint,
    html: string,
  ): Promise<void> {
    await this.telegramApi('sendMessage', {
      chat_id: telegramId.toString(),
      text: html,
      parse_mode: 'HTML',
    });
  }

  private async sendTelegramPlain(
    telegramId: bigint,
    text: string,
  ): Promise<void> {
    await this.telegramApi('sendMessage', {
      chat_id: telegramId.toString(),
      text,
    });
  }

  private async telegramApi(
    method: string,
    body: Record<string, string>,
  ): Promise<void> {
    const token = this.config.getOrThrow<string>('TELEGRAM_BOT_TOKEN');
    const url = `https://api.telegram.org/bot${token}/${method}`;
    await firstValueFrom(
      this.http.post(url, body, {
        timeout: 20000,
        validateStatus: (s) => s === 200,
      }),
    );
  }
}
