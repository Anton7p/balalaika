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
    existing?: Readonly<{
      clientUuid: string;
      subId: string;
      panelInboundId: number;
    }>,
  ): Promise<{
    connectionUri: string;
    panelClientUuid: string;
    panelSubId: string;
    panelExpiryEpochMs: number;
    panelInboundId: number;
  }> {
    const label = `inbound:${existing?.panelInboundId ?? 'new'}:${planMonths}`;
    if (existing !== undefined) {
      const { connectionUri, panelExpiryEpochMs, panelInboundId } =
        await this.vpn.extendClientExpiry({
          clientUuid: existing.clientUuid,
          panelSubId: existing.subId,
          panelInboundId: existing.panelInboundId,
          planMonths,
          limitIp,
          telegramUserId,
        });
      return {
        connectionUri,
        panelClientUuid: existing.clientUuid,
        panelSubId: existing.subId,
        panelExpiryEpochMs,
        panelInboundId,
      };
    }
    const created = await this.vpn.createClient({
      label,
      planMonths,
      limitIp,
      telegramUserId,
    });
    return {
      connectionUri: created.connectionUri,
      panelClientUuid: created.panelClientUuid,
      panelSubId: created.panelSubId,
      panelExpiryEpochMs: created.panelExpiryEpochMs,
      panelInboundId: created.panelInboundId,
    };
  }

  async probeVpnIntegration(): Promise<boolean> {
    return this.vpn.probeIntegration();
  }

  /** Для админ-диагностики: порядок рабочих inbound и лимит из env. */
  routingConfig(): {
    workingInboundIds: readonly number[];
    clientLimitPerInbound: number;
  } {
    return {
      workingInboundIds: this.loadBalancer.workingInboundIds(),
      clientLimitPerInbound: this.loadBalancer.clientLimitPerInbound(),
    };
  }
}
