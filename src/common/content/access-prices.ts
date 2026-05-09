/** Тарифная строка (`months` — внутренний ключ; 0 = бесплатный тест). */
export interface AccessPriceOption {
  readonly months: number;
  readonly price: number;
  readonly label: string;
  readonly devices: number;
}

export const ACCESS_PRICES = [
  {
    months: 0,
    price: 0,
    label: 'Бесплатный тест на 3дн.',
    devices: 2,
  },
  { months: 1, price: 99, label: 'Месяц', devices: 2 },
  { months: 3, price: 279, label: '3 Месяца', devices: 2 },
] as const satisfies readonly AccessPriceOption[];
