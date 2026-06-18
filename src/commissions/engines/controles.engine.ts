import { Logger } from '@nestjs/common';
import { Repository } from 'typeorm';
import { CommissionPeriod } from '../commission-period.entity';
import { CommissionRecord } from '../commission-record.entity';

export interface ControlesConfig {
  /** Porcentaje mínimo que debe alcanzar la ejecutiva para comisionar (default 0.8 = 80%) */
  minPctComision: number;
  /** Techo de comisión: no se paga por encima de este % de cumplimiento (default 1.5 = 150%) */
  maxPctComision: number;
  /** Monto fijo del bono grupal por ejecutiva cuando el equipo alcanza la meta (default 0). Si > 0, sobrescribe la fórmula de porcentaje */
  bonoGrupalMonto: number;
  /** Porcentaje adicional sobre DB asignada como bono grupal cuando el equipo ≥ umbral (default 0.1 = 10%) */
  bonoGrupalFactor: number;
}

export const DEFAULT_CONTROLES_CONFIG: ControlesConfig = {
  minPctComision: 0.8,
  maxPctComision: 1.5,
  bonoGrupalMonto: 0,
  bonoGrupalFactor: 0.1,
};

/** Lee config Controles desde period.notas.config con fallback a defaults. */
export function parseControlesConfig(period: CommissionPeriod): ControlesConfig {
  if (!period.notas) return { ...DEFAULT_CONTROLES_CONFIG };
  try {
    const parsed = JSON.parse(period.notas) as { config?: Partial<ControlesConfig> };
    const cfg = parsed.config ?? {};
    return {
      minPctComision:   cfg.minPctComision   ?? DEFAULT_CONTROLES_CONFIG.minPctComision,
      maxPctComision:   cfg.maxPctComision   ?? DEFAULT_CONTROLES_CONFIG.maxPctComision,
      bonoGrupalMonto:  cfg.bonoGrupalMonto  ?? DEFAULT_CONTROLES_CONFIG.bonoGrupalMonto,
      bonoGrupalFactor: cfg.bonoGrupalFactor ?? DEFAULT_CONTROLES_CONFIG.bonoGrupalFactor,
    };
  } catch {
    return { ...DEFAULT_CONTROLES_CONFIG };
  }
}

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
  /** Config de umbrales y bonos desde BD (notas.config) */
  config?: ControlesConfig;
}

export interface ControlesResult {
  userId: string;
  userName: string;
  campusId: number;
  montoFacturadoSinIgv: number;
  metaMontoSinIgv: number;
  porcentajeAlcanzado: number;
  porcentajeGrupal: number;
  dbAsignada: number;
  factorEspecial: number;
  comisionBase: number;
  comisionBono: number;
  comisionTotal: number;
  aplica: boolean;
  bonoGrupal: boolean;
}

const logger = new Logger('ControlesEngine');

export async function calculateControles(
  period: CommissionPeriod,
  periodInput: ControlesPeriodInput,
  ejecutivos: ControlesEjecutivoInput[],
  recordRepo: Repository<CommissionRecord>,
): Promise<ControlesResult[]> {
  // Parámetros desde BD (notas.config) con fallback a defaults
  const cfg: ControlesConfig = periodInput.config ?? parseControlesConfig(period);

  const { metaGrupalSinIgv, montoGrupalFacturadoSinIgv } = periodInput;

  const porcentajeGrupal = metaGrupalSinIgv > 0
    ? montoGrupalFacturadoSinIgv / metaGrupalSinIgv
    : 0;

  logger.log(
    `Controles [campus ${period.campusId}]: grupal=${montoGrupalFacturadoSinIgv} / meta=${metaGrupalSinIgv} = ${(porcentajeGrupal * 100).toFixed(1)}% (umbral=${cfg.minPctComision * 100}%)`,
  );

  const results: ControlesResult[] = [];

  // Bono grupal: se activa cuando el equipo alcanza ≥ umbral configurado en BD
  const bonoGrupalActivo = porcentajeGrupal >= cfg.minPctComision && periodInput.dbTotal > 0;

  logger.log(
    `Controles bono grupal: ${bonoGrupalActivo ? 'ACTIVO' : 'INACTIVO'} (grupal ${(porcentajeGrupal * 100).toFixed(1)}%)`,
  );

  for (const eje of ejecutivos) {
    const porcentajeIndividual = eje.metaMontoSinIgv > 0
      ? Math.min(eje.montoFacturadoSinIgv / eje.metaMontoSinIgv, cfg.maxPctComision)
      : 0;

    const aplica = porcentajeIndividual >= cfg.minPctComision;
    let comisionBase = 0;
    let comisionBono = 0;

    if (aplica) {
      comisionBase = eje.dbAsignada * porcentajeIndividual;
      if (bonoGrupalActivo) {
        // Si hay monto fijo configurado, usarlo; si no, calcular como % de DB
        comisionBono = cfg.bonoGrupalMonto > 0
          ? cfg.bonoGrupalMonto
          : Math.round(eje.dbAsignada * eje.factorEspecial * cfg.bonoGrupalFactor * 100) / 100;
      }
    }

    const comisionTotal = Math.round((comisionBase * eje.factorEspecial + comisionBono) * 100) / 100;

    logger.debug(
      `Controles [${eje.userName}] campus ${eje.campusId}: pct=${(porcentajeIndividual * 100).toFixed(1)}% | dbAsignada=${eje.dbAsignada} | factor=${eje.factorEspecial} | bono=${comisionBono} | total=${comisionTotal}`,
    );

    const existing = await recordRepo.findOne({
      where: { period: { id: period.id }, userId: eje.userId },
      relations: ['period'],
    });
    const record = existing ?? recordRepo.create({
      period,
      userId: eje.userId,
      campusId: eje.campusId ?? null,
    });

    record.userName = eje.userName;
    record.campusNombre = eje.campusNombre;
    record.montoFacturadoSinIgv = eje.montoFacturadoSinIgv;
    record.dbAsignada = eje.dbAsignada;
    record.factorEspecial = eje.factorEspecial;
    record.porcentajeAlcanzado = porcentajeIndividual;
    record.comisionTtos = aplica ? comisionBase : 0;
    record.comisionBono = comisionBono;
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
      porcentajeGrupal,
      dbAsignada: eje.dbAsignada,
      factorEspecial: eje.factorEspecial,
      comisionBase,
      comisionBono,
      comisionTotal,
      aplica,
      bonoGrupal: bonoGrupalActivo && aplica,
    });
  }

  return results;
}
