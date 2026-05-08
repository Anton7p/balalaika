import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { VpnAdminProvider } from '../vpn/vpn-admin-provider.interface';
import { VPN_ADMIN_PROVIDER } from '../vpn/vpn.tokens';
import { AdminStatusUiAdapter } from './admin-status-ui.adapter';

interface AppHealthResponse {
  readonly status?: string;
}

@Injectable()
export class AdminStatusService {
  constructor(
    private readonly config: ConfigService,
    @Inject(VPN_ADMIN_PROVIDER)
    private readonly vpnAdminProvider: VpnAdminProvider,
    private readonly uiAdapter: AdminStatusUiAdapter,
  ) {}

  private async fetchJson<T>(
    input: string,
    init?: RequestInit,
    timeoutMs = 8000,
  ): Promise<T> {
    const res = await fetch(input, {
      ...init,
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    return (await res.json()) as T;
  }

  private getAppHealthUrl(): string {
    const configured = this.config.get<string>('VPN_HEALTHCHECK_URL');
    if (configured !== undefined && configured.trim().length > 0) {
      return configured.trim();
    }
    return 'http://127.0.0.1:3000/health';
  }

  async buildStatusMessage(): Promise<string> {
    let appStatus = 'unreachable';
    let nodes: Awaited<ReturnType<VpnAdminProvider['listNodes']>> | null = null;

    try {
      const health = await this.fetchJson<AppHealthResponse>(
        this.getAppHealthUrl(),
        undefined,
        5000,
      );
      appStatus = health.status ?? 'unknown';
    } catch {
      appStatus = 'unreachable';
    }

    try {
      nodes = await this.vpnAdminProvider.listNodes();
    } catch {
      nodes = null;
    }

    return this.uiAdapter.render({ appStatus, nodes });
  }
}
