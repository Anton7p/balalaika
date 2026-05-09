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
  ): Promise<string> {
    const target = this.loadBalancer.selectTarget();
    const { connectionUri } = await this.vpn.createClient({
      label: `${target.nodeId}:${planMonths}`,
      planMonths,
      limitIp,
      telegramUserId,
    });
    return connectionUri;
  }

  async probeVpnIntegration(): Promise<boolean> {
    return this.vpn.probeIntegration();
  }
}
