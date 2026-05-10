import { Inject, Injectable } from '@nestjs/common';
import { LoadBalancerService } from './load-balancer.service';
import type { VpnProvider } from './vpn-provider.interface';
import { VPN_PROVIDER } from './vpn.tokens';

@Injectable()
export class VpnProvisioningService {
  constructor(
    private readonly loadBalancer: LoadBalancerService,
    @Inject(VPN_PROVIDER) private readonly vpn: VpnProvider,
  ) {}

  async provisionConnection(
    planMonths: number,
    telegramUserId: bigint | undefined,
    limitIp: number,
    existing?: Readonly<{ clientUuid: string; subId: string }>,
  ): Promise<{
    connectionUri: string;
    panelClientUuid: string;
    panelSubId: string;
    panelExpiryEpochMs: number;
  }> {
    const target = this.loadBalancer.selectTarget();
    const label = `${target.nodeId}:${planMonths}`;
    if (existing !== undefined) {
      const { connectionUri, panelExpiryEpochMs } =
        await this.vpn.extendClientExpiry({
          clientUuid: existing.clientUuid,
          panelSubId: existing.subId,
          planMonths,
          limitIp,
          telegramUserId,
        });
      return {
        connectionUri,
        panelClientUuid: existing.clientUuid,
        panelSubId: existing.subId,
        panelExpiryEpochMs,
      };
    }
    return await this.vpn.createClient({
      label,
      planMonths,
      limitIp,
      telegramUserId,
    });
  }

  async probeVpnIntegration(): Promise<boolean> {
    return this.vpn.probeIntegration();
  }
}
