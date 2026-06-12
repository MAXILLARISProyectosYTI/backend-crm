import { Logger } from '@nestjs/common';
import { Repository } from 'typeorm';
import { CommissionPeriod } from '../commission-period.entity';
import { CommissionRecord } from '../commission-record.entity';

export interface ControlesEjecutivoInput {
  userId: string;
  userName: string;
  campusId: number;
  campusNombre: string;
  /** Monto facturado sin IGV individual del ejecutivo en el período */
  montoFacturadoSinIgv: number;
  /** Meta monto sin IGV individual del ejecutivo */
  metaMontoSinIgv: number;
  /** Distribución base asignada a este ejecutivo para el período */
  dbAsignada: number;
  /**
   * Factor especial:
   * - Jenny Aguirre Lobaton → 0.01 (1% constante, configurable en BD)
   * - Resto → 1.0
   */
  factorEspecial: number;
}

export interface ControlesPeriodInput {
  /** Monto facturado sin IGV GRUPAL de la sede en el período */
  montoGrupalFacturadoSinIgv: number;
  /** Meta monto sin IGV GRUPAL de la sede */
  metaGrupalSinIgv: number;
  /** Distribución base total del grupo en la sede */
  dbTotal: number;
}

export interface ControlesResult {
  userId: string;
  userName: string;
  campusId: number;
  montoFacturadoSinIgv: number;
  metaMontoSinIgv: number;
  porcentajeAlcanzado: number;
  dbAsignada: number;
  factorEspecial: number;
  comisionBase: number;
  comisionTotal: number;
  aplica: boolean;
}

const logger = new Logger('ControlesEngine');

const MIN_PORCENTAJE_ALCANZADO = 0.8;
const MAX_PORCENTAJE_ALCANZADO = 1.5;

export async function calculateControles(
  period: CommissionPeriod,
  periodInput: ControlesPeriodInput,
  ejecutivos: ControlesEjecutivoInput[],
  recordRepo: Repository<CommissionRecord>,
): Promise<ControlesResult[]> {
  const { metaGrupalSinIgv, montoGrupalFacturadoSinIgv } = periodInput;

  const porcentajeGrupal = metaGrupalSinIgv > 0
    ? montoGrupalFacturadoSinIgv / metaGrupalSinIgv
    : 0;

  logger.log(
    `Controles [campus ${period.campusId}]: grupal=${montoGrupalFacturadoSinIgv} / meta=${metaGrupalSinIgv} = ${(porcentajeGrupal * 100).toFixed(1)}%`,
  );

  const results: ControlesResult[] = [];

  for (const eje of ejecutivos) {
    const porcentajeIndividual = eje.metaMontoSinIgv > 0
      ? Math.min(eje.montoFacturadoSinIgv / eje.metaMontoSinIgv, MAX_PORCENTAJE_ALCANZADO)
      : 0;

    const aplica = porcentajeIndividual >= MIN_PORCENTAJE_ALCANZADO;
    let comisionBase = 0;

    if (aplica) {
      comisionBase = eje.dbAsignada * porcentajeIndividual;
    }

    const comisionTotal = Math.round(comisionBase * eje.factorEspecial * 100) / 100;

    logger.debug(
      `Controles [${eje.userName}] campus ${eje.campusId}: pct=${(porcentajeIndividual * 100).toFixed(1)}% | dbAsignada=${eje.dbAsignada} | factor=${eje.factorEspecial} | comision=${comisionTotal}`,
    );

    const existing = await recordRepo.findOne({
      where: { period: { id: period.id }, userId: eje.userId, campusId: eje.campusId },
      relations: ['period'],
    });
    const record = existing ?? recordRepo.create({ period, userId: eje.userId, campusId: eje.campusId });

    record.userName = eje.userName;
    record.campusNombre = eje.campusNombre;
    record.montoFacturadoSinIgv = eje.montoFacturadoSinIgv;
    record.dbAsignada = eje.dbAsignada;
    record.factorEspecial = eje.factorEspecial;
    record.porcentajeAlcanzado = porcentajeIndividual;
    record.comisionTtos = aplica ? comisionBase : 0;
    record.comisionTotal = comisionTotal;
    record.estado = 'CALCULADO';

    await recordRepo.save(record);

    results.push({
      userId: eje.userId,
      userName: eje.userName,
      campusId: eje.campusId,
      montoFacturadoSinIgv: eje.montoFacturadoSinIgv,
      metaMontoSinIgv: eje.metaMontoSinIgv,
      porcentajeAlcanzado: porcentajeIndividual,
      dbAsignada: eje.dbAsignada,
      factorEspecial: eje.factorEspecial,
      comisionBase,
      comisionTotal,
      aplica,
    });
  }

  return results;
}
