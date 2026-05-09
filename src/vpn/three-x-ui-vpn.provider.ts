import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes, randomUUID } from 'node:crypto';
import { firstValueFrom } from 'rxjs';
import type {
  VpnAdminProvider,
  VpnNodeStatus,
} from './vpn-admin-provider.interface';
import type {
  VpnClientCreateParams,
  VpnProvider,
} from './vpn-provider.interface';

const CSRF_META_RE = /<meta\s+name="csrf-token"\s+content="([^"]+)"/i;

/** Header name expected by github.com/MHSanaei/3x-ui session/csrf.go */
const CSRF_HEADER = 'X-CSRF-Token';

interface PanelMsg {
  readonly success?: boolean;
}

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
    const raw =
      this.config.get<string>('THREE_X_UI_WEB_BASE_PATH')?.trim() || '/panel/';
    const withSlash = raw.startsWith('/') ? raw : `/${raw}`;
    return withSlash.endsWith('/') ? withSlash : `${withSlash}/`;
  }

  private get inboundId(): number {
    const raw = this.config.get<string>('THREE_X_UI_INBOUND_ID');
    if (raw === undefined || raw.trim().length === 0) {
      throw new Error('THREE_X_UI_INBOUND_ID is required for 3x-ui adapter');
    }
    const n = Number.parseInt(raw.trim(), 10);
    if (!Number.isFinite(n) || n <= 0) {
      throw new Error('THREE_X_UI_INBOUND_ID must be a positive integer');
    }
    return n;
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

  private expiryEpochMs(planMonths: number): number {
    const now = Date.now();
    if (planMonths === 0) {
      return now + 3 * 24 * 60 * 60 * 1000;
    }
    if (planMonths === 0.25) {
      return now + 7 * 24 * 60 * 60 * 1000;
    }
    const days = Math.round(planMonths * 30);
    return now + days * 24 * 60 * 60 * 1000;
  }

  private extractCsrf(html: string): string {
    const m = html.match(CSRF_META_RE);
    if (m?.[1] !== undefined && m[1].length > 0) {
      return m[1];
    }
    throw new Error('3x-ui login page did not expose csrf-token meta');
  }

  private async fetchLoginHtml(): Promise<{ csrf: string }> {
    const url = `${this.panelOrigin}${this.webBasePath}`;
    const res = await firstValueFrom(
      this.http.get<string>(url, {
        responseType: 'text',
        timeout: 15000,
        validateStatus: (s) => s >= 200 && s < 400,
      }),
    );
    this.absorbSetCookie(res.headers['set-cookie']);
    return { csrf: this.extractCsrf(res.data) };
  }

  private async ensurePanelSession(): Promise<{ csrf: string }> {
    const { csrf } = await this.fetchLoginHtml();
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
          [CSRF_HEADER]: csrf,
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
    return { csrf };
  }

  private async postInboundAddClient(
    csrf: string,
    body: Record<string, unknown>,
  ): Promise<void> {
    const baseNoTrail = this.webBasePath.replace(/\/+$/, '');
    const url = `${this.panelOrigin}${baseNoTrail}/panel/api/inbounds/addClient`;
    const res = await firstValueFrom(
      this.http.post<PanelMsg>(url, body, {
        headers: {
          'Content-Type': 'application/json',
          Cookie: this.cookieHeader,
          [CSRF_HEADER]: csrf,
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

  async createClient(
    params: VpnClientCreateParams,
  ): Promise<{ connectionUri: string }> {
    const inboundId = this.inboundId;
    const clientUuid = randomUUID();
    const emailLocal = `bal_${Date.now()}_${randomBytes(4).toString('hex')}`;
    const email = `${emailLocal}@bot.local`;
    const subId = randomBytes(8).toString('hex');
    const settingsObj = {
      clients: [
        {
          id: clientUuid,
          email,
          flow: '',
          limitIp: 0,
          totalGB: 0,
          expiryTime: this.expiryEpochMs(params.planMonths),
          enable: true,
          tgId: 0,
          subId,
          comment: params.label,
        },
      ],
    };

    const run = async () => {
      const { csrf } = await this.ensurePanelSession();
      await this.postInboundAddClient(csrf, {
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

    const domain = this.config.get<string>('DOMAIN_NAME') ?? '';
    let uri = `${this.panelOrigin}/sub/${subId}`;
    if (domain.length > 0) {
      uri = `https://${domain}/sub/${subId}`;
    }
    return { connectionUri: uri };
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
      await this.fetchLoginHtml();
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
