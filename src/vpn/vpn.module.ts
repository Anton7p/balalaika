import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { LoadBalancerService } from './load-balancer.service';
import { StubVpnProvider } from './stub-vpn.provider';
import { VpnProvisioningService } from './vpn-provisioning.service';
import { VPN_PROVIDER } from './vpn.tokens';

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
    {
      provide: VPN_PROVIDER,
      useClass: StubVpnProvider,
    },
  ],
  exports: [VpnProvisioningService, LoadBalancerService, VPN_PROVIDER],
})
export class VpnModule {}
