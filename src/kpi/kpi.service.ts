import { Injectable } from '@nestjs/common';
import { SvServices } from '../sv-services/sv.services';

@Injectable()
export class KpiService {
  constructor(private readonly svServices: SvServices) {}

  async getResumenEvolutivoUnidades(
    fechaInicio: string,
    fechaFin: string,
    page: number = 1,
    limit: number = 12,
    tokenSv: string
  ) {
    return await this.svServices.getResumenEvolutivoUnidades(
      fechaInicio,
      fechaFin,
      page,
      limit,
      tokenSv
    );
  }

  async getResumenEvolutivoPorcentajes(
    fechaInicio: string,
    fechaFin: string,
    page: number = 1,
    limit: number = 12,
    tokenSv: string
  ) {
    return await this.svServices.getResumenEvolutivoPorcentajes(
      fechaInicio,
      fechaFin,
      page,
      limit,
      tokenSv
    );
  }

  async getComparativoMensual(
    añoInicio: number,
    añoFin: number,
    tokenSv: string
  ) {
    return await this.svServices.getComparativoMensual(
      añoInicio,
      añoFin,
      tokenSv
    );
  }
}

