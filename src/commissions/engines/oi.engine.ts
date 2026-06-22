import { Logger } from '@nestjs/common';
import { Repository } from 'typeorm';
import { CommissionPeriod } from '../commission-period.entity';
import { CommissionRecord } from '../commission-record.entity';

export interface OiExecutivoInput {
  userId: string;
  userName: string;
  campusId: number | null;
  campusNombre: string;
  /** Monto facturado con IGV del período: evaluaciones OI + plan de tratamiento (SV invoice) */
  montoFacturadoConIgv: number;
  /** Cantidad de evaluaciones OI realizadas en el período */
  cantidadEvaluaciones: number;
}

export interface OiPeriodInput {
  /** Meta de facturación con IGV (objetivo del mes) */
  metaConIgv: number;
  /** Monto objetivo a restar antes del % (normalmente S/ 40,000) */
  montoObjetivoConIgv: number;
  /** Mínimo facturado con IGV para poder comisionar (normalmente S/ 40,000) */
  minimoFacturadoConIgv: number;
  /** Porcentaje fijo sobre tratamientos — siempre 3.5% para OI */
  porcentajeComision: number;
  /** Meta de evaluaciones del equipo (para bono grupal) */
  metaEvaluaciones: number;
  /** Total evaluaciones del equipo en el período */
  totalEvaluacionesEquipo: number;
  /** Config desde BD (notas.config): tarifas por evaluación y bono grupal */
  config?: OiConfig;
}

export interface OiConfig {
  /** S/ por evaluación facturada (default 10) */
  comisionPorEva: number;
  /** Mínimo evaluaciones para pasar a tarifa OFM superior (default 20) */
  minEvaParaTarifaOfm: number;
  /** S/ por evaluación cuando supera el umbral mínimo (default 10, puede diferir) */
  comisionPorEvaOfm: number;
  /** Bono grupal en S/ cuando el equipo alcanza ≥80% de la meta de evaluaciones (default 400) */
  bonoEvaluacionesAsistidas: number;
  /** Umbral mínimo de facturación como % de la meta para activar bono grupal de evals (default 0.8) */
  umbralBonoGrupalEvas: number;
}

export const DEFAULT_OI_CONFIG: OiConfig = {
  comisionPorEva: 10,
  minEvaParaTarifaOfm: 20,
  comisionPorEvaOfm: 10,
  bonoEvaluacionesAsistidas: 400,
  umbralBonoGrupalEvas: 0.8,
};

/** Lee config OI desde period.notas preservando sync metadata. */
export function parseOiConfig(period: CommissionPeriod): OiConfig {
  if (!period.notas) return { ...DEFAULT_OI_CONFIG };
  try {
    const parsed = JSON.parse(period.notas) as { config?: Partial<OiConfig> };
    const cfg = parsed.config ?? {};
    return {
      comisionPorEva:           cfg.comisionPorEva           ?? DEFAULT_OI_CONFIG.comisionPorEva,
      minEvaParaTarifaOfm:      cfg.minEvaParaTarifaOfm      ?? DEFAULT_OI_CONFIG.minEvaParaTarifaOfm,
      comisionPorEvaOfm:        cfg.comisionPorEvaOfm        ?? DEFAULT_OI_CONFIG.comisionPorEvaOfm,
      bonoEvaluacionesAsistidas: cfg.bonoEvaluacionesAsistidas ?? DEFAULT_OI_CONFIG.bonoEvaluacionesAsistidas,
      umbralBonoGrupalEvas:     cfg.umbralBonoGrupalEvas     ?? DEFAULT_OI_CONFIG.umbralBonoGrupalEvas,
    };
  } catch {
    return { ...DEFAULT_OI_CONFIG };
  }
}

export interface OiResult {
  userId: string;
  userName: string;
  montoFacturadoConIgv: number;
  diferencial: number;
  porcentajeComision: number;
  comisionTtos: number;
  cantidadEvaluaciones: number;
  comisionEvaluaciones: number;
  bonoEvaluacionesAsistidas: number;
  comisionTotal: number;
  aplicaComisionTtos: boolean;
}

const logger = new Logger('OiEngine');

/** Porcentaje fijo OI — no depende de cantidad de ejecutivas */
export const OI_PORCENTAJE_COMISION_TTOS = 0.035;

export async function calculateOi(
  period: CommissionPeriod,
  periodInput: OiPeriodInput,
  ejecutivos: OiExecutivoInput[],
  recordRepo: Repository<CommissionRecord>,
): Promise<OiResult[]> {
  // Parámetros de tarifa desde BD (notas.config) con fallback a defaults
  const cfg: OiConfig = periodInput.config ?? parseOiConfig(period);

  const {
    montoObjetivoConIgv,
    minimoFacturadoConIgv,
    porcentajeComision,
    metaEvaluaciones,
    totalEvaluacionesEquipo,
  } = periodInput;

  const pct = porcentajeComision > 0 ? porcentajeComision : OI_PORCENTAJE_COMISION_TTOS;

  const porcentajeCumplimientoEvas = metaEvaluaciones > 0
    ? totalEvaluacionesEquipo / metaEvaluaciones
    : 0;
  const bonoGrupal = porcentajeCumplimientoEvas >= cfg.umbralBonoGrupalEvas
    ? cfg.bonoEvaluacionesAsistidas
    : 0;

  const results: OiResult[] = [];

  for (const eje of ejecutivos) {
    const facturado = eje.montoFacturadoConIgv;
    const aplicaComisionTtos = facturado >= minimoFacturadoConIgv;
    const diferencial = aplicaComisionTtos
      ? Math.max(0, facturado - montoObjetivoConIgv)
      : 0;
    const comisionTtos = aplicaComisionTtos
      ? Math.round(diferencial * pct * 100) / 100
      : 0;

    // Tarifa por evaluación: si supera el umbral usa la tarifa OFM (puede ser distinta)
    const tarifaEva = eje.cantidadEvaluaciones >= cfg.minEvaParaTarifaOfm
      ? cfg.comisionPorEvaOfm
      : cfg.comisionPorEva;
    const comisionEvaluaciones = eje.cantidadEvaluaciones * tarifaEva;
    const comisionTotal = comisionTtos + comisionEvaluaciones + bonoGrupal;

    logger.debug(
      `OI [${eje.userName}]: facturado=${facturado} | min=${minimoFacturadoConIgv} | objetivo=${montoObjetivoConIgv} | dif=${diferencial} | pct=${pct * 100}% | ttos=${comisionTtos} | evas=${comisionEvaluaciones} | bono=${bonoGrupal}`,
    );

    const recordMatches = await recordRepo.find({
      where: { period: { id: period.id }, userId: eje.userId },
      relations: ['period'],
      order: { id: 'ASC' },
    });
    const record = recordMatches[0] ?? recordRepo.create({
      period,
      userId: eje.userId,
      campusId: eje.campusId ?? null,
      factorEspecial: 1,
    });
    // Evita duplicados por campus_id distinto en el mismo período
    for (const dup of recordMatches.slice(1)) {
      await recordRepo.delete(dup.id);
    }

    record.userName = eje.userName;
    record.campusNombre = eje.campusNombre;
    record.montoFacturadoConIgv = facturado;
    record.cantidadUnidades = eje.cantidadEvaluaciones;
    record.comisionTtos = comisionTtos;
    record.comisionEvaluaciones = comisionEvaluaciones;
    record.comisionBono = bonoGrupal;
    record.comisionTotal = comisionTotal;
    record.porcentajeAlcanzado = periodInput.metaConIgv > 0 ? facturado / periodInput.metaConIgv : 0;
    record.estado = 'CALCULADO';

    await recordRepo.save(record);

    results.push({
      userId: eje.userId,
      userName: eje.userName,
      montoFacturadoConIgv: facturado,
      diferencial,
      porcentajeComision: pct,
      comisionTtos,
      cantidadEvaluaciones: eje.cantidadEvaluaciones,
      comisionEvaluaciones,
      bonoEvaluacionesAsistidas: bonoGrupal,
      comisionTotal,
      aplicaComisionTtos,
    });
  }

  return results;
}
