import { Injectable } from '@nestjs/common';
import {
  ACCESS_PRICES,
  type AccessPriceOption,
} from '../common/content/access-prices';

/**
 * Единая точка доступа к каталогу тарифов для доменных сервисов (избегаем дублирования импортов контента).
 */
@Injectable()
export class PricingCatalogService {
  findPlanLabel(planMonths: number): string {
    const row = ACCESS_PRICES.find((p) => p.months === planMonths);
    return row?.label ?? `${planMonths} мес.`;
  }

  getPlans(): readonly AccessPriceOption[] {
    return ACCESS_PRICES;
  }
}
