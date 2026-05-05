import { Module } from '@nestjs/common';
import { BillingService } from './billing.service';
import { PAYMENT_PROVIDER } from './billing.tokens';
import { InternalPaymentProvider } from './internal-payment.provider';

@Module({
  providers: [
    BillingService,
    {
      provide: PAYMENT_PROVIDER,
      useClass: InternalPaymentProvider,
    },
  ],
  exports: [BillingService],
})
export class BillingModule {}
