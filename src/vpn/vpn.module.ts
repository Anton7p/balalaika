import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { LoadBalancerService } from './load-balancer.service';
import { NodeQueueRoutingService } from './node-queue-routing.service';
import { PanelNodeRegistryService } from './panel-node-registry.service';
import { ThreeXUiVpnProvider } from './three-x-ui-vpn.provider';
import { VpnProvisioningService } from './vpn-provisioning.service';
import { XuiPanelHttpClient } from './xui-panel-http.client';
import { VPN_ADMIN_PROVIDER, VPN_PROVIDER } from './vpn.tokens';

@Module({
  imports: [
    HttpModule.register({
      timeout: 8000,
      maxRedirects: 5,
    }),
  ],
  providers: [
    XuiPanelHttpClient,
    PanelNodeRegistryService,
    NodeQueueRoutingService,
    LoadBalancerService,
    VpnProvisioningService,
    ThreeXUiVpnProvider,
    {
      provide: VPN_PROVIDER,
      useExisting: ThreeXUiVpnProvider,
    },
    {
      provide: VPN_ADMIN_PROVIDER,
      useExisting: ThreeXUiVpnProvider,
    },
  ],
  exports: [
    VpnProvisioningService,
    LoadBalancerService,
    NodeQueueRoutingService,
    PanelNodeRegistryService,
    XuiPanelHttpClient,
    VPN_PROVIDER,
    VPN_ADMIN_PROVIDER,
  ],
})
export class VpnModule {}
