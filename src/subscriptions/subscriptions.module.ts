import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { BillingModule } from '../billing/billing.module';
import { PricingCatalogModule } from '../catalog/pricing-catalog.module';
import { SUBSCRIPTION_HOOKS_QUEUE } from '../queues/subscription-hooks.queue';
import { VpnModule } from '../vpn/vpn.module';
import { SubscriptionHooksProcessor } from './subscription-hooks.processor';
import { SubscriptionsService } from './subscriptions.service';

@Module({
  imports: [
    BillingModule,
    VpnModule,
    PricingCatalogModule,
    BullModule.registerQueue({
      name: SUBSCRIPTION_HOOKS_QUEUE,
    }),
  ],
  providers: [SubscriptionsService, SubscriptionHooksProcessor],
  exports: [SubscriptionsService],
})
export class SubscriptionsModule {}
