import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import dayjs from 'dayjs';
import { randomBytes, randomUUID } from 'node:crypto';
import { firstValueFrom } from 'rxjs';
import type { AxiosResponse } from 'axios';
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
import { LoadBalancerService } from './load-balancer.service';

interface PanelMsg {
  readonly success?: boolean;
  readonly msg?: string;
}

interface PanelCsrfBody {
  readonly obj?: string;
}

/** TCP REALITY + VLESS в 3x-ui ожидают этот flow на клиенте. */
const VLESS_FLOW_XTLS_RPRX_VISION = 'xtls-rprx-vision' as const;

/** Базовый путь веб-UI 3x-ui (типичный webBasePath). */
const DEFAULT_XUI_WEB_BASE_PATH = '/panel/';

const PANEL_HTTP_USER_AGENT =
  'Mozilla/5.0 (compatible; balalaika-bot/1.0)';

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
  private sessionLoggedIn = false;

  constructor(
    private readonly config: ConfigService,
    private readonly http: HttpService,
    private readonly loadBalancer: LoadBalancerService,
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

  private apiPath(suffix: string): string {
    const baseNoTrail = this.webBasePath.replace(/\/+$/, '');
    const path = suffix.startsWith('/') ? suffix : `/${suffix}`;
    return `${this.panelOrigin}${baseNoTrail}${path}`;
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

  private uiHeaders(extra?: Record<string, string>): Record<string, string> {
    return {
      Accept: 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
      'User-Agent': PANEL_HTTP_USER_AGENT,
      Referer: `${this.panelOrigin}/panel/`,
      Origin: this.panelOrigin,
      ...(this.cookieHeader.length > 0 ? { Cookie: this.cookieHeader } : {}),
      ...extra,
    };
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

  private absorbResponseCookies(res: AxiosResponse<unknown>): void {
    this.absorbSetCookie(res.headers['set-cookie']);
  }

  private resetPanelSession(): void {
    this.cookieHeader = '';
    this.sessionLoggedIn = false;
  }

  private async fetchCsrfToken(): Promise<string> {
    const url = `${this.panelOrigin}/panel/csrf-token`;
    const res = await firstValueFrom(
      this.http.get<PanelCsrfBody>(url, {
        headers: this.uiHeaders(),
        timeout: 20000,
        validateStatus: (s) => s === 200,
      }),
    );
    this.absorbResponseCookies(res);
    const token = res.data.obj;
    if (token === undefined || String(token).length === 0) {
      throw new Error('3x-ui csrf-token: empty obj');
    }
    return String(token);
  }

  /** 3x-ui v3: GET csrf-token → cookie → POST login с X-CSRF-Token. */
  private async ensurePanelSession(): Promise<void> {
    if (this.sessionLoggedIn) {
      return;
    }
    const csrf = await this.fetchCsrfToken();
    const body = new URLSearchParams({
      username: this.adminUsername,
      password: this.adminPassword,
    });
    const loginUrl = `${this.panelOrigin}/panel/login`;
    const res = await firstValueFrom(
      this.http.post<PanelMsg>(loginUrl, body.toString(), {
        headers: {
          ...this.uiHeaders(),
          'Content-Type': 'application/x-www-form-urlencoded',
          'X-CSRF-Token': csrf,
        },
        timeout: 20000,
        validateStatus: (s) => s === 200,
      }),
    );
    this.absorbResponseCookies(res);
    if (res.data.success !== true) {
      throw new Error(
        `3x-ui login failed: ${typeof res.data.msg === 'string' ? res.data.msg : 'unknown'}`,
      );
    }
    this.sessionLoggedIn = true;
  }

  /** Свежий CSRF для mutating POST (addClient, updateClient). */
  private async csrfForAuthenticatedPost(): Promise<string> {
    await this.ensurePanelSession();
    return await this.fetchCsrfToken();
  }

  private pickSubEmailPhrase(): string {
    const i = Math.floor(Math.random() * SUB_EMAIL_PHRASES.length);
    return SUB_EMAIL_PHRASES[i] ?? SUB_EMAIL_PHRASES[0];
  }

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

  private extractFirstVlessUri(obj: unknown): string | undefined {
    if (obj === null || obj === undefined) {
      return undefined;
    }
    if (typeof obj === 'string') {
      const direct = obj.match(/vless:\/\/[^\s"'<>]+/);
      if (direct) {
        return direct[0];
      }
      try {
        return this.extractFirstVlessUri(JSON.parse(obj) as unknown);
      } catch {
        return undefined;
      }
    }
    if (Array.isArray(obj)) {
      for (const item of obj) {
        const v = this.extractFirstVlessUri(item);
        if (v !== undefined) {
          return v;
        }
      }
      return undefined;
    }
    if (typeof obj === 'object') {
      for (const v of Object.values(obj as Record<string, unknown>)) {
        const x = this.extractFirstVlessUri(v);
        if (x !== undefined) {
          return x;
        }
      }
    }
    return undefined;
  }

  private countClientsInSettingsJson(settingsJson: string): number {
    const settings = JSON.parse(settingsJson) as { clients?: unknown };
    if (!Array.isArray(settings.clients)) {
      return 0;
    }
    return settings.clients.length;
  }

  private async fetchInboundClientCount(inboundId: number): Promise<number> {
    const settingsJson = await this.fetchInboundSettingsJson(inboundId);
    return this.countClientsInSettingsJson(settingsJson);
  }

  private async buildClientCountsMap(): Promise<Map<number, number>> {
    const map = new Map<number, number>();
    for (const inboundId of this.loadBalancer.workingInboundIds()) {
      map.set(inboundId, await this.fetchInboundClientCount(inboundId));
    }
    return map;
  }

  private async resolveInboundForNewClient(): Promise<number> {
    await this.ensurePanelSession();
    const counts = await this.buildClientCountsMap();
    const picked = this.loadBalancer.pickInboundForNewClient(counts);
    if (picked === undefined) {
      const limit = this.loadBalancer.clientLimitPerInbound();
      const ids = this.loadBalancer.workingInboundIds().join(',');
      throw new Error(
        `3x-ui: all working inbounds full (limit ${String(limit)} per inbound): ${ids}`,
      );
    }
    return picked.inboundId;
  }

  private async fetchVlessUriForClient(
    inboundId: number,
    email: string,
  ): Promise<string> {
    await this.ensurePanelSession();
    const enc = encodeURIComponent(email);
    const url = this.apiPath(
      `/panel/api/inbounds/getClientLinks/${inboundId}/${enc}`,
    );
    const res = await firstValueFrom(
      this.http.get<unknown>(url, {
        headers: this.uiHeaders(),
        timeout: 25000,
        validateStatus: (s) => s === 200,
      }),
    );
    const data = res.data as { success?: boolean; msg?: string; obj?: unknown };
    if (data.success !== true) {
      throw new Error(
        `3x-ui getClientLinks failed: ${typeof data.msg === 'string' ? data.msg : 'unknown'}`,
      );
    }
    const vless = this.extractFirstVlessUri(data.obj);
    if (vless === undefined || vless.length === 0) {
      throw new Error('3x-ui getClientLinks: no vless URI in response');
    }
    return vless;
  }

  private async postInboundAddClient(
    inboundId: number,
    body: Record<string, unknown>,
  ): Promise<void> {
    const csrf = await this.csrfForAuthenticatedPost();
    const url = this.apiPath('/panel/api/inbounds/addClient');
    const res = await firstValueFrom(
      this.http.post<PanelMsg>(url, body, {
        headers: {
          ...this.uiHeaders(),
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrf,
        },
        timeout: 25000,
        validateStatus: (s) => s === 200,
      }),
    );
    if (res.data.success !== true) {
      throw new Error(
        `3x-ui addClient rejected: ${typeof res.data.msg === 'string' ? res.data.msg : 'unknown'}`,
      );
    }
  }

  private async fetchInboundSettingsJson(inboundId: number): Promise<string> {
    await this.ensurePanelSession();
    const url = this.apiPath(`/panel/api/inbounds/get/${inboundId}`);
    const res = await firstValueFrom(
      this.http.get<unknown>(url, {
        headers: this.uiHeaders(),
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
    const csrf = await this.csrfForAuthenticatedPost();
    const url = this.apiPath(
      `/panel/api/inbounds/updateClient/${encodeURIComponent(clientUuid)}`,
    );
    const res = await firstValueFrom(
      this.http.post<PanelMsg>(url, body, {
        headers: {
          ...this.uiHeaders(),
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrf,
        },
        timeout: 25000,
        validateStatus: (s) => s === 200,
      }),
    );
    if (res.data.success !== true) {
      throw new Error(
        `3x-ui updateClient rejected: ${typeof res.data.msg === 'string' ? res.data.msg : 'unknown'}`,
      );
    }
  }

  async extendClientExpiry(
    params: VpnClientExtendParams,
  ): Promise<{
    connectionUri: string;
    panelExpiryEpochMs: number;
    panelInboundId: number;
  }> {
    const inboundId = params.panelInboundId;
    const settingsJson = await this.fetchInboundSettingsJson(inboundId);
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
      await this.postInboundUpdateClient(params.clientUuid, body);
    };

    try {
      await run();
    } catch {
      this.resetPanelSession();
      await run();
    }

    const email = String(clientObj.email ?? '').trim();
    if (email.length === 0) {
      throw new Error(
        '3x-ui extendClient: client email missing for getClientLinks',
      );
    }
    let connectionUri: string;
    try {
      connectionUri = await this.fetchVlessUriForClient(inboundId, email);
    } catch {
      this.resetPanelSession();
      connectionUri = await this.fetchVlessUriForClient(inboundId, email);
    }
    return {
      connectionUri,
      panelExpiryEpochMs: newExpiryMs,
      panelInboundId: inboundId,
    };
  }

  async createClient(
    params: VpnClientCreateParams,
  ): Promise<VpnClientCreated> {
    const inboundId = await this.resolveInboundForNewClient();
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
      await this.postInboundAddClient(inboundId, {
        id: inboundId,
        settings: JSON.stringify(settingsObj),
      });
    };

    try {
      await run();
    } catch {
      this.resetPanelSession();
      await run();
    }

    let connectionUri: string;
    try {
      connectionUri = await this.fetchVlessUriForClient(inboundId, email);
    } catch {
      this.resetPanelSession();
      connectionUri = await this.fetchVlessUriForClient(inboundId, email);
    }
    return {
      connectionUri,
      panelClientUuid: clientUuid,
      panelSubId: subId,
      panelExpiryEpochMs,
      panelInboundId: inboundId,
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
