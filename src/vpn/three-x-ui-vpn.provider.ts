import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import dayjs from 'dayjs';
import { randomBytes, randomUUID } from 'node:crypto';
import { firstValueFrom } from 'rxjs';
import type {
  VpnAdminProvider,
  VpnNodeStatus,
} from './vpn-admin-provider.interface';
import type {
  VpnClientCreateParams,
  VpnClientExtendParams,
  VpnClientCreated,
  VpnProvider,
} from './vpn-provider.interface';

interface PanelMsg {
  readonly success?: boolean;
}

/** TCP REALITY + VLESS в 3x-ui ожидают этот flow на клиенте. */
const VLESS_FLOW_XTLS_RPRX_VISION = 'xtls-rprx-vision' as const;

/** Базовый путь веб-UI 3x-ui (типичный webBasePath). */
const DEFAULT_XUI_WEB_BASE_PATH = '/panel/';
/** Id inbound в 3x-ui для addClient/updateClient: env VPN_PANEL_INBOUND_ID или по умолчанию 1. */
const DEFAULT_XUI_INBOUND_ID = 1;

/** Фраза + "-" + telegram id в поле email панели (без @домена). Латиница для совместимости с клиентами. */
const SUB_EMAIL_PHRASES = [
  'vse-letaet-ura',
  'vse-puchkom',
  'prosto-skazka',
  'vpn-krasavchik',
  'lovit-otlichno',
  'balalaika-igraet',
  'medved-v-seti',
  'balalaika-zhgi',
  'medved-odobryaet',
  'balalaika-letit',
  'balalaika-vsegda-ryadom',
  'gromkaya-balalaika',
  'prosto-pushka',
  'huak-i-rabotaet',
  'vse-zaebis-rabotaet',
] as const;

@Injectable()
export class ThreeXUiVpnProvider implements VpnProvider, VpnAdminProvider {
  private cookieHeader = '';

  constructor(
    private readonly config: ConfigService,
    private readonly http: HttpService,
  ) {}

  private get panelOrigin(): string {
    const raw = this.config.get<string>('VPN_PANEL_URL');
    if (raw === undefined || raw.trim().length === 0) {
      throw new Error('VPN_PANEL_URL is required for 3x-ui adapter');
    }
    return raw.replace(/\/+$/, '');
  }

  private get webBasePath(): string {
    const raw = DEFAULT_XUI_WEB_BASE_PATH;
    const withSlash = raw.startsWith('/') ? raw : `/${raw}`;
    return withSlash.endsWith('/') ? withSlash : `${withSlash}/`;
  }

  private get inboundId(): number {
    const raw = this.config.get<string>('VPN_PANEL_INBOUND_ID');
    if (raw !== undefined && raw.trim().length > 0) {
      const n = Number.parseInt(raw, 10);
      if (!Number.isNaN(n) && n > 0) {
        return n;
      }
    }
    const num = this.config.get<number>('VPN_PANEL_INBOUND_ID');
    if (typeof num === 'number' && Number.isFinite(num) && num > 0) {
      return Math.floor(num);
    }
    return DEFAULT_XUI_INBOUND_ID;
  }

  private get adminUsername(): string {
    const raw = this.config.get<string>('VPN_ADMIN_USERNAME');
    if (raw === undefined || raw.length === 0) {
      throw new Error('VPN_ADMIN_USERNAME is required for 3x-ui adapter');
    }
    return raw;
  }

  private get adminPassword(): string {
    const raw = this.config.get<string>('VPN_ADMIN_PASSWORD');
    if (raw === undefined || raw.length === 0) {
      throw new Error('VPN_ADMIN_PASSWORD is required for 3x-ui adapter');
    }
    return raw;
  }

  private absorbSetCookie(header?: string | string[]): void {
    if (header === undefined) {
      return;
    }
    const rows = Array.isArray(header) ? header : [header];
    const map = new Map<string, string>();
    for (const part of this.cookieHeader.split(';')) {
      const trimmed = part.trim();
      if (trimmed.length === 0) {
        continue;
      }
      const eq = trimmed.indexOf('=');
      if (eq > 0) {
        map.set(trimmed.slice(0, eq).trim(), trimmed.slice(eq + 1).trim());
      }
    }
    for (const row of rows) {
      const kv = row.split(';')[0]?.trim();
      if (kv === undefined || kv.length === 0) {
        continue;
      }
      const eq = kv.indexOf('=');
      if (eq > 0) {
        map.set(kv.slice(0, eq).trim(), kv.slice(eq + 1).trim());
      }
    }
    this.cookieHeader = [...map.entries()]
      .map(([k, v]) => `${k}=${v}`)
      .join('; ');
  }

  private pickSubEmailPhrase(): string {
    const i = Math.floor(Math.random() * SUB_EMAIL_PHRASES.length);
    return SUB_EMAIL_PHRASES[i] ?? SUB_EMAIL_PHRASES[0];
  }

  /** Идентификатор клиента в панели (поле email): `{фраза}-{telegramId}`; без tg — `{фраза}-anon-{hex}`. Без домена. */
  private panelClientEmail(params: VpnClientCreateParams): string {
    const phrase = this.pickSubEmailPhrase();
    if (params.telegramUserId !== undefined) {
      return `${phrase}-${params.telegramUserId.toString()}`;
    }
    return `${phrase}-anon-${randomBytes(4).toString('hex')}`;
  }

  private panelTgId(params: VpnClientCreateParams): number {
    return this.telegramUserIdToPanel(params.telegramUserId);
  }

  private telegramUserIdToPanel(id: bigint | undefined): number {
    if (id === undefined) {
      return 0;
    }
    if (id > BigInt(Number.MAX_SAFE_INTEGER)) {
      return 0;
    }
    return Number(id);
  }

  /** Срок окончания в мс (поле expiryTime панели); та же логика месяцев, что и SubscriptionsService.computeExpiryEnd. */
  private expiryEndEpochMs(planMonths: number, baseEpochMs: number): number {
    let d = dayjs(baseEpochMs);
    if (planMonths === 0) {
      return d.add(3, 'day').valueOf();
    }
    const whole = Math.floor(planMonths);
    const remainder = planMonths - whole;
    d = d.add(whole, 'month');
    if (remainder > 0) {
      d = d.add(Math.round(remainder * 30), 'day');
    }
    return d.valueOf();
  }

  private buildSubscriptionUri(panelSubId: string): string {
    const domain = this.config.get<string>('DOMAIN_NAME') ?? '';
    let uri = `${this.panelOrigin}/sub/${panelSubId}`;
    if (domain.length > 0) {
      uri = `https://${domain}/sub/${panelSubId}`;
    }
    return uri;
  }

  /** 3x-ui: admin login via form POST, дальше cookie-сессия для API. */
  private async ensurePanelSession(): Promise<void> {
    const body = new URLSearchParams({
      username: this.adminUsername,
      password: this.adminPassword,
    });
    const loginUrl = `${this.panelOrigin}${this.webBasePath.replace(/\/+$/, '')}/login`;
    const res = await firstValueFrom(
      this.http.post<PanelMsg>(loginUrl, body.toString(), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Cookie: this.cookieHeader,
          Accept: 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
        },
        timeout: 20000,
        validateStatus: (s) => s === 200,
      }),
    );
    this.absorbSetCookie(res.headers['set-cookie']);
    if (res.data.success !== true) {
      throw new Error(
        '3x-ui login failed (check VPN_ADMIN_* credentials and web base path)',
      );
    }
  }

  private async postInboundAddClient(
    body: Record<string, unknown>,
  ): Promise<void> {
    const baseNoTrail = this.webBasePath.replace(/\/+$/, '');
    const url = `${this.panelOrigin}${baseNoTrail}/panel/api/inbounds/addClient`;
    const res = await firstValueFrom(
      this.http.post<PanelMsg>(url, body, {
        headers: {
          'Content-Type': 'application/json',
          Cookie: this.cookieHeader,
          'X-Requested-With': 'XMLHttpRequest',
        },
        timeout: 25000,
        validateStatus: (s) => s === 200,
      }),
    );
    if (res.data.success !== true) {
      throw new Error('3x-ui addClient rejected');
    }
  }

  private async fetchInboundSettingsJson(): Promise<string> {
    const inboundId = this.inboundId;
    await this.ensurePanelSession();
    const baseNoTrail = this.webBasePath.replace(/\/+$/, '');
    const url = `${this.panelOrigin}${baseNoTrail}/panel/api/inbounds/get/${inboundId}`;
    const res = await firstValueFrom(
      this.http.get<unknown>(url, {
        headers: {
          Cookie: this.cookieHeader,
          Accept: 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
        },
        timeout: 25000,
        validateStatus: (s) => s === 200,
      }),
    );
    const data = res.data as {
      obj?: { settings?: unknown };
      settings?: unknown;
    };
    const inbound = data.obj ?? (res.data as { settings?: unknown });
    const settings = inbound?.settings;
    if (typeof settings !== 'string') {
      throw new Error('3x-ui get inbound: settings missing or invalid');
    }
    return settings;
  }

  private extractClientSettingsObject(
    settingsJson: string,
    clientUuid: string,
  ): Record<string, unknown> {
    const settings = JSON.parse(settingsJson) as { clients?: unknown };
    const clients = settings.clients;
    if (!Array.isArray(clients)) {
      throw new Error('inbound settings.clients missing');
    }
    for (const c of clients) {
      if (
        typeof c === 'object' &&
        c !== null &&
        (c as { id?: string }).id === clientUuid
      ) {
        return { ...(c as Record<string, unknown>) };
      }
    }
    throw new Error('client uuid not found in inbound settings');
  }

  private async postInboundUpdateClient(
    clientUuid: string,
    body: Record<string, unknown>,
  ): Promise<void> {
    const baseNoTrail = this.webBasePath.replace(/\/+$/, '');
    const url = `${this.panelOrigin}${baseNoTrail}/panel/api/inbounds/updateClient/${encodeURIComponent(clientUuid)}`;
    const res = await firstValueFrom(
      this.http.post<PanelMsg>(url, body, {
        headers: {
          'Content-Type': 'application/json',
          Cookie: this.cookieHeader,
          'X-Requested-With': 'XMLHttpRequest',
        },
        timeout: 25000,
        validateStatus: (s) => s === 200,
      }),
    );
    if (res.data.success !== true) {
      throw new Error('3x-ui updateClient rejected');
    }
  }

  async extendClientExpiry(
    params: VpnClientExtendParams,
  ): Promise<{ connectionUri: string; panelExpiryEpochMs: number }> {
    const inboundId = this.inboundId;
    const settingsJson = await this.fetchInboundSettingsJson();
    const clientObj = this.extractClientSettingsObject(
      settingsJson,
      params.clientUuid,
    );
    const prevExpiryRaw = clientObj.expiryTime;
    const prevExpiryMs =
      typeof prevExpiryRaw === 'number'
        ? prevExpiryRaw
        : typeof prevExpiryRaw === 'string'
          ? Number.parseInt(prevExpiryRaw, 10)
          : 0;
    const baseEpochMs = Math.max(Date.now(), prevExpiryMs || 0);
    const newExpiryMs = this.expiryEndEpochMs(params.planMonths, baseEpochMs);
    const limitIp = Math.max(1, Math.floor(params.limitIp));
    const merged: Record<string, unknown> = {
      ...clientObj,
      expiryTime: newExpiryMs,
      limitIp,
      tgId: this.telegramUserIdToPanel(params.telegramUserId),
      enable: true,
    };

    const body = {
      id: inboundId,
      settings: JSON.stringify({ clients: [merged] }),
    };

    const run = async () => {
      await this.ensurePanelSession();
      await this.postInboundUpdateClient(params.clientUuid, body);
    };

    try {
      await run();
    } catch {
      this.cookieHeader = '';
      await run();
    }

    return {
      connectionUri: this.buildSubscriptionUri(params.panelSubId),
      panelExpiryEpochMs: newExpiryMs,
    };
  }

  async createClient(
    params: VpnClientCreateParams,
  ): Promise<VpnClientCreated> {
    const inboundId = this.inboundId;
    const clientUuid = randomUUID();
    const email = this.panelClientEmail(params);
    const subId = randomBytes(8).toString('hex');
    const comment =
      params.telegramUserId !== undefined
        ? `${params.label} | tg:${params.telegramUserId.toString()}`
        : params.label;
    const limitIp = Math.max(1, Math.floor(params.limitIp));
    const panelExpiryEpochMs = this.expiryEndEpochMs(
      params.planMonths,
      Date.now(),
    );
    const settingsObj = {
      clients: [
        {
          id: clientUuid,
          email,
          flow: VLESS_FLOW_XTLS_RPRX_VISION,
          limitIp,
          totalGB: 0,
          expiryTime: panelExpiryEpochMs,
          enable: true,
          tgId: this.panelTgId(params),
          subId,
          comment,
        },
      ],
    };

    const run = async () => {
      await this.ensurePanelSession();
      await this.postInboundAddClient({
        id: inboundId,
        settings: JSON.stringify(settingsObj),
      });
    };

    try {
      await run();
    } catch {
      this.cookieHeader = '';
      await run();
    }

    return {
      connectionUri: this.buildSubscriptionUri(subId),
      panelClientUuid: clientUuid,
      panelSubId: subId,
      panelExpiryEpochMs,
    };
  }

  deleteClient(externalId: string): Promise<void> {
    void externalId;
    return Promise.resolve();
  }

  getStats(externalId: string): Promise<Record<string, unknown>> {
    void externalId;
    return Promise.resolve({});
  }

  async probeIntegration(): Promise<boolean> {
    try {
      const url = `${this.panelOrigin}${this.webBasePath}`;
      await firstValueFrom(
        this.http.get(url, {
          responseType: 'text',
          timeout: 15000,
          validateStatus: (s) => s >= 200 && s < 500,
        }),
      );
      return true;
    } catch {
      return false;
    }
  }

  listNodes(): Promise<readonly VpnNodeStatus[]> {
    let host: string;
    try {
      host = new URL(this.panelOrigin).hostname;
    } catch {
      host = 'panel';
    }
    return Promise.resolve([{ name: '3x-ui', address: host, status: 'panel' }]);
  }
}
