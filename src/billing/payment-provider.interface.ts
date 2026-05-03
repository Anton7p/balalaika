export interface PaymentCheckoutInput {
  readonly userId: string;
  readonly planMonths: number;
  readonly idempotencyKey: string;
}

export interface PaymentProvider {
  confirmPaid(input: PaymentCheckoutInput): Promise<void>;
}
