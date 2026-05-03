import { HttpService } from '@nestjs/axios';
import { Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { firstValueFrom } from 'rxjs';
import type {
  VpnClientCreateParams,
  VpnProvider,
} from './vpn-provider.interface';

@Injectable()
export class StubVpnProvider implements VpnProvider {
  constructor(
    private readonly config: ConfigService,
    @Optional() private readonly http?: HttpService,
  ) {}

  async createClient(
    params: VpnClientCreateParams,
  ): Promise<{ connectionUri: string }> {
    const host =
      this.config.get<string>('WHITE_LABEL_VPN_HOST') ?? 'vpn.example.local';
    const profile =
      this.config.get<string>('WHITE_LABEL_KEY_PROFILE_SLUG') ?? 'access';
    const token = randomUUID().replace(/-/g, '');
    const tag =
      params.planMonths === 0
        ? 'trial'
        : `plan-${String(params.planMonths).replace('.', '_')}`;
    const fragment = encodeURIComponent(`${profile}-${tag}`);
    const uri = `vless://${token}@${host}:443?encryption=none&type=tcp#${fragment}`;
    return { connectionUri: uri };
  }

  async deleteClient(_externalId: string): Promise<void> {
    return Promise.resolve();
  }

  async getStats(_externalId: string): Promise<Record<string, unknown>> {
    return {};
  }

  async probeIntegration(): Promise<boolean> {
    const url = this.config.get<string>('VPN_HEALTHCHECK_URL');
    if (url === undefined || url.length === 0 || this.http === undefined) {
      return true;
    }
    try {
      await firstValueFrom(this.http.head(url, { timeout: 3000 }));
      return true;
    } catch {
      return false;
    }
  }
}
