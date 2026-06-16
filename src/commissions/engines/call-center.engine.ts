import { Logger } from '@nestjs/common';
import { IsNull, Repository } from 'typeorm';
import { CommissionPeriod } from '../commission-period.entity';
import { CommissionRecord } from '../commission-record.entity';

export interface CallCenterTarifas {
  ttoOfmContado: [number, number];
  ttoOfmCuotas: [number, number];
  ttoApneaContado: number;
  ttoApneaCuotas: number;
  evaAsistida: [number, number];
  tierTtoOfmContado: number;
  tierEvaAsistida: number;
}

export interface CallCenterBonoTier {
  min: number;
  amount: number;
}

export interface CallCenterConfig {
  minEvaVendidas: number;
  minEvaAsistidas: number;
  tarifas: CallCenterTarifas;
  bonoAsistencias: CallCenterBonoTier[];
  /** Sedes donde aplica bono por asistencias (Lima = 1) */
  bonoAsistenciasCampusIds: number[];
}

export const DEFAULT_CALL_CENTER_CONFIG: CallCenterConfig = {
  minEvaVendidas: 25,
  minEvaAsistidas: 25,
  tarifas: {
    ttoOfmContado: [100, 120],
    ttoOfmCuotas: [50, 60],
    ttoApneaContado: 50,
    ttoApneaCuotas: 25,
    evaAsistida: [15, 20],
    tierTtoOfmContado: 3,
    tierEvaAsistida: 30,
  },
  bonoAsistencias: [
    { min: 50, amount: 800 },
    { min: 40, amount: 600 },
  ],
  bonoAsistenciasCampusIds: [1],
};

export interface CallCenterExecutivoInput {
  userId: string;
  userName: string;
  campusId: number | null;
  campusNombre: string;
  ttoOfmContado: number;
  ttoOfmCuotas: number;
  ttoApneaContado: number;
  ttoApneaCuotas: number;
  evaVendidasOfm: number;
  evaVendidasApnea: number;
  evaAsistidas: number;
}

export interface CallCenterResult {
  userId: string;
  userName: string;
  campusId: number | null;
  evaVendidas: number;
  evaAsistidas: number;
  aplicaGate: boolean;
  comisionTtos: number;
  comisionEvaluaciones: number;
  comisionBono: number;
  comisionTotal: number;
  metricas: CallCenterExecutivoInput;
}

const logger = new Logger('CallCenterEngine');

export function parseCallCenterConfig(period: CommissionPeriod): CallCenterConfig {
  if (!period.notas) return DEFAULT_CALL_CENTER_CONFIG;
  try {
    const parsed = JSON.parse(period.notas) as Partial<CallCenterConfig> & { config?: Partial<CallCenterConfig> };
    const cfg = parsed.config ?? parsed;
    return {
      minEvaVendidas: cfg.minEvaVendidas ?? DEFAULT_CALL_CENTER_CONFIG.minEvaVendidas,
      minEvaAsistidas: cfg.minEvaAsistidas ?? DEFAULT_CALL_CENTER_CONFIG.minEvaAsistidas,
      tarifas: { ...DEFAULT_CALL_CENTER_CONFIG.tarifas, ...(cfg.tarifas ?? {}) },
      bonoAsistencias: cfg.bonoAsistencias ?? DEFAULT_CALL_CENTER_CONFIG.bonoAsistencias,
      bonoAsistenciasCampusIds: cfg.bonoAsistenciasCampusIds ?? DEFAULT_CALL_CENTER_CONFIG.bonoAsistenciasCampusIds,
    };
  } catch {
    return DEFAULT_CALL_CENTER_CONFIG;
  }
}

function pickTierRate(count: number, tierAt: number, rates: [number, number]): number {
  return count >= tierAt ? rates[1] : rates[0];
}

function calcBonoAsistencias(
  evaAsistidas: number,
  campusId: number | null,
  config: CallCenterConfig,
): number {
  if (campusId == null || !config.bonoAsistenciasCampusIds.includes(campusId)) return 0;
  for (const tier of [...config.bonoAsistencias].sort((a, b) => b.min - a.min)) {
    if (evaAsistidas >= tier.min) return tier.amount;
  }
  return 0;
}

export async function calculateCallCenter(
  period: CommissionPeriod,
  config: CallCenterConfig,
  ejecutivos: CallCenterExecutivoInput[],
  recordRepo: Repository<CommissionRecord>,
): Promise<CallCenterResult[]> {
  const results: CallCenterResult[] = [];

  for (const eje of ejecutivos) {
    const evaVendidas = eje.evaVendidasOfm + eje.evaVendidasApnea;
    const aplicaGate = evaVendidas >= config.minEvaVendidas
      && eje.evaAsistidas >= config.minEvaAsistidas;

    const { tarifas } = config;
    const rateOfmContado = pickTierRate(eje.ttoOfmContado, tarifas.tierTtoOfmContado, tarifas.ttoOfmContado);
    const rateOfmCuotas = pickTierRate(
      eje.ttoOfmContado + eje.ttoOfmCuotas,
      tarifas.tierTtoOfmContado,
      tarifas.ttoOfmCuotas,
    );
    const rateEva = pickTierRate(eje.evaAsistidas, tarifas.tierEvaAsistida, tarifas.evaAsistida);

    const comisionTtos = aplicaGate
      ? eje.ttoOfmContado * rateOfmContado
        + eje.ttoOfmCuotas * rateOfmCuotas
        + eje.ttoApneaContado * tarifas.ttoApneaContado
        + eje.ttoApneaCuotas * tarifas.ttoApneaCuotas
      : 0;
    const comisionEvaluaciones = aplicaGate ? eje.evaAsistidas * rateEva : 0;
    const comisionBono = aplicaGate
      ? calcBonoAsistencias(eje.evaAsistidas, eje.campusId, config)
      : 0;
    const comisionTotal = Math.round((comisionTtos + comisionEvaluaciones + comisionBono) * 100) / 100;

    logger.debug(
      `CC [${eje.userName}]: gate=${aplicaGate} evV=${evaVendidas} evA=${eje.evaAsistidas} ttos=${comisionTtos} evas=${comisionEvaluaciones} bono=${comisionBono}`,
    );

    const recordMatches = await recordRepo.find({
      where: {
        period: { id: period.id },
        userId: eje.userId,
        campusId: eje.campusId == null ? IsNull() : eje.campusId,
      },
      relations: ['period'],
      order: { id: 'ASC' },
    });
    const record = recordMatches[0] ?? recordRepo.create({
      period,
      userId: eje.userId,
      campusId: eje.campusId ?? null,
      factorEspecial: 1,
    });
    for (const dup of recordMatches.slice(1)) {
      await recordRepo.delete(dup.id);
    }

    record.userName = eje.userName;
    record.campusNombre = eje.campusNombre;
    record.montoFacturadoSinIgv = evaVendidas;
    record.cantidadUnidades = eje.evaAsistidas;
    record.comisionTtos = Math.round(comisionTtos * 100) / 100;
    record.comisionEvaluaciones = Math.round(comisionEvaluaciones * 100) / 100;
    record.comisionBono = comisionBono;
    record.comisionTotal = comisionTotal;
    record.porcentajeAlcanzado = config.minEvaAsistidas > 0
      ? eje.evaAsistidas / config.minEvaAsistidas
      : 0;
    record.estado = aplicaGate ? 'CALCULADO' : 'PENDIENTE';
    record.notas = JSON.stringify({
      ttoOfmContado: eje.ttoOfmContado,
      ttoOfmCuotas: eje.ttoOfmCuotas,
      ttoApneaContado: eje.ttoApneaContado,
      ttoApneaCuotas: eje.ttoApneaCuotas,
      evaVendidasOfm: eje.evaVendidasOfm,
      evaVendidasApnea: eje.evaVendidasApnea,
      aplicaGate,
    });

    await recordRepo.save(record);

    results.push({
      userId: eje.userId,
      userName: eje.userName,
      campusId: eje.campusId,
      evaVendidas,
      evaAsistidas: eje.evaAsistidas,
      aplicaGate,
      comisionTtos: record.comisionTtos,
      comisionEvaluaciones: record.comisionEvaluaciones,
      comisionBono,
      comisionTotal,
      metricas: eje,
    });
  }

  return results;
}
