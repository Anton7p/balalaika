import { Injectable } from '@nestjs/common';
import type {
  PaymentCheckoutInput,
  PaymentProvider,
} from './payment-provider.interface';

/**
 * Базовый провайдер подтверждения оплаты.
 * При переходе на внешний PSP заменяется через DI в BillingModule.
 */
@Injectable()
export class InternalPaymentProvider implements PaymentProvider {
  async confirmPaid(_input: PaymentCheckoutInput): Promise<void> {
    return Promise.resolve();
  }
}
