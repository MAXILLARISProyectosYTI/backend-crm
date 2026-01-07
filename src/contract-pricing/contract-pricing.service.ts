import { Injectable } from '@nestjs/common';
import { SvServices } from '../sv-services/sv.services';

@Injectable()
export class ContractPricingService {
  constructor(private readonly svServices: SvServices) {}

  /**
   * Obtiene todos los tipos de contratos disponibles
   */
  async getContractTypes() {
    const { tokenSv } = await this.svServices.getTokenSvAdmin();
    return await this.svServices.getAllContractTypeStructure(tokenSv);
  }

  /**
   * Obtiene los precios y descuentos por código de tratamiento
   * @param treatmentCode - Código del tratamiento (ej: OFM_CONTADO, OFM_CUOTAS, MARPE_CONTADO, MARPE_CUOTAS)
   */
  async getPricingByTreatmentCode(treatmentCode: string) {
    const { tokenSv } = await this.svServices.getTokenSvAdmin();
    try {
      return await this.svServices.getContractPricingByTreatmentCode(treatmentCode, tokenSv);
    } catch (error) {
      return null;
    }
  }
}

