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
import { REDIS_WORKING_INBOUND_IDS_KEY } from './vpn-routing.constants';
import { XuiPanelHttpClient } from './xui-panel-http.client';

export interface VpnFailoverRequest {
  readonly fromInboundId: number;
  readonly toInboundId: number;
}

@Injectable()
export class VpnFailoverService {
  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly panel: XuiPanelHttpClient,
    private readonly loadBalancer: LoadBalancerService,
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
      include: { user: { select: { telegramId: true } } },
    });

    let notified = 0;
    for (const row of rows) {
      const uuid = row.panelClientUuid;
      if (uuid === null || uuid.length === 0) {
        continue;
      }
      try {
        const email = await this.findClientEmail(req.toInboundId, uuid);
        const vless = await this.fetchVlessUri(req.toInboundId, email);
        const cipher = this.crypto.encryptUtf8(vless);
        await this.prisma.subscription.update({
          where: { id: row.id },
          data: {
            panelInboundId: req.toInboundId,
            vpnPayloadCipher: cipher,
          },
        });
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
          { err, subscriptionId: row.id, fromInboundId: req.fromInboundId },
          'vpn_failover_user_notify_failed',
        );
      }
    }

    if (this.nodeQueue?.usesNodeIpQueue()) {
      await this.nodeQueue.syncWorkingIndexToInbound(req.toInboundId);
    } else {
      await this.patchWorkingInboundList(req.fromInboundId, req.toInboundId);
    }

    const adminId = this.config.get<string>('TELEGRAM_ADMIN_ID')?.trim();
    if (adminId !== undefined && adminId.length > 0) {
      await this.sendTelegramPlain(
        BigInt(adminId),
        `⚠️ Auto-failover: inbound ${req.fromInboundId} → ${req.toInboundId}. ` +
          `Подписок обновлено: ${String(notified)} / ${String(rows.length)}.`,
      ).catch((err: unknown) => {
        this.log.warn({ err }, 'vpn_failover_admin_notify_failed');
      });
    }

    return { migrated: rows.length, notified };
  }

  private async findClientEmail(
    inboundId: number,
    clientUuid: string,
  ): Promise<string> {
    const data = await this.panel.getJson<{
      obj?: { settings?: string };
    }>(this.panel.apiPath(`/panel/api/inbounds/get/${inboundId}`));
    const settingsRaw = data.obj?.settings;
    if (typeof settingsRaw !== 'string') {
      throw new Error('inbound settings missing after copy');
    }
    const settings = JSON.parse(settingsRaw) as { clients?: unknown };
    if (!Array.isArray(settings.clients)) {
      throw new Error('settings.clients missing');
    }
    for (const c of settings.clients) {
      if (
        typeof c === 'object' &&
        c !== null &&
        (c as { id?: string }).id === clientUuid
      ) {
        const email = String((c as { email?: string }).email ?? '').trim();
        if (email.length > 0) {
          return email;
        }
      }
    }
    throw new Error(`client ${clientUuid} not found on inbound ${inboundId}`);
  }

  private async fetchVlessUri(
    inboundId: number,
    email: string,
  ): Promise<string> {
    const enc = encodeURIComponent(email);
    const data = await this.panel.getJson<{
      success?: boolean;
      msg?: string;
      obj?: unknown;
    }>(
      this.panel.apiPath(
        `/panel/api/inbounds/getClientLinks/${inboundId}/${enc}`,
      ),
    );
    if (data.success !== true) {
      throw new Error(
        `getClientLinks: ${typeof data.msg === 'string' ? data.msg : 'unknown'}`,
      );
    }
    const s = JSON.stringify(data.obj ?? '');
    const m = s.match(/vless:\/\/[^\s"']+/);
    if (m === null) {
      throw new Error('no vless in getClientLinks');
    }
    return m[0];
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
    await this.redis.set(REDIS_WORKING_INBOUND_IDS_KEY, next.join(','));
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
