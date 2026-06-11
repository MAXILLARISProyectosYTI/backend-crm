import { Logger } from '@nestjs/common';
import { IsNull, Repository, type FindOptionsWhere } from 'typeorm';
import { CommissionPeriod } from '../commission-period.entity';
import { CommissionRecord } from '../commission-record.entity';

export interface OiExecutivoInput {
  userId: string;
  userName: string;
  campusId: number | null;
  campusNombre: string;
  /** Monto facturado con IGV del período (contratos OI, sin evaluaciones) */
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

const COMISION_FIJA_POR_EVA_OI = 10;
const COMISION_POR_EVA_OFM = 10;
const MIN_EVA_PARA_TARIFA_OFM = 20;
const BONO_EVALUACIONES_ASISTIDAS = 400;

export async function calculateOi(
  period: CommissionPeriod,
  periodInput: OiPeriodInput,
  ejecutivos: OiExecutivoInput[],
  recordRepo: Repository<CommissionRecord>,
): Promise<OiResult[]> {
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
  const bonoGrupal = porcentajeCumplimientoEvas >= 0.8 ? BONO_EVALUACIONES_ASISTIDAS : 0;

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

    const tarifaEva = eje.cantidadEvaluaciones >= MIN_EVA_PARA_TARIFA_OFM
      ? COMISION_POR_EVA_OFM
      : COMISION_FIJA_POR_EVA_OI;
    const comisionEvaluaciones = eje.cantidadEvaluaciones * tarifaEva;
    const comisionTotal = comisionTtos + comisionEvaluaciones + bonoGrupal;

    logger.debug(
      `OI [${eje.userName}]: facturado=${facturado} | min=${minimoFacturadoConIgv} | objetivo=${montoObjetivoConIgv} | dif=${diferencial} | pct=${pct * 100}% | ttos=${comisionTtos} | evas=${comisionEvaluaciones} | bono=${bonoGrupal}`,
    );

    const recordWhere: FindOptionsWhere<CommissionRecord> = {
      period: { id: period.id },
      userId: eje.userId,
      campusId: eje.campusId != null ? eje.campusId : IsNull(),
    };
    const existing = await recordRepo.findOne({
      where: recordWhere,
      relations: ['period'],
    });
    const record = existing ?? recordRepo.create({
      period,
      userId: eje.userId,
      campusId: eje.campusId ?? null,
      factorEspecial: 1,
    });

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
