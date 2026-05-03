import { Inject, Injectable } from '@nestjs/common';
import type {
  PaymentCheckoutInput,
  PaymentProvider,
} from './payment-provider.interface';
import { PAYMENT_PROVIDER } from './billing.tokens';

@Injectable()
export class BillingService {
  constructor(
    @Inject(PAYMENT_PROVIDER) private readonly payments: PaymentProvider,
  ) {}

  async confirmCheckout(input: PaymentCheckoutInput): Promise<void> {
    await this.payments.confirmPaid(input);
  }
}
