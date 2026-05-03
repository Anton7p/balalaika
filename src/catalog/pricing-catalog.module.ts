import { Global, Module } from '@nestjs/common';
import { PricingCatalogService } from './pricing-catalog.service';

@Global()
@Module({
  providers: [PricingCatalogService],
  exports: [PricingCatalogService],
})
export class PricingCatalogModule {}
