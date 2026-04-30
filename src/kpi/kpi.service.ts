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
    tokenSv: string,
    campusIds?: number[],
  ) {
    return await this.svServices.getResumenEvolutivoUnidades(
      fechaInicio,
      fechaFin,
      page,
      limit,
      tokenSv,
      campusIds,
    );
  }

  async getResumenEvolutivoPorcentajes(
    fechaInicio: string,
    fechaFin: string,
    page: number = 1,
    limit: number = 12,
    tokenSv: string,
    campusIds?: number[],
  ) {
    return await this.svServices.getResumenEvolutivoPorcentajes(
      fechaInicio,
      fechaFin,
      page,
      limit,
      tokenSv,
      campusIds,
    );
  }

  async getComparativoMensual(
    añoInicio: number,
    añoFin: number,
    tokenSv: string,
    campusIds?: number[],
  ) {
    return await this.svServices.getComparativoMensual(
      añoInicio,
      añoFin,
      tokenSv,
      campusIds,
    );
  }

  // Endpoints específicos para gráficos anuales
  async getComparativoVendidasAnual(
    añoInicio: number,
    añoFin: number,
    tokenSv: string,
    campusIds?: number[],
  ) {
    return await this.svServices.getComparativoVendidasAnual(
      añoInicio,
      añoFin,
      tokenSv,
      campusIds,
    );
  }

  async getComparativoAsistidasAnual(
    añoInicio: number,
    añoFin: number,
    tokenSv: string,
    campusIds?: number[],
  ) {
    return await this.svServices.getComparativoAsistidasAnual(
      añoInicio,
      añoFin,
      tokenSv,
      campusIds,
    );
  }

  async getComparativoMoldesAnual(
    añoInicio: number,
    añoFin: number,
    tokenSv: string,
    campusIds?: number[],
  ) {
    return await this.svServices.getComparativoMoldesAnual(
      añoInicio,
      añoFin,
      tokenSv,
      campusIds,
    );
  }

  async getComparativoTratamientosAnual(
    añoInicio: number,
    añoFin: number,
    tokenSv: string,
    campusIds?: number[],
  ) {
    return await this.svServices.getComparativoTratamientosAnual(
      añoInicio,
      añoFin,
      tokenSv,
      campusIds,
    );
  }

  // Endpoints específicos para gráficos mensuales
  async getComparativoVendidasMes(
    añoInicio: number,
    añoFin: number,
    mes: string,
    tokenSv: string,
    campusIds?: number[],
  ) {
    return await this.svServices.getComparativoVendidasMes(
      añoInicio,
      añoFin,
      mes,
      tokenSv,
      campusIds,
    );
  }

  async getComparativoAsistidasMes(
    añoInicio: number,
    añoFin: number,
    mes: string,
    tokenSv: string,
    campusIds?: number[],
  ) {
    return await this.svServices.getComparativoAsistidasMes(
      añoInicio,
      añoFin,
      mes,
      tokenSv,
      campusIds,
    );
  }

  async getComparativoMoldesMes(
    añoInicio: number,
    añoFin: number,
    mes: string,
    tokenSv: string,
    campusIds?: number[],
  ) {
    return await this.svServices.getComparativoMoldesMes(
      añoInicio,
      añoFin,
      mes,
      tokenSv,
      campusIds,
    );
  }

  async getComparativoTratamientosMes(
    añoInicio: number,
    añoFin: number,
    mes: string,
    tokenSv: string,
    campusIds?: number[],
  ) {
    return await this.svServices.getComparativoTratamientosMes(
      añoInicio,
      añoFin,
      mes,
      tokenSv,
      campusIds,
    );
  }
}
