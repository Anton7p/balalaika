import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'node:crypto';
import { firstValueFrom } from 'rxjs';
import type { VpnAdminProvider, VpnNodeStatus } from './vpn-admin-provider.interface';
import type { VpnClientCreateParams, VpnProvider } from './vpn-provider.interface';

interface MarzbanTokenResponse {
  readonly access_token: string;
}

interface MarzbanCreateUserResponse {
  readonly subscription_url?: string;
  readonly username?: string;
}

interface MarzbanNodeResponse {
  readonly name: string;
  readonly address: string;
  readonly status: string;
}

@Injectable()
export class MarzbanVpnProvider implements VpnProvider, VpnAdminProvider {
  private token: string | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly http: HttpService,
  ) {}

  private get panelUrl(): string {
    const raw = this.config.get<string>('VPN_PANEL_URL');
    if (raw === undefined || raw.trim().length === 0) {
      throw new Error('VPN_PANEL_URL is required for marzban adapter');
    }
    return raw.replace(/\/+$/, '');
  }

  private get adminUsername(): string {
    const raw = this.config.get<string>('VPN_ADMIN_USERNAME');
    if (raw === undefined || raw.length === 0) {
      throw new Error('VPN_ADMIN_USERNAME is required for marzban adapter');
    }
    return raw;
  }

  private get adminPassword(): string {
    const raw = this.config.get<string>('VPN_ADMIN_PASSWORD');
    if (raw === undefined || raw.length === 0) {
      throw new Error('VPN_ADMIN_PASSWORD is required for marzban adapter');
    }
    return raw;
  }

  private get inboundTag(): string {
    const raw = this.config.get<string>('MARZBAN_INBOUND_TAG');
    if (raw === undefined || raw.length === 0) {
      throw new Error('MARZBAN_INBOUND_TAG is required for marzban adapter');
    }
    return raw;
  }

  private expiryEpochSeconds(planMonths: number): number {
    const now = new Date();
    if (planMonths === 0) {
      return Math.floor((now.getTime() + 3 * 24 * 60 * 60 * 1000) / 1000);
    }
    if (planMonths === 0.25) {
      return Math.floor((now.getTime() + 7 * 24 * 60 * 60 * 1000) / 1000);
    }
    const days = Math.round(planMonths * 30);
    return Math.floor((now.getTime() + days * 24 * 60 * 60 * 1000) / 1000);
  }

  private normalizeSubscriptionUrl(rawUrl: string): string {
    if (/^https?:\/\//i.test(rawUrl)) {
      return rawUrl;
    }
    const domain = this.config.get<string>('DOMAIN_NAME');
    if (domain === undefined || domain.length === 0) {
      return rawUrl;
    }
    return `https://${domain}${rawUrl.startsWith('/') ? '' : '/'}${rawUrl}`;
  }

  private async login(): Promise<string> {
    const body = new URLSearchParams({
      username: this.adminUsername,
      password: this.adminPassword,
    });
    const res = await firstValueFrom(
      this.http.post<MarzbanTokenResponse>(
        `${this.panelUrl}/api/admin/token`,
        body.toString(),
        {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          timeout: 15000,
        },
      ),
    );
    const token = res.data.access_token;
    if (token.length === 0) {
      throw new Error('Marzban token response is empty');
    }
    this.token = token;
    return token;
  }

  private async getToken(): Promise<string> {
    if (this.token !== null) {
      return this.token;
    }
    return this.login();
  }

  async createClient(
    params: VpnClientCreateParams,
  ): Promise<{ connectionUri: string }> {
    const username = `u_${Date.now()}_${Buffer.from(params.label).toString('hex').slice(0, 8)}`;
    const userPassword = randomBytes(12).toString('hex');
    const payload = {
      username,
      proxies: { vless: {} },
      inbounds: { vless: [this.inboundTag] },
      expire: this.expiryEpochSeconds(params.planMonths),
      data_limit: 0,
      data_limit_reset_strategy: 'no_reset',
      status: 'active',
      note: params.label,
      next_plan: null,
      on_hold_timeout: null,
      on_hold_expire_duration: null,
    };

    const doCreate = async (token: string) =>
      firstValueFrom(
        this.http.post<MarzbanCreateUserResponse>(
          `${this.panelUrl}/api/user`,
          {
            ...payload,
            // Some Marzban versions accept password field for user creation.
            // Keeping it here improves compatibility across versions.
            password: userPassword,
          },
          {
            headers: { Authorization: `Bearer ${token}` },
            timeout: 20000,
          },
        ),
      );

    let result;
    try {
      result = await doCreate(await this.getToken());
    } catch {
      // Token may expire: one re-auth attempt before failing.
      const refreshed = await this.login();
      result = await doCreate(refreshed);
    }

    const url = result.data.subscription_url;
    if (url === undefined || url.length === 0) {
      throw new Error('Marzban did not return subscription_url');
    }
    return { connectionUri: this.normalizeSubscriptionUrl(url) };
  }

  async deleteClient(externalId: string): Promise<void> {
    if (externalId.length === 0) {
      return;
    }
    try {
      const token = await this.getToken();
      await firstValueFrom(
        this.http.delete(`${this.panelUrl}/api/user/${encodeURIComponent(externalId)}`, {
          headers: { Authorization: `Bearer ${token}` },
          timeout: 15000,
        }),
      );
    } catch {
      // Best-effort delete in current domain flow.
    }
  }

  async getStats(_externalId: string): Promise<Record<string, unknown>> {
    return {};
  }

  async probeIntegration(): Promise<boolean> {
    try {
      const body = new URLSearchParams({
        username: this.adminUsername,
        password: this.adminPassword,
      });
      await firstValueFrom(
        this.http.post(`${this.panelUrl}/api/admin/token`, body.toString(), {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          timeout: 5000,
        }),
      );
      return true;
    } catch {
      return false;
    }
  }

  async listNodes(): Promise<readonly VpnNodeStatus[]> {
    const doFetch = async (token: string) =>
      firstValueFrom(
        this.http.get<MarzbanNodeResponse[]>(`${this.panelUrl}/api/nodes`, {
          headers: { Authorization: `Bearer ${token}` },
          timeout: 15000,
        }),
      );

    let response;
    try {
      response = await doFetch(await this.getToken());
    } catch {
      const refreshed = await this.login();
      response = await doFetch(refreshed);
    }

    return response.data.map((node) => ({
      name: node.name,
      address: node.address,
      status: node.status,
    }));
  }
}
