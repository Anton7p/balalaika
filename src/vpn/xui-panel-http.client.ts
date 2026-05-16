import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AxiosResponse } from 'axios';
import { firstValueFrom } from 'rxjs';

interface PanelMsg {
  readonly success?: boolean;
  readonly msg?: string;
}

interface PanelCsrfBody {
  readonly obj?: string;
}

const PANEL_HTTP_USER_AGENT =
  'Mozilla/5.0 (compatible; balalaika-bot/1.0)';

/** HTTP-клиент 3x-ui v3: CSRF + cookie-сессия для UI/API. */
@Injectable()
export class XuiPanelHttpClient {
  private cookieHeader = '';
  private sessionLoggedIn = false;

  constructor(
    private readonly config: ConfigService,
    private readonly http: HttpService,
  ) {}

  resetSession(): void {
    this.cookieHeader = '';
    this.sessionLoggedIn = false;
  }

  private get panelOrigin(): string {
    const raw = this.config.get<string>('VPN_PANEL_URL');
    if (raw === undefined || raw.trim().length === 0) {
      throw new Error('VPN_PANEL_URL is required');
    }
    return raw.replace(/\/+$/, '');
  }

  apiPath(suffix: string): string {
    const base = '/panel';
    const path = suffix.startsWith('/') ? suffix : `/${suffix}`;
    return `${this.panelOrigin}${base}${path}`;
  }

  private get adminUsername(): string {
    return this.config.getOrThrow<string>('VPN_ADMIN_USERNAME');
  }

  private get adminPassword(): string {
    return this.config.getOrThrow<string>('VPN_ADMIN_PASSWORD');
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

  private async fetchCsrfToken(): Promise<string> {
    const res = await firstValueFrom(
      this.http.get<PanelCsrfBody>(`${this.panelOrigin}/panel/csrf-token`, {
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

  async ensurePanelSession(): Promise<void> {
    if (this.sessionLoggedIn) {
      return;
    }
    const csrf = await this.fetchCsrfToken();
    const body = new URLSearchParams({
      username: this.adminUsername,
      password: this.adminPassword,
    });
    const res = await firstValueFrom(
      this.http.post<PanelMsg>(`${this.panelOrigin}/panel/login`, body.toString(), {
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

  private async csrfForPost(): Promise<string> {
    await this.ensurePanelSession();
    return await this.fetchCsrfToken();
  }

  async getJson<T>(url: string): Promise<T> {
    await this.ensurePanelSession();
    const res = await firstValueFrom(
      this.http.get<T>(url, {
        headers: this.uiHeaders(),
        timeout: 25000,
        validateStatus: (s) => s === 200,
      }),
    );
    return res.data;
  }

  async postJson<T>(url: string, body: unknown): Promise<T> {
    const csrf = await this.csrfForPost();
    const res = await firstValueFrom(
      this.http.post<T>(url, body, {
        headers: {
          ...this.uiHeaders(),
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrf,
        },
        timeout: 25000,
        validateStatus: (s) => s === 200,
      }),
    );
    return res.data;
  }

  async postForm<T>(url: string, body: URLSearchParams): Promise<T> {
    const csrf = await this.csrfForPost();
    const res = await firstValueFrom(
      this.http.post<T>(url, body.toString(), {
        headers: {
          ...this.uiHeaders(),
          'Content-Type': 'application/x-www-form-urlencoded',
          'X-CSRF-Token': csrf,
        },
        timeout: 25000,
        validateStatus: (s) => s === 200,
      }),
    );
    return res.data;
  }

  assertPanelSuccess(data: PanelMsg, action: string): void {
    if (data.success !== true) {
      throw new Error(
        `${action}: ${typeof data.msg === 'string' ? data.msg : 'unknown'}`,
      );
    }
  }
}
