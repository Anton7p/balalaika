import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { LoadBalancerService } from './load-balancer.service';
import { MarzbanVpnProvider } from './marzban-vpn.provider';
import { VpnProvisioningService } from './vpn-provisioning.service';
import { VPN_ADMIN_PROVIDER, VPN_PROVIDER } from './vpn.tokens';

@Module({
  imports: [
    HttpModule.register({
      timeout: 8000,
      maxRedirects: 3,
    }),
  ],
  providers: [
    LoadBalancerService,
    VpnProvisioningService,
    MarzbanVpnProvider,
    {
      provide: VPN_PROVIDER,
      useExisting: MarzbanVpnProvider,
    },
    {
      provide: VPN_ADMIN_PROVIDER,
      useExisting: MarzbanVpnProvider,
    },
  ],
  exports: [
    VpnProvisioningService,
    LoadBalancerService,
    VPN_PROVIDER,
    VPN_ADMIN_PROVIDER,
  ],
})
export class VpnModule {}
