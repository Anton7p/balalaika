import { Module } from '@nestjs/common';
import { BillingService } from './billing.service';
import { PAYMENT_PROVIDER } from './billing.tokens';
import { StubPaymentProvider } from './stub-payment.provider';

@Module({
  providers: [
    BillingService,
    {
      provide: PAYMENT_PROVIDER,
      useClass: StubPaymentProvider,
    },
  ],
  exports: [BillingService],
})
export class BillingModule {}
