import {
  Controller,
  Get,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ContractPricingService } from './contract-pricing.service';

@UseGuards(JwtAuthGuard)
@Controller('contract-pricing')
export class ContractPricingController {
  constructor(private readonly contractPricingService: ContractPricingService) {}

  /**
   * Obtiene todos los tipos de contratos disponibles
   * GET /contract-pricing/types
   */
  @Get('types')
  getContractTypes() {
    return this.contractPricingService.getContractTypes();
  }

  /**
   * Obtiene los precios por código de tratamiento
   * GET /contract-pricing/pricing?treatmentCode=OFM_CONTADO
   */
  @Get('pricing')
  getPricingByTreatmentCode(@Query('treatmentCode') treatmentCode: string) {
    if (!treatmentCode) {
      throw new Error('treatmentCode es requerido');
    }
    return this.contractPricingService.getPricingByTreatmentCode(treatmentCode);
  }
}

