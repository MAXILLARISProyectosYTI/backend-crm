import { Module } from '@nestjs/common';
import { ContractPricingController } from './contract-pricing.controller';
import { ContractPricingService } from './contract-pricing.service';
import { SvServices } from '../sv-services/sv.services';

@Module({
  controllers: [ContractPricingController],
  providers: [ContractPricingService, SvServices],
  exports: [ContractPricingService],
})
export class ContractPricingModule {}

