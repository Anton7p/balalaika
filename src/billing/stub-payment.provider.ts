import { Injectable } from '@nestjs/common';
import type {
  PaymentCheckoutInput,
  PaymentProvider,
} from './payment-provider.interface';

/**
 * Заглушка PSP: всегда успешное подтверждение (§ Billing в .cursorrules).
 * Замените реализацию через DI при подключении реального провайдера.
 */
@Injectable()
export class StubPaymentProvider implements PaymentProvider {
  async confirmPaid(_input: PaymentCheckoutInput): Promise<void> {
    return Promise.resolve();
  }
}
