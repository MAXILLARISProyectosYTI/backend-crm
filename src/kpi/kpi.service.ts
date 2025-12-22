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

  // Endpoints específicos para gráficos anuales
  async getComparativoVendidasAnual(
    añoInicio: number,
    añoFin: number,
    tokenSv: string
  ) {
    return await this.svServices.getComparativoVendidasAnual(
      añoInicio,
      añoFin,
      tokenSv
    );
  }

  async getComparativoAsistidasAnual(
    añoInicio: number,
    añoFin: number,
    tokenSv: string
  ) {
    return await this.svServices.getComparativoAsistidasAnual(
      añoInicio,
      añoFin,
      tokenSv
    );
  }

  async getComparativoMoldesAnual(
    añoInicio: number,
    añoFin: number,
    tokenSv: string
  ) {
    return await this.svServices.getComparativoMoldesAnual(
      añoInicio,
      añoFin,
      tokenSv
    );
  }

  async getComparativoTratamientosAnual(
    añoInicio: number,
    añoFin: number,
    tokenSv: string
  ) {
    return await this.svServices.getComparativoTratamientosAnual(
      añoInicio,
      añoFin,
      tokenSv
    );
  }

  // Endpoints específicos para gráficos mensuales
  async getComparativoVendidasMes(
    añoInicio: number,
    añoFin: number,
    mes: string,
    tokenSv: string
  ) {
    return await this.svServices.getComparativoVendidasMes(
      añoInicio,
      añoFin,
      mes,
      tokenSv
    );
  }

  async getComparativoAsistidasMes(
    añoInicio: number,
    añoFin: number,
    mes: string,
    tokenSv: string
  ) {
    return await this.svServices.getComparativoAsistidasMes(
      añoInicio,
      añoFin,
      mes,
      tokenSv
    );
  }

  async getComparativoMoldesMes(
    añoInicio: number,
    añoFin: number,
    mes: string,
    tokenSv: string
  ) {
    return await this.svServices.getComparativoMoldesMes(
      añoInicio,
      añoFin,
      mes,
      tokenSv
    );
  }

  async getComparativoTratamientosMes(
    añoInicio: number,
    añoFin: number,
    mes: string,
    tokenSv: string
  ) {
    return await this.svServices.getComparativoTratamientosMes(
      añoInicio,
      añoFin,
      mes,
      tokenSv
    );
  }
}

