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

export interface CallCenterTeamBonoConfig {
  /** Pool mensual por team (Excel: S/ 450). */
  poolMonto: number;
  /** Meta de asistencias del team para el 100% del pool (Excel: 128). */
  metaAsistenciasEquipo: number;
}

export interface CallCenterConfig {
  minEvaVendidas: number;
  minEvaAsistidas: number;
  tarifas: CallCenterTarifas;
  bonoAsistencias: CallCenterBonoTier[];
  /** Sedes donde aplica bono individual por asistencias (Lima=1, Arequipa=15). */
  bonoAsistenciasCampusIds: number[];
  bonoTeamLeader: CallCenterTeamBonoConfig;
  /** teamId CRM → login SV del team leader que recibe el bono de equipo. */
  teamLeaderByTeamId: Record<string, string>;
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
  bonoAsistenciasCampusIds: [1, 15],
  bonoTeamLeader: {
    poolMonto: 450,
    metaAsistenciasEquipo: 128,
  },
  teamLeaderByTeamId: {},
};

export interface CallCenterExecutivoInput {
  userId: string;
  userName: string;
  campusId: number | null;
  campusNombre: string;
  crmTeamId?: string | null;
  crmTeamName?: string | null;
  /** OBJ individual (Excel AN). Si no se define, usa minEvaVendidas/minEvaAsistidas del período. */
  minGateObj?: number | null;
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
      bonoTeamLeader: {
        ...DEFAULT_CALL_CENTER_CONFIG.bonoTeamLeader,
        ...(cfg.bonoTeamLeader ?? {}),
      },
      teamLeaderByTeamId: cfg.teamLeaderByTeamId ?? DEFAULT_CALL_CENTER_CONFIG.teamLeaderByTeamId,
    };
  } catch {
    return DEFAULT_CALL_CENTER_CONFIG;
  }
}

function pickTierRate(count: number, tierAt: number, rates: [number, number]): number {
  return count >= tierAt ? rates[1] : rates[0];
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function resolveGateObj(eje: CallCenterExecutivoInput, config: CallCenterConfig): {
  minVend: number;
  minAsist: number;
} {
  const obj = eje.minGateObj ?? null;
  if (obj != null && obj > 0) {
    return { minVend: obj, minAsist: obj };
  }
  return { minVend: config.minEvaVendidas, minAsist: config.minEvaAsistidas };
}

function passesIndividualGate(
  evaVendidasTotal: number,
  evaAsistidasTotal: number,
  minVend: number,
  minAsist: number,
): boolean {
  return evaVendidasTotal >= minVend && evaAsistidasTotal >= minAsist;
}

function calcBonoAsistenciasIndividual(
  evaAsistidasTotal: number,
  campusId: number | null,
  config: CallCenterConfig,
): number {
  if (campusId == null || !config.bonoAsistenciasCampusIds.includes(campusId)) return 0;
  for (const tier of [...config.bonoAsistencias].sort((a, b) => b.min - a.min)) {
    if (evaAsistidasTotal >= tier.min) return tier.amount;
  }
  return 0;
}

function calcTeamLeaderBono(teamAsistencias: number, config: CallCenterConfig): number {
  const { poolMonto, metaAsistenciasEquipo } = config.bonoTeamLeader;
  if (metaAsistenciasEquipo <= 0 || teamAsistencias <= 0) return 0;
  const ratio = Math.min(1, teamAsistencias / metaAsistenciasEquipo);
  return round2(poolMonto * ratio);
}

function pickPrimaryCampusRecordIndex(
  rows: Array<{ campusId: number | null; evaAsistidas: number }>,
): number {
  const limaIdx = rows.findIndex((r) => r.campusId === 1);
  if (limaIdx >= 0) return limaIdx;
  let bestIdx = 0;
  let bestAsist = -1;
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].evaAsistidas > bestAsist) {
      bestAsist = rows[i].evaAsistidas;
      bestIdx = i;
    }
  }
  return bestIdx;
}

interface UserAggregate {
  evaVendidas: number;
  evaAsistidas: number;
  minVend: number;
  minAsist: number;
  aplicaGate: boolean;
  rowIndexes: number[];
}

interface TeamAggregate {
  teamId: string;
  asistencias: number;
  leaderUserId: string | null;
}

export async function calculateCallCenter(
  period: CommissionPeriod,
  config: CallCenterConfig,
  ejecutivos: CallCenterExecutivoInput[],
  recordRepo: Repository<CommissionRecord>,
): Promise<CallCenterResult[]> {
  const results: CallCenterResult[] = [];
  const pendingRows: Array<{
    eje: CallCenterExecutivoInput;
    evaVendidas: number;
    evaAsistidas: number;
    aplicaGate: boolean;
    comisionTtos: number;
    comisionEvaluaciones: number;
    comisionBono: number;
    comisionTotal: number;
    bonoIndividual: number;
    bonoTeamLeader: number;
    crmTeamId: string | null;
  }> = [];

  const userAgg = new Map<string, UserAggregate>();
  for (let i = 0; i < ejecutivos.length; i++) {
    const eje = ejecutivos[i];
    const uid = eje.userId.trim().toLowerCase();
    const evaVend = eje.evaVendidasOfm + eje.evaVendidasApnea;
    const gate = resolveGateObj(eje, config);
    const agg = userAgg.get(uid) ?? {
      evaVendidas: 0,
      evaAsistidas: 0,
      minVend: gate.minVend,
      minAsist: gate.minAsist,
      aplicaGate: false,
      rowIndexes: [],
    };
    agg.evaVendidas += evaVend;
    agg.evaAsistidas += eje.evaAsistidas;
    agg.minVend = gate.minVend;
    agg.minAsist = gate.minAsist;
    agg.rowIndexes.push(i);
    userAgg.set(uid, agg);
  }

  for (const agg of userAgg.values()) {
    agg.aplicaGate = passesIndividualGate(
      agg.evaVendidas,
      agg.evaAsistidas,
      agg.minVend,
      agg.minAsist,
    );
  }

  const teamAgg = new Map<string, TeamAggregate>();
  for (const eje of ejecutivos) {
    const teamId = eje.crmTeamId?.trim();
    if (!teamId) continue;
    const leaderCfg = config.teamLeaderByTeamId[teamId]?.trim().toLowerCase();
    const prev = teamAgg.get(teamId) ?? {
      teamId,
      asistencias: 0,
      leaderUserId: leaderCfg ?? null,
    };
    prev.asistencias += eje.evaAsistidas;
    if (leaderCfg) prev.leaderUserId = leaderCfg;
    teamAgg.set(teamId, prev);
  }

  const teamLeaderBonusByUser = new Map<string, number>();
  for (const team of teamAgg.values()) {
    if (!team.leaderUserId) continue;
    const bono = calcTeamLeaderBono(team.asistencias, config);
    if (bono <= 0) continue;
    const key = team.leaderUserId.toLowerCase();
    teamLeaderBonusByUser.set(key, (teamLeaderBonusByUser.get(key) ?? 0) + bono);
  }

  const bonoIndividualByUser = new Map<string, number>();
  for (const [uid, agg] of userAgg.entries()) {
    if (!agg.aplicaGate) continue;
    const primaryIdx = pickPrimaryCampusRecordIndex(
      agg.rowIndexes.map((i) => ({
        campusId: ejecutivos[i].campusId,
        evaAsistidas: ejecutivos[i].evaAsistidas,
      })),
    );
    const campusId = ejecutivos[agg.rowIndexes[primaryIdx]]?.campusId ?? null;
    const bono = calcBonoAsistenciasIndividual(agg.evaAsistidas, campusId, config);
    if (bono > 0) bonoIndividualByUser.set(uid, bono);
  }

  for (const eje of ejecutivos) {
    const uid = eje.userId.trim().toLowerCase();
    const agg = userAgg.get(uid)!;
    const evaVendidasRow = eje.evaVendidasOfm + eje.evaVendidasApnea;
    const aplicaGate = agg.aplicaGate;

    const { tarifas } = config;
    const rateOfmContado = pickTierRate(eje.ttoOfmContado, tarifas.tierTtoOfmContado, tarifas.ttoOfmContado);
    const rateOfmCuotas = pickTierRate(
      eje.ttoOfmContado + eje.ttoOfmCuotas,
      tarifas.tierTtoOfmContado,
      tarifas.ttoOfmCuotas,
    );
    const rateEva = pickTierRate(agg.evaAsistidas, tarifas.tierEvaAsistida, tarifas.evaAsistida);

    const comisionTtos = aplicaGate
      ? eje.ttoOfmContado * rateOfmContado
        + eje.ttoOfmCuotas * rateOfmCuotas
        + eje.ttoApneaContado * tarifas.ttoApneaContado
        + eje.ttoApneaCuotas * tarifas.ttoApneaCuotas
      : 0;
    const comisionEvaluaciones = aplicaGate ? eje.evaAsistidas * rateEva : 0;

    pendingRows.push({
      eje,
      evaVendidas: evaVendidasRow,
      evaAsistidas: eje.evaAsistidas,
      aplicaGate,
      comisionTtos: round2(comisionTtos),
      comisionEvaluaciones: round2(comisionEvaluaciones),
      comisionBono: 0,
      comisionTotal: 0,
      bonoIndividual: 0,
      bonoTeamLeader: 0,
      crmTeamId: eje.crmTeamId ?? null,
    });
  }

  for (const [uid, agg] of userAgg.entries()) {
    const bonoInd = bonoIndividualByUser.get(uid) ?? 0;
    const bonoLead = teamLeaderBonusByUser.get(uid) ?? 0;
    if (bonoInd <= 0 && bonoLead <= 0) continue;

    const primaryIdx = pickPrimaryCampusRecordIndex(
      agg.rowIndexes.map((i) => ({
        campusId: pendingRows[i].eje.campusId,
        evaAsistidas: pendingRows[i].evaAsistidas,
      })),
    );
    const globalIdx = agg.rowIndexes[primaryIdx];
    pendingRows[globalIdx].bonoIndividual = bonoInd;
    pendingRows[globalIdx].bonoTeamLeader = bonoLead;
    pendingRows[globalIdx].comisionBono = round2(bonoInd + bonoLead);
  }

  for (const row of pendingRows) {
    row.comisionTotal = round2(row.comisionTtos + row.comisionEvaluaciones + row.comisionBono);
  }

  for (const row of pendingRows) {
    const { eje } = row;
    const uid = eje.userId.trim().toLowerCase();
    const agg = userAgg.get(uid)!;

    logger.debug(
      `CC [${eje.userName}@${eje.campusNombre}]: gate=${row.aplicaGate} `
      + `totV=${agg.evaVendidas} totA=${agg.evaAsistidas} obj=${agg.minVend} `
      + `ttos=${row.comisionTtos} evas=${row.comisionEvaluaciones} bono=${row.comisionBono}`,
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
    record.montoFacturadoSinIgv = row.evaVendidas;
    record.cantidadUnidades = row.evaAsistidas;
    record.comisionTtos = row.comisionTtos;
    record.comisionEvaluaciones = row.comisionEvaluaciones;
    record.comisionBono = row.comisionBono;
    record.comisionTotal = row.comisionTotal;
    record.porcentajeAlcanzado = agg.minAsist > 0
      ? agg.evaAsistidas / agg.minAsist
      : 0;
    record.estado = row.aplicaGate ? 'CALCULADO' : 'PENDIENTE';
    record.notas = JSON.stringify({
      ttoOfmContado: eje.ttoOfmContado,
      ttoOfmCuotas: eje.ttoOfmCuotas,
      ttoApneaContado: eje.ttoApneaContado,
      ttoApneaCuotas: eje.ttoApneaCuotas,
      evaVendidasOfm: eje.evaVendidasOfm,
      evaVendidasApnea: eje.evaVendidasApnea,
      evaVendidasSede: row.evaVendidas,
      evaAsistidasSede: row.evaAsistidas,
      evaVendidasTotal: agg.evaVendidas,
      evaAsistidasTotal: agg.evaAsistidas,
      minGateObj: agg.minVend,
      aplicaGate: row.aplicaGate,
      aplicaGateIndividual: row.aplicaGate,
      bonoIndividual: row.bonoIndividual,
      bonoTeamLeader: row.bonoTeamLeader,
      crmTeamId: eje.crmTeamId ?? null,
      crmTeamName: eje.crmTeamName ?? null,
    });

    await recordRepo.save(record);

    results.push({
      userId: eje.userId,
      userName: eje.userName,
      campusId: eje.campusId,
      evaVendidas: agg.evaVendidas,
      evaAsistidas: row.evaAsistidas,
      aplicaGate: row.aplicaGate,
      comisionTtos: row.comisionTtos,
      comisionEvaluaciones: row.comisionEvaluaciones,
      comisionBono: row.comisionBono,
      comisionTotal: row.comisionTotal,
      metricas: eje,
    });
  }

  return results;
}
