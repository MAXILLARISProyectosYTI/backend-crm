import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, FindOptionsWhere, IsNull, Repository } from 'typeorm';
import { CommissionPeriod } from './commission-period.entity';
import { CommissionRecord } from './commission-record.entity';
import { CommissionType } from './commission-type.entity';
import { CommissionDetail } from './commission-detail.entity';
import { CommissionClosureTag } from './commission-closure-tag.entity';
import { CommissionPeriodRate } from './commission-period-rate.entity';
import { CommissionCerradoraSedeApoyo } from './commission-cerradora-sede-apoyo.entity';
import { CrmControlesService } from '../crm-controles/crm-controles.service';
import { SvServices } from '../sv-services/sv.services';
import { calculateControles, type ControlesEjecutivoInput, type ControlesPeriodInput } from './engines/controles.engine';
import { calculateOi, OI_PORCENTAJE_COMISION_TTOS, type OiExecutivoInput, type OiPeriodInput } from './engines/oi.engine';
import {
  calculateCallCenter,
  DEFAULT_CALL_CENTER_CONFIG,
  parseCallCenterConfig,
  type CallCenterExecutivoInput,
} from './engines/call-center.engine';
import { calculateCierreTto, type ContractSvRow, type CierreTtoSedeConfig } from './engines/cierre-tto.engine';
import {
  buildCrmCommissionDates,
  indexLatestByQuotation,
  mapTratamientoFromCrm,
  parseModalidadFromCrmFields,
  resolveCrmContractId,
  type CerradorasCrmPresaveRow,
  type CerradorasCrmSolicitudRow,
} from '../crm-cerradoras/utils/cerradoras-crm-contract.util';
import {
  hasCloserGestionEvidence,
  isCloserWinStatus,
  parsePresaveHasRegisteredPayments,
} from '../crm-cerradoras/utils/closer-commission.util';
import { SUB_CAMPAIGN_NAMES, TEAMS_IDS, ROLES_IDS } from '../globals/ids';
import {
  type OiCrmUserMetrics,
} from './utils/oi-crm-metrics.util';
import { OiSvInvoiceService } from './services/oi-sv-invoice.service';

const CERRADORAS_TEAM_ID = TEAMS_IDS.CERRADORAS;
const OI_TEAM_ID = TEAMS_IDS.EJ_COMERCIAL_OI;
const TEAM_AREQUIPA_ID = TEAMS_IDS.TEAM_AREQUIPA;
const TEAM_TRUJILLO_ID = TEAMS_IDS.TEAM_TRUJILLO;
/** Incrementar cuando cambie la lógica de sync CRM/SV para recalcular períodos ya sincronizados. */
const CIERRE_TTO_SYNC_VERSION = 9;
const CERRADORAS_OI_PORCENTAJE_DEFAULT = 0.02;

/** Plantilla de ejecutivas Controles cuando no hay mes anterior configurado. */
const CONTROLES_EJECUTIVO_TEMPLATE: Record<
  number,
  Array<{
    userId: string;
    userName: string;
    dbAsignada: number;
    factorEspecial: number;
    metaMontoIndividual: number;
  }>
> = {
  1: [
    { userId: 'jenny.aguirre', userName: 'Jenny Aguirre', dbAsignada: 1200, factorEspecial: 0.01, metaMontoIndividual: 50903.5 },
    { userId: 'priscila.cristina', userName: 'Priscila Cristina', dbAsignada: 1200, factorEspecial: 1, metaMontoIndividual: 50903.5 },
  ],
  15: [
    { userId: 'hermaioni.seijas', userName: 'Hermaioni Seijas', dbAsignada: 210, factorEspecial: 1, metaMontoIndividual: 6000 },
  ],
};

const CONTROLES_DEFAULT_META: Record<number, { metaMontoSinIgv: number; dbTotal: number }> = {
  1: { metaMontoSinIgv: 101807, dbTotal: 2400 },
  15: { metaMontoSinIgv: 15254.24, dbTotal: 210 },
  16: { metaMontoSinIgv: 0, dbTotal: 0 },
};

export interface CerradorasEjecutivoCatalogItem {
  userId: string;
  userName: string;
  userLogin: string | null;
  campusId: number;
  campusNombre: string;
}

export type VentasStaffCommissionArea = 'CALL_CENTER' | 'OI' | 'ALL';

export interface VentasStaffMember {
  userId: string;
  crmUserId: string;
  userName: string;
  userLogin: string | null;
  campusId: number;
  campusNombre: string;
  rol: string;
  rolLabel: string;
  teamId: string;
  teamName: string | null;
}

export interface VentasStaffGrupo {
  rol: string;
  rolLabel: string;
  miembros: VentasStaffMember[];
}

export interface VentasStaffSede {
  campusId: number;
  campusNombre: string;
  grupos: VentasStaffGrupo[];
}

export interface VentasStaffCatalog {
  sedes: VentasStaffSede[];
  all: VentasStaffMember[];
  ejecutivosPayload: Array<{
    userId: string;
    userName: string;
    campusId: number;
    campusNombre: string;
  }>;
}

const VENTAS_STAFF_TEAM_META: Record<
  string,
  { rol: string; rolLabel: string; areas: VentasStaffCommissionArea[] }
> = {
  [TEAMS_IDS.EJ_COMERCIAL]: {
    rol: 'EJ_COMERCIAL',
    rolLabel: 'Call Center / Ejecutivo comercial',
    areas: ['CALL_CENTER', 'ALL'],
  },
  [TEAMS_IDS.EJ_COMERCIAL_OI]: {
    rol: 'OI',
    rolLabel: 'Ejecutiva OI',
    areas: ['OI', 'ALL'],
  },
  [TEAMS_IDS.EJ_COMERCIAL_APNEA]: {
    rol: 'APNEA',
    rolLabel: 'Ejecutiva Apnea',
    areas: ['CALL_CENTER', 'ALL'],
  },
  [TEAMS_IDS.TEAM_FIORELLA]: {
    rol: 'EJ_COMERCIAL',
    rolLabel: 'Ejecutiva comercial — equipo Fiorella',
    areas: ['CALL_CENTER', 'ALL'],
  },
  [TEAMS_IDS.TEAM_MICHELL]: {
    rol: 'EJ_COMERCIAL',
    rolLabel: 'Ejecutiva comercial — equipo Michell',
    areas: ['CALL_CENTER', 'ALL'],
  },
  [TEAMS_IDS.TEAM_VERONICA]: {
    rol: 'EJ_COMERCIAL',
    rolLabel: 'Ejecutiva comercial — equipo Verónica',
    areas: ['CALL_CENTER', 'ALL'],
  },
  [TEAMS_IDS.TEAM_AREQUIPA]: {
    rol: 'EQUIPO_SEDE',
    rolLabel: 'Equipo comercial Arequipa',
    areas: ['CALL_CENTER', 'ALL'],
  },
  [TEAMS_IDS.TEAM_TRUJILLO]: {
    rol: 'EQUIPO_SEDE',
    rolLabel: 'Equipo comercial Trujillo',
    areas: ['CALL_CENTER', 'ALL'],
  },
};

const VENTAS_STAFF_CAMPUS_ORDER = [1, 15, 16];
const VENTAS_STAFF_ROL_ORDER = [
  'EJ_COMERCIAL',
  'APNEA',
  'OI',
  'TEAM_LEADER',
  'EQUIPO_SEDE',
];

const IGV_RATE = 1.18;

export interface CommissionDashboardEjecutivo {
  userId: string;
  userName: string | null;
  campusId: number | null;
  montoFacturadoSinIgv: number;
  metaMontoSinIgv: number;
  porcentajeAlcanzado: number;
  dbAsignada: number;
  factorEspecial: number;
  comisionBase: number;
  comisionTotal: number;
  aplica: boolean;
  estado: string;
  comisionTtos?: number;
  comisionEvaluaciones?: number;
  comisionBono?: number;
  comisionOi?: number;
  montoFacturadoOiConIgv?: number;
  porcentajeSedeApoyo?: number | null;
  cantidadEvaluaciones?: number;
  diferencial?: number;
  cantidadCierres?: number;
}

export interface CommissionDetalleLinea {
  userId: string;
  userName: string | null;
  contractId: number | null;
  quotationId: number | null;
  tratamiento: string | null;
  modalidad: string | null;
  timing: string | null;
  modifier: string | null;
  cuotaNum: number | null;
  descripcion: string;
  importe: number;
  campusId?: number | null;
}

export interface CommissionExportUsuario {
  userId: string;
  userName: string | null;
  loginSv: string;
  campusId: number | null;
  campusNombre: string;
  comisionTotal: number;
  filasResumen: number;
}

export interface CommissionExportFactLine {
  tipo: 'facturacion' | 'eval_vendida' | 'eval_asistida';
  ejecutivoLogin: string;
  ejecutivoNombre: string | null;
  campusId: number | null;
  campusNombre: string;
  paciente: string | null;
  historia: string | null;
  fecha: string | null;
  concepto: string | null;
  monto: number | null;
  moneda: string | null;
  comprobante: string | null;
  estado: string | null;
  facturador: string | null;
}

export interface CommissionExportDetail {
  area: string;
  source: string;
  usuarios: CommissionExportUsuario[];
  facturacion: CommissionExportFactLine[];
  comisiones: CommissionDetalleLinea[];
}

export interface CommissionDashboard {
  period: {
    id: number;
    year: number;
    month: number;
    area: string;
    campusId: number | null;
    campusNombre: string | null;
    estado: string;
    metaMontoSinIgv: number | null;
    metaMontoConIgv: number | null;
    dbTotal: number | null;
    baseFijaConIgv: number | null;
    nEjecutivas: number | null;
    porcentajeComision: number | null;
    objEvaluaciones: number | null;
    metaCantidad?: number | null;
    bonoPersonalTtosThreshold?: number | null;
    bonoPersonalAmount?: number | null;
    bonoEquipoTtosThreshold?: number | null;
    bonoEquipoAmount?: number | null;
    porcentajeComisionOi?: number | null;
  };
  facturacionGrupalSinIgv: number;
  porcentajeGrupal: number;
  totalComision: number;
  lastSyncAt: string | null;
  ejecutivos: CommissionDashboardEjecutivo[];
  chartData: Array<{ name: string; meta: number; actual: number; comision: number }>;
  detalleLineas?: CommissionDetalleLinea[];
  chartByTratamiento?: Array<{ name: string; value: number }>;
  chartByModalidad?: Array<{ name: string; value: number }>;
  pendingClosures?: number;
  cerradorasCatalog?: CerradorasEjecutivoCatalogItem[];
  syncStats?: { contractsTotal: number; contractsCrm: number; contractsSv: number };
  /** sv-invoice-db | sin-datos */
  dataSource?: string;
  /** Mensaje de error del SV si la sync directa falló */
  svError?: string | null;
  /** Diagnóstico sync OI (filas invoice, ejecutivas con datos) */
  oiSyncStats?: {
    factRowCount: number;
    evalGroupCount: number;
    ejecutivasConDatos: number;
    facturadoTotal: number;
  };
}

@Injectable()
export class CommissionsDataService {
  private readonly logger = new Logger(CommissionsDataService.name);

  constructor(
    @InjectRepository(CommissionPeriod)
    private readonly periodRepo: Repository<CommissionPeriod>,
    @InjectRepository(CommissionRecord)
    private readonly recordRepo: Repository<CommissionRecord>,
    @InjectRepository(CommissionType)
    private readonly typeRepo: Repository<CommissionType>,
    @InjectRepository(CommissionDetail)
    private readonly detailRepo: Repository<CommissionDetail>,
    @InjectRepository(CommissionClosureTag)
    private readonly tagRepo: Repository<CommissionClosureTag>,
    @InjectRepository(CommissionPeriodRate)
    private readonly rateRepo: Repository<CommissionPeriodRate>,
    @InjectRepository(CommissionCerradoraSedeApoyo)
    private readonly sedeApoyoRepo: Repository<CommissionCerradoraSedeApoyo>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly crmControlesService: CrmControlesService,
    private readonly svServices: SvServices,
    private readonly oiSvInvoiceService: OiSvInvoiceService,
  ) {}

  private monthRange(year: number, month: number): { start: string; end: string } {
    const start = `${year}-${String(month).padStart(2, '0')}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const end = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    return { start, end };
  }

  private parsePeriodSyncMeta(notas: string | null): {
    syncedAt?: string;
    syncVersion?: number;
    contractsTotal?: number;
    contractsCrm?: number;
    contractsSv?: number;
  } | null {
    if (!notas) return null;
    try {
      const parsed = JSON.parse(notas) as Record<string, unknown>;
      if (parsed && typeof parsed === 'object' && parsed.syncedAt) {
        return {
          syncedAt: String(parsed.syncedAt),
          syncVersion: parsed.syncVersion != null ? Number(parsed.syncVersion) : 1,
          contractsTotal: parsed.contractsTotal != null ? Number(parsed.contractsTotal) : undefined,
          contractsCrm: parsed.contractsCrm != null ? Number(parsed.contractsCrm) : undefined,
          contractsSv: parsed.contractsSv != null ? Number(parsed.contractsSv) : undefined,
        };
      }
    } catch {
      /* notas en texto plano */
    }
    return null;
  }

  private sedeApoyoPeriodColumnExists: boolean | null = null;

  /** Detecta si la migración period_id ya corrió en BD (prod puede estar atrasada). */
  private async hasSedeApoyoPeriodColumn(): Promise<boolean> {
    if (this.sedeApoyoPeriodColumnExists !== null) return this.sedeApoyoPeriodColumnExists;
    try {
      const rows: Array<{ ok: number }> = await this.dataSource.query(
        `SELECT 1 AS ok FROM information_schema.columns
         WHERE table_name = 'commission_cerradora_sede_apoyo'
           AND column_name = 'period_id'
         LIMIT 1`,
      );
      this.sedeApoyoPeriodColumnExists = Array.isArray(rows) && rows.length > 0;
    } catch {
      this.sedeApoyoPeriodColumnExists = false;
    }
    return this.sedeApoyoPeriodColumnExists;
  }

  private mapSedeApoyoRows(rows: Array<{
    id: number;
    userId: string;
    campusId: number;
    porcentaje: string | number;
    activo: boolean;
    periodId?: number | null;
  }>): Array<{
    id: number;
    userId: string;
    campusId: number;
    porcentaje: number;
    activo: boolean;
    periodId: number | null;
  }> {
    return rows.map((r) => ({
      id: r.id,
      userId: r.userId,
      campusId: r.campusId,
      porcentaje: Number(r.porcentaje),
      activo: r.activo,
      periodId: r.periodId ?? null,
    }));
  }

  /** Siempre SQL directo — evita fallos TypeORM cuando period_id no existe o está en transición. */
  private async querySedeApoyoRows(periodId?: number): Promise<Array<{
    id: number;
    userId: string;
    campusId: number;
    porcentaje: number;
    activo: boolean;
    periodId: number | null;
  }>> {
    const hasPeriodCol = await this.hasSedeApoyoPeriodColumn();
    if (hasPeriodCol && periodId != null) {
      const rows = await this.dataSource.query(
        `SELECT id, user_id AS "userId", campus_id AS "campusId", porcentaje, activo, period_id AS "periodId"
         FROM commission_cerradora_sede_apoyo
         WHERE activo = true AND period_id = $1
         ORDER BY user_id ASC`,
        [periodId],
      );
      return this.mapSedeApoyoRows(rows);
    }
    if (hasPeriodCol) {
      const rows = await this.dataSource.query(
        `SELECT id, user_id AS "userId", campus_id AS "campusId", porcentaje, activo, period_id AS "periodId"
         FROM commission_cerradora_sede_apoyo
         WHERE activo = true
         ORDER BY user_id ASC`,
      );
      return this.mapSedeApoyoRows(rows);
    }
    const rows = await this.dataSource.query(
      `SELECT id, user_id AS "userId", campus_id AS "campusId", porcentaje, activo
       FROM commission_cerradora_sede_apoyo
       WHERE activo = true
       ORDER BY user_id ASC`,
    );
    return this.mapSedeApoyoRows(rows);
  }

  private async findSedeApoyoActive(periodId?: number): Promise<Array<{
    id: number;
    userId: string;
    campusId: number;
    porcentaje: number;
    activo: boolean;
    periodId: number | null;
  }>> {
    return this.querySedeApoyoRows(periodId);
  }

  private async countSedeApoyoForPeriod(periodId: number): Promise<number> {
    const hasPeriodCol = await this.hasSedeApoyoPeriodColumn();
    if (!hasPeriodCol) {
      const rows = await this.querySedeApoyoRows();
      return rows.length;
    }
    const rows: Array<{ cnt: string }> = await this.dataSource.query(
      `SELECT COUNT(*)::text AS cnt FROM commission_cerradora_sede_apoyo
       WHERE activo = true AND period_id = $1`,
      [periodId],
    );
    return Number(rows[0]?.cnt ?? 0);
  }

  private async savePeriodSyncMeta(
    period: CommissionPeriod,
    stats: { contractsTotal: number; contractsCrm: number; contractsSv: number },
  ): Promise<void> {
    period.notas = JSON.stringify({
      syncedAt: new Date().toISOString(),
      syncVersion: CIERRE_TTO_SYNC_VERSION,
      ...stats,
    });
    await this.periodRepo.save(period);
  }

  /** Un cierre entra al mes si moldes, primer abono, fecha de contrato u otras fechas caen en el rango. */
  private contractInCommissionMonth(
    start: string,
    end: string,
    contractDate: string | null | undefined,
    moldesDate: string | null | undefined,
    firstPaymentDate: string | null | undefined,
    extraDates: Array<string | null | undefined> = [],
  ): boolean {
    const days = [
      moldesDate?.slice(0, 10),
      firstPaymentDate?.slice(0, 10),
      contractDate?.slice(0, 10),
      ...extraDates.map((d) => d?.slice(0, 10)),
    ].filter(Boolean) as string[];
    return days.some((d) => d >= start && d <= end);
  }

  async clearCierreTtoCalculatedData(periodId: number): Promise<void> {
    const records = await this.recordRepo.find({ where: { period: { id: periodId } } });
    for (const rec of records) {
      await this.detailRepo.delete({ record: { id: rec.id } });
      rec.comisionTotal = 0;
      rec.comisionTtos = 0;
      rec.comisionBono = 0;
      rec.comisionOi = 0;
      rec.montoFacturadoOiConIgv = 0;
      rec.cantidadUnidades = 0;
      rec.estado = 'PENDIENTE';
      await this.recordRepo.save(rec);
    }
  }

  async getCierreTtoDashboard(periodId: number): Promise<CommissionDashboard> {
    const period = await this.periodRepo.findOne({ where: { id: periodId } });
    if (!period) throw new Error(`Período ${periodId} no encontrado`);
    try {
      return await this.syncAndCalculateCierreTto(periodId);
    } catch (err) {
      this.logger.error(
        `getCierreTtoDashboard ${periodId}: ${err instanceof Error ? err.message : err}`,
      );
      return this.buildDashboard(periodId);
    }
  }

  private parseDate(value: unknown): Date | null {
    if (!value) return null;
    const d = new Date(String(value));
    return Number.isNaN(d.getTime()) ? null : d;
  }

  private amountSinIgv(amount: number): number {
    return Math.round((amount / IGV_RATE) * 100) / 100;
  }

  private inMonth(date: Date, year: number, month: number): boolean {
    return date.getFullYear() === year && date.getMonth() + 1 === month;
  }

  private periodWhere(
    year: number,
    month: number,
    area: CommissionPeriod['area'],
    campusId?: number,
  ): FindOptionsWhere<CommissionPeriod> {
    return {
      year,
      month,
      area,
      campusId: campusId != null ? campusId : IsNull(),
    };
  }

  /** Resuelve período cuando campusId no viene (ej. filtro "Todas" en reportes). */
  private async findPeriodForDashboard(
    year: number,
    month: number,
    area: CommissionPeriod['area'],
    campusId?: number,
  ): Promise<CommissionPeriod | null> {
    if (area === 'CIERRE_TTO') {
      const global = await this.periodRepo.findOne({
        where: { year, month, area, campusId: IsNull() },
      });
      if (global) return global;
      const any = await this.periodRepo.findOne({
        where: { year, month, area },
        order: { campusId: 'ASC' },
      });
      return any;
    }

    if (campusId != null) {
      const candidates = this.commissionCampusCandidates(campusId);
      for (const cid of candidates) {
        const period = await this.periodRepo.findOne({
          where: this.periodWhere(year, month, area, cid),
        });
        if (period) return period;
      }
      return null;
    }

    const periods = await this.periodRepo.find({
      where: { year, month, area },
      order: { campusId: 'ASC' },
    });
    if (periods.length === 0) return null;
    if (periods.length === 1) return periods[0];

    return (
      periods.find((p) => Number(p.campusId) === 1)
      ?? periods.find((p) => Number(p.campusId) === 15)
      ?? periods[0]
    );
  }

  /** IDs equivalentes: oportunidades CRM vs comisiones Controles (Lima=1, Arequipa=15). */
  private commissionCampusCandidates(campusId: number): number[] {
    const id = Number(campusId);
    if (id === 18) return [15, 18];
    if (id === 15) return [15, 18];
    return [id];
  }

  private mapCommissionCampusId(raw: number | null | undefined): number {
    const id = Number(raw ?? 1);
    if (id === 18 || id === 15) return 15;
    return id || 1;
  }

  private commissionCampusNombre(campusId: number): string {
    if (campusId === 1) return 'Lima';
    if (campusId === 15) return 'Arequipa';
    if (campusId === 16) return 'Trujillo';
    return `Sede ${campusId}`;
  }

  private matchesFilterCampus(recordCampusId: number | null | undefined, filterCampusId?: number): boolean {
    if (filterCampusId == null) return true;
    const candidates = this.commissionCampusCandidates(filterCampusId);
    return candidates.includes(Number(recordCampusId));
  }

  async initPeriodRates(periodId: number): Promise<void> {
    const period = await this.periodRepo.findOne({ where: { id: periodId } });
    if (!period || period.area !== 'CIERRE_TTO') return;

    const existing = await this.rateRepo.count({ where: { periodId } });
    if (existing > 0) return;

    const types = await this.typeRepo.find({ where: { area: 'CIERRE_TTO', active: true } });
    const rows = types.map((t) => this.rateRepo.create({
      periodId,
      typeCode: t.code,
      amount: Number(t.amount),
    }));
    if (rows.length > 0) {
      await this.rateRepo.save(rows);
    }
  }

  async copyPeriodRatesFromPrevious(period: CommissionPeriod): Promise<void> {
    const prevMonth = period.month === 1 ? 12 : period.month - 1;
    const prevYear = period.month === 1 ? period.year - 1 : period.year;
    const prev = await this.periodRepo.findOne({
      where: { year: prevYear, month: prevMonth, area: 'CIERRE_TTO', campusId: IsNull() },
    });
    if (!prev) {
      await this.initPeriodRates(period.id);
      return;
    }

    const prevRates = await this.rateRepo.find({ where: { periodId: prev.id } });
    if (prevRates.length === 0) {
      await this.initPeriodRates(period.id);
      return;
    }

    const rows = prevRates.map((r) => this.rateRepo.create({
      periodId: period.id,
      typeCode: r.typeCode,
      amount: Number(r.amount),
    }));
    await this.rateRepo.save(rows);
  }

  async getPeriodRatesMap(periodId: number): Promise<Map<string, number>> {
    await this.initPeriodRates(periodId);
    const rates = await this.rateRepo.find({ where: { periodId } });
    return new Map(rates.map((r) => [r.typeCode, Number(r.amount)]));
  }

  async getPeriodRates(periodId: number) {
    const period = await this.periodRepo.findOne({ where: { id: periodId } });
    if (!period) throw new Error(`Período ${periodId} no encontrado`);
    await this.initPeriodRates(periodId);

    const types = await this.typeRepo.find({
      where: { area: 'CIERRE_TTO', active: true },
      order: { tratamiento: 'ASC', modalidad: 'ASC', cuotaNum: 'ASC' },
    });
    const overrides = await this.rateRepo.find({ where: { periodId } });
    const overrideMap = new Map(overrides.map((r) => [r.typeCode, Number(r.amount)]));

    return {
      period: {
        id: period.id,
        year: period.year,
        month: period.month,
        bonoPersonalTtosThreshold: Number(period.bonoPersonalTtosThreshold ?? 45),
        bonoPersonalAmount: Number(period.bonoPersonalAmount ?? 500),
        bonoEquipoTtosThreshold: Number(period.bonoEquipoTtosThreshold ?? 75),
        bonoEquipoAmount: Number(period.bonoEquipoAmount ?? 1000),
        porcentajeComisionOi: Number(period.porcentajeComisionOi ?? CERRADORAS_OI_PORCENTAJE_DEFAULT),
      },
      rates: types.map((t) => ({
        typeCode: t.code,
        description: t.description,
        tratamiento: t.tratamiento,
        modalidad: t.modalidad,
        timing: t.timing,
        modifier: t.modifier,
        cuotaNum: t.cuotaNum,
        defaultAmount: Number(t.amount),
        amount: overrideMap.get(t.code) ?? Number(t.amount),
        customized: overrideMap.has(t.code),
      })),
    };
  }

  async upsertPeriodRates(
    periodId: number,
    rates: Array<{ typeCode: string; amount: number }>,
    bonus?: {
      bonoPersonalTtosThreshold?: number;
      bonoPersonalAmount?: number;
      bonoEquipoTtosThreshold?: number;
      bonoEquipoAmount?: number;
      porcentajeComisionOi?: number;
    },
  ): Promise<void> {
    const period = await this.periodRepo.findOne({ where: { id: periodId } });
    if (!period || period.area !== 'CIERRE_TTO') {
      throw new Error('Solo se configuran tarifas en períodos CIERRE_TTO');
    }

    for (const item of rates) {
      const existing = await this.rateRepo.findOne({
        where: { periodId, typeCode: item.typeCode },
      });
      const row = existing ?? this.rateRepo.create({ periodId, typeCode: item.typeCode });
      row.amount = item.amount;
      await this.rateRepo.save(row);
    }

    if (bonus?.bonoPersonalTtosThreshold != null) {
      period.bonoPersonalTtosThreshold = bonus.bonoPersonalTtosThreshold;
    }
    if (bonus?.bonoPersonalAmount != null) period.bonoPersonalAmount = bonus.bonoPersonalAmount;
    if (bonus?.bonoEquipoTtosThreshold != null) {
      period.bonoEquipoTtosThreshold = bonus.bonoEquipoTtosThreshold;
    }
    if (bonus?.bonoEquipoAmount != null) period.bonoEquipoAmount = bonus.bonoEquipoAmount;
    if (bonus?.porcentajeComisionOi != null) {
      period.porcentajeComisionOi = bonus.porcentajeComisionOi;
    }
    await this.periodRepo.save(period);
  }

  async ensurePeriod(
    year: number,
    month: number,
    area: CommissionPeriod['area'],
    campusId?: number,
  ): Promise<CommissionPeriod> {
    const resolvedCampusId = area === 'CIERRE_TTO' ? null : (campusId ?? null);
    const existing = await this.periodRepo.findOne({
      where: this.periodWhere(year, month, area, resolvedCampusId ?? undefined),
    });
    if (existing) return existing;

    const period = this.periodRepo.create({
      year,
      month,
      area,
      campusId: resolvedCampusId,
      estado: 'BORRADOR',
      notas: area === 'CIERRE_TTO' ? 'Período automático cerradoras' : null,
      bonoPersonalTtosThreshold: area === 'CIERRE_TTO' ? 45 : null,
      bonoPersonalAmount: area === 'CIERRE_TTO' ? 500 : null,
      bonoEquipoTtosThreshold: area === 'CIERRE_TTO' ? 75 : null,
      bonoEquipoAmount: area === 'CIERRE_TTO' ? 1000 : null,
      porcentajeComisionOi: area === 'CIERRE_TTO' ? CERRADORAS_OI_PORCENTAJE_DEFAULT : null,
    });
    const saved = await this.periodRepo.save(period);
    if (area === 'CIERRE_TTO') {
      await this.copyPeriodRatesFromPrevious(saved);
      await this.copySedeApoyoFromPrevious(saved);
    }
    return saved;
  }

  /** Crea período OI si no existe (copia meta/ejecutivos del mes anterior si hay). */
  private async ensureOiPeriod(year: number, month: number): Promise<CommissionPeriod> {
    const existing = await this.periodRepo.findOne({
      where: { year, month, area: 'OI', campusId: IsNull() },
    });
    if (existing) {
      await this.ensureOiEjecutivosConfigured(existing);
      return existing;
    }

    const prevMonth = month === 1 ? 12 : month - 1;
    const prevYear = month === 1 ? year - 1 : year;
    const prev = await this.periodRepo.findOne({
      where: { year: prevYear, month: prevMonth, area: 'OI', campusId: IsNull() },
    });

    const period = await this.periodRepo.save(this.periodRepo.create({
      year,
      month,
      area: 'OI',
      campusId: null,
      metaMontoConIgv: prev?.metaMontoConIgv ?? 90000,
      metaMontoSinIgv: prev?.metaMontoSinIgv ?? Math.round((90000 / 1.18) * 100) / 100,
      baseFijaConIgv: prev?.baseFijaConIgv ?? 40000,
      objEvaluaciones: prev?.objEvaluaciones ?? 20,
      porcentajeComision: prev?.porcentajeComision ?? 0.035,
      estado: 'BORRADOR',
    }));

    if (prev) {
      const prevRecords = await this.recordRepo.find({ where: { period: { id: prev.id } } });
      for (const rec of prevRecords) {
        await this.recordRepo.save(this.recordRepo.create({
          period,
          userId: rec.userId,
          userName: rec.userName,
          campusId: rec.campusId,
          campusNombre: rec.campusNombre,
          factorEspecial: rec.factorEspecial ?? 1,
          estado: 'PENDIENTE',
        }));
      }
    }
    return period;
  }

  /** Garantiza ejecutivas OI en el período (equipo OI + login SV). */
  private async ensureOiEjecutivosConfigured(period: CommissionPeriod): Promise<void> {
    await this.normalizePeriodRecordSvKeys(period.id);

    const { ejecutivosPayload } = await this.listVentasStaffCatalog('OI');
    if (ejecutivosPayload.length === 0) return;

    const existing = await this.recordRepo.find({
      where: { period: { id: period.id } },
      relations: ['period'],
    });
    const existingKeys = new Set(
      existing.map((r) => `${r.userId.trim().toLowerCase()}::${r.campusId ?? 'all'}`),
    );

    for (const eje of ejecutivosPayload) {
      const key = `${eje.userId.toLowerCase()}::${eje.campusId ?? 'all'}`;
      if (existingKeys.has(key)) continue;
      await this.recordRepo.save(this.recordRepo.create({
        period,
        userId: eje.userId,
        userName: eje.userName,
        campusId: eje.campusId ?? null,
        campusNombre: eje.campusNombre ?? this.commissionCampusNombre(eje.campusId),
        factorEspecial: 1,
        estado: 'PENDIENTE',
      }));
      existingKeys.add(key);
    }
  }

  /** Corrige userId en records (UUID CRM → login SV) para cruce con facturación. */
  private async normalizePeriodRecordSvKeys(periodId: number): Promise<void> {
    const records = await this.recordRepo.find({ where: { period: { id: periodId } } });
    for (const rec of records) {
      const svKey = await this.resolveCommissionSvKey(rec.userId);
      const normalized = svKey.trim().toLowerCase();
      if (normalized === rec.userId.trim().toLowerCase()) continue;

      const duplicate = await this.recordRepo.findOne({
        where: { period: { id: periodId }, userId: normalized },
      });
      if (duplicate && duplicate.id !== rec.id) {
        await this.detailRepo.delete({ record: { id: rec.id } });
        await this.recordRepo.delete(rec.id);
        continue;
      }
      rec.userId = normalized;
      await this.recordRepo.save(rec);
    }
  }

  /** Miembros del equipo Ejecutivas OI (CRM). userId = login SV para cruce con facturación. */
  async listOiEjecutivos(): Promise<Array<{ userId: string; userName: string; userLogin: string | null }>> {
    const catalog = await this.listVentasStaffCatalog('OI');
    const seen = new Set<string>();
    return catalog.all.filter((m) => {
      const key = m.userId;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).map((m) => ({
      userId: m.userId,
      userName: m.userName,
      userLogin: m.userLogin,
    }));
  }

  /**
   * Catálogo comercial por sede (Lima / Arequipa / Trujillo) y rol, desde team_user + campus.
   */
  async listVentasStaffCatalog(
    area: VentasStaffCommissionArea = 'ALL',
  ): Promise<VentasStaffCatalog> {
    const teamIds = Object.keys(VENTAS_STAFF_TEAM_META).filter((teamId) => {
      const meta = VENTAS_STAFF_TEAM_META[teamId];
      return area === 'ALL' || meta.areas.includes(area);
    });

    if (teamIds.length === 0) {
      return { sedes: [], all: [], ejecutivosPayload: [] };
    }

    const rows: Array<{
      crm_user_id: string;
      display_name: string | null;
      user_login: string | null;
      sv_login: string | null;
      team_id: string;
      team_name: string | null;
      is_arequipa: number;
      is_trujillo: number;
    }> = await this.dataSource.query(
      `
      SELECT
        u.id AS crm_user_id,
        COALESCE(
          NULLIF(TRIM(CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, ''))), ''),
          u.user_name
        ) AS display_name,
        u.user_name AS user_login,
        LOWER(TRIM(COALESCE(NULLIF(TRIM(u.c_usersv), ''), u.user_name, u.id))) AS sv_login,
        tu.team_id,
        t.name AS team_name,
        MAX(CASE WHEN tu_areq.team_id = $2 THEN 1 ELSE 0 END)::int AS is_arequipa,
        MAX(CASE WHEN tu_truj.team_id = $3 THEN 1 ELSE 0 END)::int AS is_trujillo
      FROM "user" u
      INNER JOIN team_user tu ON tu.user_id = u.id
        AND tu.team_id = ANY($1::varchar[])
        AND COALESCE(tu.deleted, false) = false
      LEFT JOIN team t ON t.id = tu.team_id
      LEFT JOIN team_user tu_areq ON tu_areq.user_id = u.id
        AND tu_areq.team_id = $2
        AND COALESCE(tu_areq.deleted, false) = false
      LEFT JOIN team_user tu_truj ON tu_truj.user_id = u.id
        AND tu_truj.team_id = $3
        AND COALESCE(tu_truj.deleted, false) = false
      WHERE COALESCE(u.deleted, false) = false
        AND COALESCE(u.is_active, true) = true
        AND NOT EXISTS (
          SELECT 1 FROM role_user ru
          WHERE ru.user_id = u.id
            AND COALESCE(ru.deleted, false) = false
            AND ru.role_id IN ('${ROLES_IDS.CERRADORA}', '${ROLES_IDS.ASISTENTE_COMERCIAL}')
        )
        AND EXISTS (
          SELECT 1 FROM role_user ru_ok
          WHERE ru_ok.user_id = u.id
            AND COALESCE(ru_ok.deleted, false) = false
            AND ru_ok.role_id IN ('${ROLES_IDS.EJ_COMERCIAL}', '${ROLES_IDS.TEAM_LEADER_COMERCIAL}')
        )
      GROUP BY u.id, u.user_name, u.first_name, u.last_name, u.c_usersv, tu.team_id, t.name
      ORDER BY display_name ASC NULLS LAST, u.user_name ASC
      `,
      [teamIds, TEAM_AREQUIPA_ID, TEAM_TRUJILLO_ID],
    );

    const all: VentasStaffMember[] = [];
    for (const row of rows) {
      const teamMeta = VENTAS_STAFF_TEAM_META[row.team_id];
      if (!teamMeta) continue;
      if (area !== 'ALL' && !teamMeta.areas.includes(area)) continue;
      const svLogin = String(row.sv_login ?? '').trim();
      if (!svLogin) continue;

      let campusId = 1;
      if (Number(row.is_trujillo) === 1) campusId = 16;
      else if (Number(row.is_arequipa) === 1) campusId = 15;

      all.push({
        userId: svLogin,
        crmUserId: row.crm_user_id,
        userName: row.display_name ?? row.user_login ?? svLogin,
        userLogin: row.user_login,
        campusId,
        campusNombre: this.commissionCampusNombre(campusId),
        rol: teamMeta.rol,
        rolLabel: teamMeta.rolLabel,
        teamId: row.team_id,
        teamName: row.team_name,
      });
    }

    // Team leaders: solo rol Team Leader Comercial (no todo el equipo TL genérico).
    if (area === 'ALL' || area === 'CALL_CENTER') {
      const leaderRows: Array<{
        crm_user_id: string;
        display_name: string | null;
        user_login: string | null;
        sv_login: string | null;
        is_arequipa: number;
        is_trujillo: number;
      }> = await this.dataSource.query(
        `
        SELECT
          u.id AS crm_user_id,
          COALESCE(
            NULLIF(TRIM(CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, ''))), ''),
            u.user_name
          ) AS display_name,
          u.user_name AS user_login,
          LOWER(TRIM(COALESCE(NULLIF(TRIM(u.c_usersv), ''), u.user_name, u.id))) AS sv_login,
          MAX(CASE WHEN tu_areq.team_id = $2 THEN 1 ELSE 0 END)::int AS is_arequipa,
          MAX(CASE WHEN tu_truj.team_id = $3 THEN 1 ELSE 0 END)::int AS is_trujillo
        FROM "user" u
        INNER JOIN role_user ru ON ru.user_id = u.id
          AND ru.role_id = $1
          AND COALESCE(ru.deleted, false) = false
        LEFT JOIN team_user tu_areq ON tu_areq.user_id = u.id
          AND tu_areq.team_id = $2
          AND COALESCE(tu_areq.deleted, false) = false
        LEFT JOIN team_user tu_truj ON tu_truj.user_id = u.id
          AND tu_truj.team_id = $3
          AND COALESCE(tu_truj.deleted, false) = false
        WHERE COALESCE(u.deleted, false) = false
          AND COALESCE(u.is_active, true) = true
          AND NOT EXISTS (
            SELECT 1 FROM role_user ru_x
            WHERE ru_x.user_id = u.id
              AND COALESCE(ru_x.deleted, false) = false
              AND ru_x.role_id IN ('${ROLES_IDS.CERRADORA}', '${ROLES_IDS.ASISTENTE_COMERCIAL}')
          )
        GROUP BY u.id, u.user_name, u.first_name, u.last_name, u.c_usersv
        ORDER BY display_name ASC NULLS LAST
        `,
        [ROLES_IDS.TEAM_LEADER_COMERCIAL, TEAM_AREQUIPA_ID, TEAM_TRUJILLO_ID],
      );

      for (const row of leaderRows) {
        const svLogin = String(row.sv_login ?? '').trim();
        if (!svLogin) continue;
        let campusId = 1;
        if (Number(row.is_trujillo) === 1) campusId = 16;
        else if (Number(row.is_arequipa) === 1) campusId = 15;
        all.push({
          userId: svLogin,
          crmUserId: row.crm_user_id,
          userName: row.display_name ?? row.user_login ?? svLogin,
          userLogin: row.user_login,
          campusId,
          campusNombre: this.commissionCampusNombre(campusId),
          rol: 'TEAM_LEADER',
          rolLabel: 'Team Leader comercial',
          teamId: TEAMS_IDS.TEAM_LEADERS_COMERCIALES,
          teamName: 'Team Leaders Comerciales',
        });
      }
    }

    const sedeMap = new Map<number, Map<string, VentasStaffMember[]>>();
    for (const campusId of VENTAS_STAFF_CAMPUS_ORDER) {
      sedeMap.set(campusId, new Map());
    }

    for (const member of all) {
      const rolMap = sedeMap.get(member.campusId) ?? new Map<string, VentasStaffMember[]>();
      if (!sedeMap.has(member.campusId)) sedeMap.set(member.campusId, rolMap);
      const list = rolMap.get(member.rol) ?? [];
      const dup = list.some(
        (m) => m.userId === member.userId && m.teamId === member.teamId,
      );
      if (!dup) list.push(member);
      rolMap.set(member.rol, list);
    }

    const sedes: VentasStaffSede[] = VENTAS_STAFF_CAMPUS_ORDER
      .map((campusId) => {
        const rolMap = sedeMap.get(campusId);
        if (!rolMap || rolMap.size === 0) return null;
        const grupos: VentasStaffGrupo[] = VENTAS_STAFF_ROL_ORDER
          .filter((rol) => rolMap.has(rol))
          .map((rol) => {
            const miembros = rolMap.get(rol)!;
            const rolLabel = miembros[0]?.rolLabel ?? rol;
            return { rol, rolLabel, miembros };
          });
        return {
          campusId,
          campusNombre: this.commissionCampusNombre(campusId),
          grupos,
        };
      })
      .filter((s): s is VentasStaffSede => s != null);

    const ejecutivosPayload: VentasStaffCatalog['ejecutivosPayload'] = [];
    const payloadKeys = new Set<string>();
    for (const member of all) {
      // Solo ejecutivas y team leaders en payload de comisiones (no duplicar TL como ejecutiva).
      const isLeader = member.rol === 'TEAM_LEADER';
      const isExec = member.rol === 'EJ_COMERCIAL' || member.rol === 'APNEA' || member.rol === 'OI' || member.rol === 'EQUIPO_SEDE';
      if (area === 'CALL_CENTER' && !isLeader && !isExec) continue;
      if (area === 'OI' && member.rol !== 'OI') continue;

      const key = `${member.userId}::${member.campusId}`;
      if (payloadKeys.has(key)) continue;
      payloadKeys.add(key);
      ejecutivosPayload.push({
        userId: member.userId,
        userName: member.userName,
        campusId: member.campusId,
        campusNombre: member.campusNombre,
      });
    }

    return { sedes, all, ejecutivosPayload };
  }

  /** Resuelve login SV / username → id CRM canónico. */
  private async resolveCrmUserId(raw: string): Promise<string> {
    const key = raw.trim();
    if (!key) return key;
    const map = await this.buildCrmUsernameToUserIdMap();
    return map.get(key.toLowerCase()) ?? key;
  }

  /**
   * Clave para commission_record.userId — login SV (c_usersv / user_name).
   * Igual que Controles: debe coincidir con ejecutivo_controles / ejecutivo_oi en SV.
   */
  private async resolveCommissionSvKey(raw: string): Promise<string> {
    const key = raw.trim();
    if (!key) return key;
    const rows: Array<{ id: string; user_name: string | null; c_usersv: string | null }> =
      await this.dataSource.query(
        `SELECT id, user_name, c_usersv FROM "user"
         WHERE id = $1
            OR LOWER(user_name) = LOWER($1)
            OR LOWER(c_usersv) = LOWER($1)
         LIMIT 1`,
        [key],
      );
    const row = rows[0];
    if (row) {
      return String(row.c_usersv ?? row.user_name ?? row.id).trim().toLowerCase();
    }
    return key.toLowerCase();
  }

  /**
   * Último período Controles (misma sede) anterior al mes objetivo que tenga ejecutivas.
   */
  private async findLatestControlesTemplate(
    campusId: number,
    beforeYear: number,
    beforeMonth: number,
  ): Promise<{ period: CommissionPeriod; records: CommissionRecord[] } | null> {
    const mappedCampus = this.mapCommissionCampusId(campusId);
    const periods = await this.periodRepo
      .createQueryBuilder('p')
      .where('p.area = :area', { area: 'CONTROLES' })
      .andWhere('p.campus_id = :campusId', { campusId: mappedCampus })
      .andWhere(
        '(p.year < :year OR (p.year = :year AND p.month < :month))',
        { year: beforeYear, month: beforeMonth },
      )
      .orderBy('p.year', 'DESC')
      .addOrderBy('p.month', 'DESC')
      .getMany();

    for (const period of periods) {
      const records = await this.recordRepo.find({ where: { period: { id: period.id } } });
      if (records.length > 0) {
        return { period, records };
      }
    }
    return null;
  }

  private async copyControlesRecordsToPeriod(
    target: CommissionPeriod,
    sourceRecords: CommissionRecord[],
    mappedCampus: number,
  ): Promise<void> {
    for (const rec of sourceRecords) {
      await this.recordRepo.save(this.recordRepo.create({
        period: target,
        userId: rec.userId,
        userName: rec.userName,
        campusId: mappedCampus,
        campusNombre: this.commissionCampusNombre(mappedCampus),
        dbAsignada: rec.dbAsignada,
        factorEspecial: rec.factorEspecial ?? 1,
        metaMontoIndividual: rec.metaMontoIndividual,
        estado: 'PENDIENTE',
      }));
    }
  }

  private async seedControlesDefaultEjecutivos(
    period: CommissionPeriod,
    mappedCampus: number,
  ): Promise<void> {
    const templates = CONTROLES_EJECUTIVO_TEMPLATE[mappedCampus] ?? [];
    for (const tpl of templates) {
      await this.recordRepo.save(this.recordRepo.create({
        period,
        userId: tpl.userId,
        userName: tpl.userName,
        campusId: mappedCampus,
        campusNombre: this.commissionCampusNombre(mappedCampus),
        dbAsignada: tpl.dbAsignada,
        factorEspecial: tpl.factorEspecial,
        metaMontoIndividual: tpl.metaMontoIndividual,
        estado: 'PENDIENTE',
      }));
    }
  }

  /** Garantiza ejecutivas en un período Controles (backfill meses creados vacíos). */
  private async ensureControlesEjecutivosConfigured(period: CommissionPeriod): Promise<void> {
    await this.normalizePeriodRecordSvKeys(period.id);

    const existing = await this.recordRepo.count({ where: { period: { id: period.id } } });
    if (existing > 0) return;

    const mappedCampus = this.mapCommissionCampusId(period.campusId ?? 1);
    const template = await this.findLatestControlesTemplate(
      mappedCampus,
      period.year,
      period.month,
    );

    if (template) {
      if (
        (period.metaMontoSinIgv == null || Number(period.metaMontoSinIgv) === 0)
        && template.period.metaMontoSinIgv != null
      ) {
        period.metaMontoSinIgv = template.period.metaMontoSinIgv;
      }
      if (
        (period.dbTotal == null || Number(period.dbTotal) === 0)
        && template.period.dbTotal != null
      ) {
        period.dbTotal = template.period.dbTotal;
      }
      await this.periodRepo.save(period);
      await this.copyControlesRecordsToPeriod(period, template.records, mappedCampus);
      this.logger.log(
        `Controles ${period.year}-${period.month} campus ${mappedCampus}: ejecutivas copiadas desde ${template.period.year}-${template.period.month}`,
      );
      return;
    }

    const defaults = CONTROLES_DEFAULT_META[mappedCampus] ?? CONTROLES_DEFAULT_META[1];
    if (period.metaMontoSinIgv == null || Number(period.metaMontoSinIgv) === 0) {
      period.metaMontoSinIgv = defaults.metaMontoSinIgv;
    }
    if (period.dbTotal == null || Number(period.dbTotal) === 0) {
      period.dbTotal = defaults.dbTotal;
    }
    await this.periodRepo.save(period);
    await this.seedControlesDefaultEjecutivos(period, mappedCampus);
    this.logger.log(
      `Controles ${period.year}-${period.month} campus ${mappedCampus}: ejecutivas desde plantilla por defecto`,
    );
  }

  /** Crea período Controles por sede si no existe. */
  private async ensureControlesPeriod(
    year: number,
    month: number,
    campusId: number,
  ): Promise<CommissionPeriod> {
    const mappedCampus = this.mapCommissionCampusId(campusId);
    const existing = await this.periodRepo.findOne({
      where: this.periodWhere(year, month, 'CONTROLES', mappedCampus),
    });
    if (existing) {
      await this.ensureControlesEjecutivosConfigured(existing);
      return existing;
    }

    const template = await this.findLatestControlesTemplate(mappedCampus, year, month);
    const defaults = CONTROLES_DEFAULT_META[mappedCampus] ?? CONTROLES_DEFAULT_META[1];

    const period = await this.periodRepo.save(this.periodRepo.create({
      year,
      month,
      area: 'CONTROLES',
      campusId: mappedCampus,
      campusNombre: this.commissionCampusNombre(mappedCampus),
      metaMontoSinIgv: template?.period.metaMontoSinIgv ?? defaults.metaMontoSinIgv,
      dbTotal: template?.period.dbTotal ?? defaults.dbTotal,
      estado: 'BORRADOR',
    }));

    if (template?.records.length) {
      await this.copyControlesRecordsToPeriod(period, template.records, mappedCampus);
    } else {
      await this.seedControlesDefaultEjecutivos(period, mappedCampus);
    }
    return period;
  }

  private parseModalidad(num: unknown): { modalidad: 'CONTADO' | 'CUOTAS'; cuotaNum: number } {
    const raw = String(num ?? '').trim().toLowerCase();
    const match = raw.match(/(\d+)/);
    const n = match ? parseInt(match[1], 10) : 0;
    if (raw.includes('contado') || raw === '0' || raw === '') {
      return { modalidad: 'CONTADO', cuotaNum: 1 };
    }
    if (n >= 1 && n <= 14) {
      return { modalidad: 'CUOTAS', cuotaNum: n };
    }
    return { modalidad: 'CONTADO', cuotaNum: 1 };
  }

  private async fetchCerradorasContractsForMonth(year: number, month: number): Promise<{
    contracts: ContractSvRow[];
    stats: { contractsTotal: number; contractsCrm: number; contractsSv: number };
  }> {
    const { start, end } = this.monthRange(year, month);
    const crmResult = await this.buildCerradorasContractsFromCrm(start, end);

    this.logger.log(
      `Cerradoras sync ${year}-${month} (solo CRM): cierres=${crmResult.crmWins}, comisionables=${crmResult.contracts.length}`,
    );
    return {
      contracts: crmResult.contracts,
      stats: {
        contractsTotal: crmResult.contracts.length,
        contractsCrm: crmResult.crmWins,
        contractsSv: 0,
      },
    };
  }

  private async loadCerradorasPresaveData(quotationIds: number[]): Promise<{
    presaveByQuotation: Map<number, CerradorasCrmPresaveRow>;
    solicitudByQuotation: Map<number, CerradorasCrmSolicitudRow>;
  }> {
    if (quotationIds.length === 0) {
      return { presaveByQuotation: new Map(), solicitudByQuotation: new Map() };
    }
    const [presaves, solicitudes] = await Promise.all([
      this.dataSource.query(
        `
        SELECT quotation_id, contract_type, payments_count, payment_method,
               registered_payments, created_at::text AS created_at
        FROM contract_presave
        WHERE quotation_id = ANY($1::int[])
        `,
        [quotationIds],
      ) as Promise<CerradorasCrmPresaveRow[]>,
      this.dataSource.query(
        `
        SELECT DISTINCT ON (quotation_id)
          quotation_id, tipo_contrato, fecha_contrato::text AS fecha_contrato,
          firma_contrato, facturado
        FROM crm_cerradora_solicitudes
        WHERE quotation_id = ANY($1::int[])
        ORDER BY quotation_id, id DESC
        `,
        [quotationIds],
      ) as Promise<CerradorasCrmSolicitudRow[]>,
    ]);
    return {
      presaveByQuotation: indexLatestByQuotation(presaves),
      solicitudByQuotation: indexLatestByQuotation(solicitudes),
    };
  }

  /** Resuelve la cerradora asignada en CRM (equipo Cerradoras). */
  private resolveCerradoraUserId(
    assignedUserId: string | null | undefined,
    usernameToCrmId: Map<string, string>,
    cerradoraIds: Set<string>,
  ): string | null {
    const assigned = assignedUserId?.trim();
    if (!assigned) return null;
    const assignedCrmId = usernameToCrmId.get(assigned.toLowerCase()) ?? assigned;
    return cerradoraIds.has(assignedCrmId) ? assignedCrmId : null;
  }

  /**
   * Comisiones cerradoras 100% desde CRM:
   * c_oportunidad_cerradora + contract_presave + crm_cerradora_solicitudes.
   */
  private async buildCerradorasContractsFromCrm(
    start: string,
    end: string,
  ): Promise<{ contracts: ContractSvRow[]; crmWins: number }> {
    const [catalog, usernameToCrmId] = await Promise.all([
      this.listCerradorasEjecutivos(),
      this.buildCrmUsernameToUserIdMap(),
    ]);
    const cerradoraIds = new Set(catalog.map((c) => c.userId));
    const catalogByUserId = new Map(catalog.map((c) => [c.userId, c]));

    const oppRows: Array<{
      cotizacion_id: string | null;
      contract_id: string | null;
      assigned_user_id: string | null;
      status: string | null;
      campus_id: number | null;
      sub_campaign_id: string | null;
      date_end: string | null;
      factura_id: string | null;
      comision_demora_aprobada: boolean;
    }> = await this.dataSource.query(
      `
      SELECT oc.cotizacion_id, oc.contract_id, oc.assigned_user_id, oc.status,
             oc.date_end::text AS date_end, oc.factura_id,
             COALESCE(oc.comision_demora_aprobada, false) AS comision_demora_aprobada,
             COALESCE(opp.c_campus_atencion_id, opp.c_campus_id, 1) AS campus_id,
             opp.c_sub_campaign_id AS sub_campaign_id
      FROM c_oportunidad_cerradora oc
      LEFT JOIN opportunity opp ON opp.id = oc.opportunity_id
      WHERE COALESCE(oc.deleted, false) = false
        AND oc.assigned_user_id IS NOT NULL
        AND TRIM(oc.assigned_user_id) <> ''
      `,
    );

    const quotationIds = oppRows
      .map((r) => parseInt(String(r.cotizacion_id ?? ''), 10))
      .filter((id) => !Number.isNaN(id) && id > 0);
    const { presaveByQuotation, solicitudByQuotation } = await this.loadCerradorasPresaveData(quotationIds);

    const contracts: ContractSvRow[] = [];
    const seenContractIds = new Set<number>();
    let crmWins = 0;

    for (const row of oppRows) {
      const quotationId = parseInt(String(row.cotizacion_id ?? ''), 10);
      if (Number.isNaN(quotationId) || quotationId <= 0) continue;

      const crmUserId = this.resolveCerradoraUserId(row.assigned_user_id, usernameToCrmId, cerradoraIds);
      if (!crmUserId) continue;

      const presave = presaveByQuotation.get(quotationId);
      const solicitud = solicitudByQuotation.get(quotationId);
      const hasPresave = !!presave;
      const hasRegisteredPayment = parsePresaveHasRegisteredPayments(presave?.registered_payments);
      const solicitudFacturado = solicitud?.facturado === true;
      const firmaContrato = (solicitud?.firma_contrato ?? null) as 'pendiente' | 'firmado' | 'rechazado' | null;

      const gestionEvidence = hasCloserGestionEvidence({
        isPresaved: hasPresave,
        hasContractPresave: hasPresave,
        firmaContrato,
        facturado: solicitudFacturado,
        facturaId: row.factura_id,
        hasRegisteredPayment,
      });

      if (!gestionEvidence && !row.comision_demora_aprobada) continue;

      if (
        isCloserWinStatus(row.status)
        && !row.comision_demora_aprobada
        && !gestionEvidence
      ) {
        if (!row.date_end) continue;
        const winDate = new Date(row.date_end);
        if (Number.isNaN(winDate.getTime())) continue;
        const diffHours = (Date.now() - winDate.getTime()) / (1000 * 60 * 60);
        if (diffHours > 24) continue;
      }

      const dates = buildCrmCommissionDates({
        dateEnd: row.date_end,
        fechaContrato: solicitud?.fecha_contrato,
        presaveCreatedAt: presave?.created_at,
        registeredPayments: presave?.registered_payments,
      });

      if (!this.contractInCommissionMonth(
        start,
        end,
        dates.contractDate,
        null,
        dates.firstPaymentDate,
        dates.monthDates,
      )) continue;

      const contractId = resolveCrmContractId(row.contract_id, quotationId);
      if (seenContractIds.has(contractId)) continue;
      seenContractIds.add(contractId);
      crmWins += 1;

      const subCampaignName = row.sub_campaign_id
        ? SUB_CAMPAIGN_NAMES[row.sub_campaign_id] ?? null
        : null;
      const modalidadParsed = parseModalidadFromCrmFields({
        tipoContrato: solicitud?.tipo_contrato,
        contractType: presave?.contract_type,
        paymentsCount: presave?.payments_count,
        paymentMethod: presave?.payment_method,
      }) ?? { modalidad: 'CONTADO' as const, cuotaNum: 1 };

      const campusId = this.mapCommissionCampusId(row.campus_id ?? 1);
      const cat = catalogByUserId.get(crmUserId)!;

      contracts.push({
        contractId,
        quotationId,
        tratamiento: mapTratamientoFromCrm({
          subCampaignName,
          contractType: presave?.contract_type,
        }),
        modalidad: modalidadParsed.modalidad,
        cuotaNum: modalidadParsed.cuotaNum,
        ejecutivo: crmUserId,
        ejecutivoNombre: cat.userName ?? cat.userLogin ?? crmUserId,
        campusId,
        campusNombre: this.commissionCampusNombre(campusId),
        contractDate: dates.contractDate,
        firstPaymentDate: dates.firstPaymentDate,
      });
    }

    this.logger.log(`Cerradoras CRM ${start}→${end}: ${crmWins} cierres en mes, ${contracts.length} contratos`);
    return { contracts, crmWins };
  }

  /** Configuración de apoyo entre sedes del período (mes). */
  async listSedeApoyo(periodId?: number): Promise<Array<{
    id: number;
    userId: string;
    userName: string | null;
    campusId: number;
    campusNombre: string;
    porcentaje: number;
    activo: boolean;
    periodId: number | null;
  }>> {
    try {
      if (periodId != null) {
        await this.ensureSedeApoyoForPeriod(periodId);
      }

      const rows = await this.findSedeApoyoActive(periodId);
      if (rows.length === 0) return [];

      const userIds = [...new Set(rows.map((r) => r.userId))];
      const userKeys = [...new Set(userIds.map((u) => u.trim()).filter(Boolean))];
      const userKeysLower = userKeys.map((k) => k.toLowerCase());
      const users: Array<{ id: string; user_name: string | null; c_usersv: string | null; first_name: string | null; last_name: string | null }> =
        userKeys.length === 0
          ? []
          : await this.dataSource.query(
          `SELECT id, user_name, c_usersv, first_name, last_name FROM "user"
           WHERE id = ANY($1::text[])
              OR LOWER(user_name) = ANY($2::text[])
              OR LOWER(c_usersv) = ANY($2::text[])`,
          [userKeys, userKeysLower],
        );
      const nameByKey = new Map<string, string>();
      for (const u of users) {
        const name = [u.first_name, u.last_name].filter(Boolean).join(' ').trim() || u.user_name || u.id;
        for (const key of [u.id, u.user_name, u.c_usersv].filter(Boolean)) {
          nameByKey.set(String(key).trim().toLowerCase(), name);
        }
      }

      return rows.map((r) => ({
        id: r.id,
        userId: r.userId,
        userName: nameByKey.get(r.userId.trim().toLowerCase()) ?? r.userId,
        campusId: r.campusId,
        campusNombre: this.commissionCampusNombre(r.campusId),
        porcentaje: Number(r.porcentaje),
        activo: r.activo,
        periodId: r.periodId,
      }));
    } catch (err) {
      this.logger.error(
        `listSedeApoyo periodId=${periodId ?? 'all'}: ${err instanceof Error ? err.message : err}`,
      );
      throw err;
    }
  }

  async upsertSedeApoyo(
    items: Array<{ userId: string; campusId: number; porcentaje: number; activo?: boolean }>,
    periodId?: number,
  ): Promise<void> {
    const hasPeriodCol = await this.hasSedeApoyoPeriodColumn();
    for (const item of items) {
      const userKey = await this.resolveCommissionSvKey(item.userId);
      if (hasPeriodCol && periodId != null) {
        const existing: Array<{ id: number }> = await this.dataSource.query(
          `SELECT id FROM commission_cerradora_sede_apoyo
           WHERE period_id = $1 AND user_id = $2 AND campus_id = $3 LIMIT 1`,
          [periodId, userKey, item.campusId],
        );
        if (existing[0]?.id) {
          await this.dataSource.query(
            `UPDATE commission_cerradora_sede_apoyo
             SET porcentaje = $1, activo = $2, updated_at = NOW()
             WHERE id = $3`,
            [item.porcentaje, item.activo ?? true, existing[0].id],
          );
        } else {
          await this.dataSource.query(
            `INSERT INTO commission_cerradora_sede_apoyo (period_id, user_id, campus_id, porcentaje, activo)
             VALUES ($1, $2, $3, $4, $5)`,
            [periodId, userKey, item.campusId, item.porcentaje, item.activo ?? true],
          );
        }
        continue;
      }

      const existingRows: Array<{ id: number }> = await this.dataSource.query(
        `SELECT id FROM commission_cerradora_sede_apoyo
         WHERE user_id = $1 AND campus_id = $2 LIMIT 1`,
        [userKey, item.campusId],
      );
      if (existingRows[0]?.id) {
        await this.dataSource.query(
          `UPDATE commission_cerradora_sede_apoyo
           SET porcentaje = $1, activo = $2, updated_at = NOW()
           WHERE id = $3`,
          [item.porcentaje, item.activo ?? true, existingRows[0].id],
        );
      } else {
        await this.dataSource.query(
          `INSERT INTO commission_cerradora_sede_apoyo (user_id, campus_id, porcentaje, activo)
           VALUES ($1, $2, $3, $4)`,
          [userKey, item.campusId, item.porcentaje, item.activo ?? true],
        );
      }
    }
  }

  async deleteSedeApoyo(id: number): Promise<void> {
    await this.sedeApoyoRepo.delete(id);
  }

  private async ensureSedeApoyoForPeriod(periodId: number): Promise<void> {
    const hasPeriodCol = await this.hasSedeApoyoPeriodColumn();
    if (!hasPeriodCol) return;

    const count = await this.countSedeApoyoForPeriod(periodId);
    if (count > 0) return;

    const period = await this.periodRepo.findOne({ where: { id: periodId } });
    if (!period || period.area !== 'CIERRE_TTO') return;

    await this.copySedeApoyoFromPrevious(period);
  }

  private async copySedeApoyoFromPrevious(period: CommissionPeriod): Promise<void> {
    const hasPeriodCol = await this.hasSedeApoyoPeriodColumn();
    if (!hasPeriodCol) return;

    const prevMonth = period.month === 1 ? 12 : period.month - 1;
    const prevYear = period.month === 1 ? period.year - 1 : period.year;
    const prev = await this.periodRepo.findOne({
      where: { year: prevYear, month: prevMonth, area: 'CIERRE_TTO', campusId: IsNull() },
    });

    type SourceRow = { user_id: string; campus_id: number; porcentaje: string | number };
    let source: SourceRow[] = prev
      ? await this.dataSource.query(
          `SELECT user_id, campus_id, porcentaje FROM commission_cerradora_sede_apoyo
           WHERE activo = true AND period_id = $1`,
          [prev.id],
        )
      : [];

    if (source.length === 0) {
      source = await this.dataSource.query(
        `SELECT user_id, campus_id, porcentaje FROM commission_cerradora_sede_apoyo
         WHERE activo = true AND period_id IS NULL`,
      );
    }

    if (source.length === 0) {
      source = await this.dataSource.query(
        `SELECT user_id, campus_id, porcentaje FROM commission_cerradora_sede_apoyo WHERE activo = true`,
      );
    }

    for (const row of source) {
      const exists: Array<{ id: number }> = await this.dataSource.query(
        `SELECT id FROM commission_cerradora_sede_apoyo
         WHERE period_id = $1 AND user_id = $2 AND campus_id = $3 LIMIT 1`,
        [period.id, row.user_id, row.campus_id],
      );
      if (exists.length > 0) continue;
      await this.dataSource.query(
        `INSERT INTO commission_cerradora_sede_apoyo (period_id, user_id, campus_id, porcentaje, activo)
         VALUES ($1, $2, $3, $4, true)`,
        [period.id, row.user_id, row.campus_id, row.porcentaje],
      );
    }
  }

  private async buildCierreTtoSedeConfig(periodId: number): Promise<CierreTtoSedeConfig> {
    const catalog = await this.listCerradorasEjecutivos();
    const homeCampusByUser = new Map<string, number>();
    for (const e of catalog) {
      homeCampusByUser.set(e.userId, e.campusId);
      if (e.userLogin) homeCampusByUser.set(e.userLogin.trim().toLowerCase(), e.campusId);
    }

    const apoyoFactorByUserCampus = new Map<string, number>();
    try {
      await this.ensureSedeApoyoForPeriod(periodId);
      const apoyoRows = await this.findSedeApoyoActive(periodId);
      for (const row of apoyoRows) {
        apoyoFactorByUserCampus.set(`${row.userId}__${row.campusId}`, Number(row.porcentaje));
      }
    } catch (err) {
      this.logger.warn(
        `Sede apoyo período ${periodId} omitida: ${err instanceof Error ? err.message : err}`,
      );
    }

    return { homeCampusByUser, apoyoFactorByUserCampus };
  }

  /** Mapea username / c_usersv → userId CRM (todos los usuarios activos). */
  private async buildCrmUsernameToUserIdMap(): Promise<Map<string, string>> {
    const rows: Array<{ id: string; user_name: string | null; c_usersv: string | null }> =
      await this.dataSource.query(
        `SELECT id, user_name, c_usersv FROM "user" WHERE COALESCE(deleted, false) = false`,
      );
    const map = new Map<string, string>();
    for (const row of rows) {
      const crmId = String(row.id);
      for (const key of [row.user_name, row.c_usersv, row.id]) {
        if (key && String(key).trim()) {
          map.set(String(key).trim().toLowerCase(), crmId);
        }
      }
    }
    return map;
  }

  /** Mapea username SV → userId CRM (c_usersv / user_name) — subset de usuarios. */
  private async buildSvUsernameToCrmUserIdMap(userIds: string[]): Promise<Map<string, string>> {
    if (userIds.length === 0) return new Map();
    const rows: Array<{ id: string; user_name: string | null; c_usersv: string | null }> =
      await this.dataSource.query(
        `SELECT id, user_name, c_usersv FROM "user" WHERE id = ANY($1::text[])`,
        [userIds],
      );
    const map = new Map<string, string>();
    for (const row of rows) {
      const crmId = String(row.id);
      for (const key of [row.c_usersv, row.user_name, row.id]) {
        if (key && String(key).trim()) {
          map.set(String(key).trim().toLowerCase(), crmId);
        }
      }
    }
    return map;
  }

  /** Catálogo: miembros vigentes del equipo CERRADORAS (Usuarios → Equipo Cerradoras). */
  async listCerradorasEjecutivos(): Promise<CerradorasEjecutivoCatalogItem[]> {
    const rows: Array<{
      user_id: string;
      display_name: string | null;
      user_login: string | null;
      is_arequipa: number;
      is_trujillo: number;
    }> = await this.dataSource.query(
      `
      SELECT u.id AS user_id,
        COALESCE(
          NULLIF(TRIM(CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, ''))), ''),
          u.user_name
        ) AS display_name,
        u.user_name AS user_login,
        MAX(CASE WHEN tu_areq.team_id = $2 THEN 1 ELSE 0 END)::int AS is_arequipa,
        MAX(CASE WHEN tu_truj.team_id = $3 THEN 1 ELSE 0 END)::int AS is_trujillo
      FROM "user" u
      INNER JOIN team_user tu ON tu.user_id = u.id
        AND tu.team_id = $1
        AND COALESCE(tu.deleted, false) = false
      LEFT JOIN team_user tu_areq ON tu_areq.user_id = u.id
        AND tu_areq.team_id = $2
        AND COALESCE(tu_areq.deleted, false) = false
      LEFT JOIN team_user tu_truj ON tu_truj.user_id = u.id
        AND tu_truj.team_id = $3
        AND COALESCE(tu_truj.deleted, false) = false
      WHERE COALESCE(u.deleted, false) = false
        AND COALESCE(u.is_active, true) = true
      GROUP BY u.id, u.user_name, u.first_name, u.last_name
      ORDER BY display_name ASC NULLS LAST, u.user_name ASC
      `,
      [CERRADORAS_TEAM_ID, TEAM_AREQUIPA_ID, TEAM_TRUJILLO_ID],
    );

    return rows.map((r) => {
      let campusId: number;
      if (Number(r.is_trujillo) === 1) {
        campusId = 16;
      } else if (Number(r.is_arequipa) === 1) {
        campusId = 15;
      } else {
        campusId = 1;
      }
      return {
        userId: r.user_id,
        userName: r.display_name ?? r.user_login ?? r.user_id,
        userLogin: r.user_login,
        campusId,
        campusNombre: this.commissionCampusNombre(campusId),
      };
    });
  }

  /** Garantiza un commission_record por ejecutiva del catálogo (aunque aún no tenga cierres). */
  async ensureCierreTtoTeamRecords(period: CommissionPeriod): Promise<void> {
    const catalog = await this.listCerradorasEjecutivos();
    const apoyoRows = await this.findSedeApoyoActive(period.id);
    const catalogKeys = new Set(catalog.map((e) => `${e.userId}__${e.campusId}`));
    const apoyoKeys = new Set(apoyoRows.map((a) => `${a.userId}__${a.campusId}`));

    const existingRecords = await this.recordRepo.find({
      where: { period: { id: period.id } },
      relations: ['period'],
    });
    for (const rec of existingRecords) {
      const key = `${rec.userId}__${rec.campusId ?? 'null'}`;
      if (!catalogKeys.has(key) && !apoyoKeys.has(key)) {
        await this.recordRepo.remove(rec);
      }
    }

    const ensureRecord = async (userId: string, campusId: number, userName?: string) => {
      const existing = await this.recordRepo.findOne({
        where: { period: { id: period.id }, userId, campusId },
        relations: ['period'],
      });
      if (existing) {
        if (!existing.userName && userName) {
          existing.userName = userName;
          existing.campusNombre = this.commissionCampusNombre(campusId);
          await this.recordRepo.save(existing);
        }
        return;
      }
      await this.recordRepo.save(this.recordRepo.create({
        period,
        userId,
        userName,
        campusId,
        campusNombre: this.commissionCampusNombre(campusId),
        comisionTotal: 0,
        comisionTtos: 0,
        comisionBono: 0,
        comisionOi: 0,
        cantidadUnidades: 0,
        factorEspecial: 1,
        estado: 'PENDIENTE',
      }));
    };

    for (const eje of catalog) {
      await ensureRecord(eje.userId, eje.campusId, eje.userName);
    }

    const catalogByUser = new Map(catalog.map((c) => [c.userId, c]));
    for (const apoyo of apoyoRows) {
      const eje = catalogByUser.get(apoyo.userId);
      if (!eje) continue;
      if (apoyo.campusId === eje.campusId) continue;
      await ensureRecord(apoyo.userId, apoyo.campusId, eje.userName);
    }
  }

  async syncAndCalculateCierreTto(periodId: number): Promise<CommissionDashboard> {
    const period = await this.periodRepo.findOne({ where: { id: periodId } });
    if (!period) throw new Error(`Período ${periodId} no encontrado`);
    if (period.area !== 'CIERRE_TTO') throw new Error('El período no es de área CIERRE_TTO');

    await this.initPeriodRates(periodId);
    await this.ensureCierreTtoTeamRecords(period);
    await this.clearCierreTtoCalculatedData(periodId);
    const rateByCode = await this.getPeriodRatesMap(periodId);
    const sedeConfig = await this.buildCierreTtoSedeConfig(periodId);
    const { contracts, stats } = await this.fetchCerradorasContractsForMonth(period.year, period.month);
    const catalog = await this.listCerradorasEjecutivos();
    const cerradoraIds = new Set(catalog.map((c) => c.userId));
    await calculateCierreTto(
      period,
      contracts,
      this.typeRepo,
      this.recordRepo,
      this.detailRepo,
      this.tagRepo,
      rateByCode,
      undefined,
      sedeConfig,
      cerradoraIds,
    );
    await this.ensureCierreTtoTeamRecords(period);
    await this.savePeriodSyncMeta(period, stats);

    return this.buildDashboard(periodId, new Date().toISOString(), undefined, undefined, stats);
  }


  async saveExecutivosConfig(period: CommissionPeriod, ejecutivos: Array<{
    userId: string;
    userName?: string;
    campusId?: number;
    campusNombre?: string;
    metaMontoSinIgv?: number;
    dbAsignada?: number;
    factorEspecial?: number;
  }>): Promise<void> {
    const resolvedKeys: string[] = [];
    const keepKeys = new Set<string>();
    for (const eje of ejecutivos) {
      const resolvedUserId = await this.resolveCommissionSvKey(eje.userId);
      resolvedKeys.push(resolvedUserId);
      const campusId = eje.campusId ?? period.campusId ?? null;
      keepKeys.add(`${resolvedUserId.trim().toLowerCase()}::${campusId ?? 'all'}`);
      const existing = await this.recordRepo.findOne({
        where: {
          period: { id: period.id },
          userId: resolvedUserId,
          campusId: campusId == null ? IsNull() : campusId,
        },
        relations: ['period'],
      });
      const record = existing ?? this.recordRepo.create({
        period,
        userId: resolvedUserId,
        campusId,
        factorEspecial: eje.factorEspecial ?? 1,
      });
      if (eje.userName) record.userName = eje.userName;
      if (eje.campusNombre) record.campusNombre = eje.campusNombre;
      else if (campusId != null) record.campusNombre = this.commissionCampusNombre(campusId);
      if (eje.dbAsignada != null) record.dbAsignada = eje.dbAsignada;
      if (eje.factorEspecial != null) record.factorEspecial = eje.factorEspecial;
      if (eje.metaMontoSinIgv != null) record.metaMontoIndividual = eje.metaMontoSinIgv;
      record.estado = record.estado === 'CALCULADO' ? record.estado : 'PENDIENTE';
      await this.recordRepo.save(record);
    }

    const existingRecords = await this.recordRepo.find({ where: { period: { id: period.id } } });
    for (const rec of existingRecords) {
      const key = `${rec.userId.trim().toLowerCase()}::${rec.campusId ?? 'all'}`;
      if (!keepKeys.has(key)) {
        await this.detailRepo.delete({ record: { id: rec.id } });
        await this.recordRepo.delete(rec.id);
      }
    }
  }

  /**
   * Facturación controles OFM para un mes/sede: SV directo + fallback cache CRM (18 meses).
   * Consulta alias de campus (ej. Arequipa 15 y 18).
   */
  private async fetchControlesFacturacionRows(
    year: number,
    month: number,
    campusId?: number | null,
  ): Promise<{ rows: Record<string, unknown>[]; lastSyncAt: string | null; source: string }> {
    const { start, end } = this.monthRange(year, month);
    let rows: Record<string, unknown>[] = [];
    let lastSyncAt: string | null = null;
    let source = 'sv-invoice-http';

    try {
      const { tokenSv } = await this.svServices.getTokenSvAdmin();
      if (campusId != null) {
        const merged = new Map<string, Record<string, unknown>>();
        for (const cid of this.commissionCampusCandidates(campusId)) {
          const chunk = await this.svServices.getFacturacionControlesFromSv(
            tokenSv,
            start,
            end,
            cid,
          );
          for (const row of chunk) {
            const key = String(row.invoice_body_id ?? `${row.id_historia_clinica}-${row.invoice_date}-${row.amount}`);
            merged.set(key, row);
          }
        }
        rows = [...merged.values()];
      } else {
        rows = await this.svServices.getFacturacionControlesFromSv(tokenSv, start, end);
      }
      lastSyncAt = new Date().toISOString();
    } catch (err) {
      this.logger.warn(
        `Consulta SV controles ${year}-${month} falló: ${err instanceof Error ? err.message : err}`,
      );
      source = 'crm-cache';
    }

    if (rows.length === 0) {
      try {
        await this.crmControlesService.syncFacturacionFromSv();
      } catch (syncErr) {
        this.logger.warn(
          `Sync cache facturación controles falló: ${syncErr instanceof Error ? syncErr.message : syncErr}`,
        );
      }
      const { data, meta } = this.crmControlesService.getFacturacionSnapshot();
      rows = data.filter((row) => {
        const date = this.parseDate(row.invoice_date ?? row.fecha_abono);
        if (!date || !this.inMonth(date, year, month)) return false;
        if (campusId != null && !this.matchesFilterCampus(Number(row.campus_id), campusId)) return false;
        return true;
      }) as Record<string, unknown>[];
      if (rows.length > 0) {
        lastSyncAt = meta.lastSyncAt ?? lastSyncAt;
        source = 'crm-cache';
      }
    }

    this.logger.log(
      `Controles facturación ${year}-${month} campus ${campusId ?? 'todas'}: ${rows.length} filas (${source})`,
    );
    return { rows, lastSyncAt, source };
  }

  /**
   * Sincroniza facturación SV del mes, agrega por ejecutivo y recalcula comisiones Controles.
   */
  async syncAndCalculateControles(periodId: number, forceSync = true): Promise<CommissionDashboard> {
    const period = await this.periodRepo.findOne({ where: { id: periodId } });
    if (!period) throw new Error(`Período ${periodId} no encontrado`);
    if (period.area !== 'CONTROLES') throw new Error('El período no es de área CONTROLES');

    await this.ensureControlesEjecutivosConfigured(period);

    const { rows, lastSyncAt: syncAt } = await this.fetchControlesFacturacionRows(
      period.year,
      period.month,
      period.campusId,
    );
    let lastSyncAt = syncAt;

    if (forceSync) {
      void this.crmControlesService.syncFacturacionFromSv().catch((syncErr) =>
        this.logger.warn(`Sync cache controles en background falló: ${syncErr instanceof Error ? syncErr.message : syncErr}`),
      );
    }

    const grupalSinIgv = rows.reduce((sum, row) => {
      const amount = Number(row.amount ?? 0);
      return sum + this.amountSinIgv(amount);
    }, 0);

    const byEjecutivo = new Map<string, number>();
    for (const row of rows) {
      const exec = String(row.ejecutivo_controles ?? 'sin_asignar').trim().toLowerCase();
      const amount = this.amountSinIgv(Number(row.amount ?? 0));
      byEjecutivo.set(exec, (byEjecutivo.get(exec) ?? 0) + amount);
    }

    const configRecords = await this.recordRepo.find({
      where: { period: { id: periodId } },
      relations: ['period'],
    });

    if (configRecords.length === 0) {
      this.logger.warn(`Período ${periodId} sin ejecutivos configurados`);
    }

    const svKeyMap = await this.buildCrmUserSvKeyMap(
      configRecords.map((r) => r.userId),
    );

    const ejecutivosInput: ControlesEjecutivoInput[] = configRecords.map((rec) => {
      const svKey = svKeyMap.get(rec.userId)
        ?? svKeyMap.get(rec.userId.trim().toLowerCase())
        ?? rec.userId.trim().toLowerCase();
      const montoIndividual = byEjecutivo.get(svKey) ?? 0;
      const metaIndividual = Number(rec.metaMontoIndividual ?? period.metaMontoSinIgv ?? 0);
      return {
        userId: rec.userId,
        userName: rec.userName ?? rec.userId,
        campusId: rec.campusId ?? period.campusId ?? 0,
        campusNombre: rec.campusNombre ?? period.campusNombre ?? '',
        montoFacturadoSinIgv: montoIndividual,
        metaMontoSinIgv: metaIndividual,
        dbAsignada: Number(rec.dbAsignada ?? 0),
        factorEspecial: Number(rec.factorEspecial ?? 1),
      };
    });

    const periodInput: ControlesPeriodInput = {
      montoGrupalFacturadoSinIgv: grupalSinIgv,
      metaGrupalSinIgv: Number(period.metaMontoSinIgv ?? 0),
      dbTotal: Number(period.dbTotal ?? 0),
    };

    await calculateControles(period, periodInput, ejecutivosInput, this.recordRepo);

    return this.buildDashboard(periodId, lastSyncAt, grupalSinIgv);
  }

  /** Mapea userId CRM → clave SV (c_usersv o user_name). Acepta login como userId. */
  private async buildCrmUserSvKeyMap(userIds: string[]): Promise<Map<string, string>> {
    const keys = [...new Set(userIds.map((u) => u.trim()).filter(Boolean))];
    if (keys.length === 0) return new Map();
    const lowerKeys = keys.map((k) => k.toLowerCase());
    const rows: Array<{ id: string; user_name: string | null; c_usersv: string | null }> =
      await this.dataSource.query(
        `SELECT id, user_name, c_usersv FROM "user"
         WHERE id = ANY($1::text[])
            OR LOWER(user_name) = ANY($2::text[])
            OR LOWER(c_usersv) = ANY($2::text[])`,
        [keys, lowerKeys],
      );
    const map = new Map<string, string>();
    for (const row of rows) {
      const key = String(row.c_usersv ?? row.user_name ?? row.id).trim().toLowerCase();
      map.set(String(row.id), key);
      if (row.user_name) map.set(row.user_name.trim().toLowerCase(), key);
      if (row.c_usersv) map.set(row.c_usersv.trim().toLowerCase(), key);
    }
    for (const uid of userIds) {
      if (!map.has(uid)) map.set(uid, uid.trim().toLowerCase());
    }
    return map;
  }

  /** Agrega commission_record por cada login SV con facturación/evaluaciones en el mes. */
  private async ensureOiRecordsFromSvMetrics(
    period: CommissionPeriod,
    svMetrics: Map<string, OiCrmUserMetrics>,
  ): Promise<void> {
    const existing = await this.recordRepo.find({ where: { period: { id: period.id } } });
    const knownSvKeys = new Set<string>();

    for (const rec of existing) {
      const svKey = await this.resolveCommissionSvKey(rec.userId);
      knownSvKeys.add(svKey);
      const normalized = svKey.trim().toLowerCase();
      if (rec.userId.trim().toLowerCase() !== normalized) {
        const dup = existing.find(
          (r) => r.id !== rec.id && r.userId.trim().toLowerCase() === normalized,
        );
        if (dup) {
          await this.detailRepo.delete({ record: { id: rec.id } });
          await this.recordRepo.delete(rec.id);
        } else {
          rec.userId = normalized;
          await this.recordRepo.save(rec);
        }
      }
    }

    const team = await this.listOiEjecutivos();
    const teamByKey = new Map(team.map((e) => [e.userId.toLowerCase(), e]));

    for (const [svKey, metrics] of svMetrics) {
      if (metrics.facturadoConIgv <= 0 && metrics.evaluaciones <= 0) continue;
      if (knownSvKeys.has(svKey)) continue;

      const fromTeam = teamByKey.get(svKey);
      const userName = fromTeam?.userName
        ?? await this.oiSvInvoiceService.lookupDisplayName(svKey)
        ?? svKey;

      await this.recordRepo.save(this.recordRepo.create({
        period,
        userId: svKey,
        userName,
        campusId: period.campusId ?? null,
        campusNombre: period.campusId != null
          ? this.commissionCampusNombre(period.campusId)
          : null,
        factorEspecial: 1,
        estado: 'PENDIENTE',
      }));
      knownSvKeys.add(svKey);
    }
  }

  /**
   * Facturación OI + evaluaciones.
   * 1º HTTP URL_BACK_SV (igual Controles — funciona en prod).
   * 2º BD directa maxi_dev (fallback).
   */
  private async fetchOiMetricsFromSv(
    year: number,
    month: number,
    campusId?: number | null,
  ): Promise<{
    map: Map<string, OiCrmUserMetrics>;
    source: string;
    svError: string | null;
    factRowCount: number;
    evalGroupCount: number;
  }> {
    const { start, end } = this.monthRange(year, month);
    let svError: string | null = null;

    const filterByCampus = (rows: Record<string, unknown>[]) => {
      if (campusId == null) return rows;
      return rows.filter((row) =>
        this.matchesFilterCampus(Number(row.campus_id), campusId),
      );
    };

    // — 1. HTTP SV (misma vía que Controles en producción) —
    try {
      const { tokenSv } = await this.svServices.getTokenSvAdmin();
      let factRows = await this.svServices.getFacturacionOiFromSv(
        tokenSv, start, end, campusId ?? undefined,
      );
      let evalRows = await this.svServices.getEvaluacionesOiFromSv(
        tokenSv, start, end, campusId ?? undefined,
      );
      factRows = filterByCampus(Array.isArray(factRows) ? factRows : []);
      evalRows = filterByCampus(Array.isArray(evalRows) ? evalRows : []);

      if (factRows.length > 0 || evalRows.length > 0) {
        const map = this.oiSvInvoiceService.aggregateMetrics(factRows, evalRows);
        this.logger.log(
          `OI SV-HTTP ${year}-${month}: ${factRows.length} facturas, ${evalRows.length} grupos eval, ${map.size} ejecutivas`,
        );
        void this.crmControlesService.syncOiFacturacionFromSv().catch((e) =>
          this.logger.warn(`Cache OI: ${e instanceof Error ? e.message : e}`),
        );
        return {
          map,
          source: 'sv-http',
          svError: null,
          factRowCount: factRows.length,
          evalGroupCount: evalRows.length,
        };
      }
    } catch (httpErr) {
      svError = httpErr instanceof Error ? httpErr.message : String(httpErr);
      this.logger.warn(`OI SV-HTTP ${year}-${month} falló: ${svError}`);
    }

    // — 2. BD SV directa (invoice_result_body) —
    try {
      const result = await this.oiSvInvoiceService.fetchMonthMetrics(
        year, month, campusId ?? undefined,
      );
      if (result.factRowCount > 0 || result.evalGroupCount > 0 || result.map.size > 0) {
        void this.crmControlesService.syncOiFacturacionFromSv().catch((e) =>
          this.logger.warn(`Cache OI: ${e instanceof Error ? e.message : e}`),
        );
        return {
          map: result.map,
          source: result.source,
          svError: null,
          factRowCount: result.factRowCount,
          evalGroupCount: result.evalGroupCount,
        };
      }
    } catch (dbErr) {
      const dbMsg = dbErr instanceof Error ? dbErr.message : String(dbErr);
      svError = svError ? `${svError}; BD: ${dbMsg}` : dbMsg;
      this.logger.warn(`OI SV-DB ${year}-${month} falló: ${dbMsg}`);
    }

    this.logger.error(
      `OI ${year}-${month}: sin datos HTTP ni BD. Error: ${svError ?? 'sin filas'}`,
    );
    return {
      map: new Map(),
      source: 'sin-datos',
      svError: svError ?? 'Sin filas en SV (HTTP y BD)',
      factRowCount: 0,
      evalGroupCount: 0,
    };
  }

  /**
   * Sincroniza montos OI desde SV (facturación invoice + evaluaciones) y recalcula comisiones.
   * Cruce por login SV igual que Controles (userId = c_usersv / user_name).
   */
  async syncAndCalculateOi(periodId: number): Promise<CommissionDashboard> {
    try {
      const period = await this.periodRepo.findOne({ where: { id: periodId } });
      if (!period) throw new Error(`Período ${periodId} no encontrado`);
      if (period.area !== 'OI') throw new Error('El período no es de área OI');

      await this.ensureOiEjecutivosConfigured(period);

      const {
        map: svMetrics,
        source: oiMetricsSource,
        svError,
        factRowCount,
        evalGroupCount,
      } = await this.fetchOiMetricsFromSv(period.year, period.month, period.campusId);

      await this.ensureOiRecordsFromSvMetrics(period, svMetrics);

      const configRecords = await this.recordRepo.find({
        where: { period: { id: periodId } },
        relations: ['period'],
      });

      if (configRecords.length === 0) {
        this.logger.warn(`Período OI ${periodId} sin ejecutivos tras sync SV`);
        return this.buildDashboard(periodId);
      }

      const svKeyMap = await this.buildCrmUserSvKeyMap(configRecords.map((r) => r.userId));

      const ejecutivosInput: OiExecutivoInput[] = configRecords.map((rec) => {
        const svKey = svKeyMap.get(rec.userId)
          ?? svKeyMap.get(rec.userId.trim().toLowerCase())
          ?? rec.userId.trim().toLowerCase();
        const metrics = svMetrics.get(svKey) ?? { facturadoConIgv: 0, evaluaciones: 0 };
        return {
          userId: svKey,
          userName: rec.userName ?? svKey,
          campusId: rec.campusId ?? period.campusId ?? null,
          campusNombre: rec.campusNombre ?? '',
          montoFacturadoConIgv: metrics.facturadoConIgv,
          cantidadEvaluaciones: metrics.evaluaciones,
        };
      });

      const totalEvaluacionesEquipo = ejecutivosInput.reduce((s, e) => s + e.cantidadEvaluaciones, 0);
      const montoObjetivo = Number(period.baseFijaConIgv ?? 40000);

      const periodInput: OiPeriodInput = {
        metaConIgv: Number(period.metaMontoConIgv ?? 0),
        montoObjetivoConIgv: montoObjetivo,
        minimoFacturadoConIgv: montoObjetivo,
        porcentajeComision: Number(period.porcentajeComision ?? OI_PORCENTAJE_COMISION_TTOS),
        metaEvaluaciones: Number(period.objEvaluaciones ?? 20),
        totalEvaluacionesEquipo,
      };

      await calculateOi(period, periodInput, ejecutivosInput, this.recordRepo);

      const facturadoTotal = ejecutivosInput.reduce((s, e) => s + e.montoFacturadoConIgv, 0);
      const ejecutivasConDatos = ejecutivosInput.filter(
        (e) => e.montoFacturadoConIgv > 0 || e.cantidadEvaluaciones > 0,
      ).length;

      const syncedAt = new Date().toISOString();
      period.notas = JSON.stringify({
        syncedAt,
        source: oiMetricsSource,
        factRowCount,
        evalGroupCount,
        ejecutivasConDatos,
        facturadoTotal,
        svError: svError ?? undefined,
      });
      await this.periodRepo.save(period);

      this.logger.log(
        `OI sync ${period.year}-${period.month}: ${factRowCount} líneas invoice, facturado S/ ${facturadoTotal.toFixed(2)}, ${ejecutivasConDatos} ejecutivas con datos, fuente=${oiMetricsSource}`,
      );

      const dash = await this.buildDashboard(periodId, syncedAt);
      return {
        ...dash,
        lastSyncAt: syncedAt,
        dataSource: oiMetricsSource,
        svError: svError ?? null,
        oiSyncStats: {
          factRowCount,
          evalGroupCount,
          ejecutivasConDatos,
          facturadoTotal,
        },
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`syncAndCalculateOi ${periodId}: ${msg}`);
      const dash = await this.buildDashboard(periodId, new Date().toISOString());
      return { ...dash, svError: msg };
    }
  }

  async getControlesDashboard(periodId: number): Promise<CommissionDashboard> {
    return this.syncAndCalculateControles(periodId, true);
  }

  async getOiDashboard(periodId: number): Promise<CommissionDashboard> {
    return this.syncAndCalculateOi(periodId);
  }

  /** Ejecutivas Call Center y equipos comerciales por sede. userId = login SV. */
  async listCallCenterEjecutivos(): Promise<Array<{ userId: string; userName: string; campusId?: number; campusNombre?: string }>> {
    const { ejecutivosPayload } = await this.listVentasStaffCatalog('CALL_CENTER');
    return ejecutivosPayload;
  }

  private async ensureCallCenterPeriod(year: number, month: number): Promise<CommissionPeriod> {
    const existing = await this.periodRepo.findOne({
      where: { year, month, area: 'CALL_CENTER', campusId: IsNull() },
    });
    if (existing) {
      await this.ensureCallCenterEjecutivosConfigured(existing);
      return existing;
    }

    const prevMonth = month === 1 ? 12 : month - 1;
    const prevYear = month === 1 ? year - 1 : year;
    const prev = await this.periodRepo.findOne({
      where: { year: prevYear, month: prevMonth, area: 'CALL_CENTER', campusId: IsNull() },
    });

    const defaultNotas = JSON.stringify({ config: DEFAULT_CALL_CENTER_CONFIG });
    const period = await this.periodRepo.save(this.periodRepo.create({
      year,
      month,
      area: 'CALL_CENTER',
      campusId: null,
      metaCantidad: prev?.metaCantidad ?? DEFAULT_CALL_CENTER_CONFIG.minEvaAsistidas,
      objEvaluaciones: prev?.objEvaluaciones ?? DEFAULT_CALL_CENTER_CONFIG.minEvaVendidas,
      notas: prev?.notas ?? defaultNotas,
      estado: 'BORRADOR',
    }));

    if (prev) {
      const prevRecords = await this.recordRepo.find({ where: { period: { id: prev.id } } });
      for (const rec of prevRecords) {
        await this.recordRepo.save(this.recordRepo.create({
          period,
          userId: rec.userId,
          userName: rec.userName,
          campusId: rec.campusId,
          campusNombre: rec.campusNombre,
          factorEspecial: rec.factorEspecial ?? 1,
          estado: 'PENDIENTE',
        }));
      }
    } else {
      await this.ensureCallCenterEjecutivosConfigured(period);
    }
    return period;
  }

  private async ensureCallCenterEjecutivosConfigured(period: CommissionPeriod): Promise<void> {
    await this.normalizePeriodRecordSvKeys(period.id);
    const team = await this.listCallCenterEjecutivos();
    if (team.length === 0) return;

    const existing = await this.recordRepo.find({ where: { period: { id: period.id } } });
    const catalogKeys = new Set(
      team.map((e) => `${e.userId.toLowerCase()}::${e.campusId ?? 'all'}`),
    );

    for (const rec of existing) {
      const key = `${rec.userId.trim().toLowerCase()}::${rec.campusId ?? 'all'}`;
      if (!catalogKeys.has(key)) {
        await this.detailRepo.delete({ record: { id: rec.id } });
        await this.recordRepo.delete(rec.id);
      }
    }

    const existingKeys = new Set(
      existing
        .filter((r) => catalogKeys.has(`${r.userId.trim().toLowerCase()}::${r.campusId ?? 'all'}`))
        .map((r) => `${r.userId.trim().toLowerCase()}::${r.campusId ?? 'all'}`),
    );

    for (const eje of team) {
      const key = `${eje.userId.toLowerCase()}::${eje.campusId ?? 'all'}`;
      if (existingKeys.has(key)) continue;
      await this.recordRepo.save(this.recordRepo.create({
        period,
        userId: eje.userId,
        userName: eje.userName,
        campusId: eje.campusId ?? null,
        campusNombre: eje.campusNombre ?? (eje.campusId != null
          ? this.commissionCampusNombre(eje.campusId)
          : null),
        factorEspecial: 1,
        estado: 'PENDIENTE',
      }));
      existingKeys.add(key);
    }
  }

  private async fetchCallCenterMetricsFromSv(
    year: number,
    month: number,
    campusId?: number | null,
  ): Promise<{
    rows: Record<string, unknown>[];
    source: string;
    svError: string | null;
  }> {
    const { start, end } = this.monthRange(year, month);
    let svError: string | null = null;

    try {
      const { tokenSv } = await this.svServices.getTokenSvAdmin();
      let rows = await this.svServices.getCallCenterMetricsFromSv(
        tokenSv, start, end, campusId ?? undefined,
      );
      if (campusId != null) {
        rows = rows.filter((row) =>
          this.matchesFilterCampus(Number(row.campus_id), campusId),
        );
      }
      if (rows.length > 0) {
        return { rows, source: 'sv-http', svError: null };
      }
    } catch (httpErr) {
      svError = httpErr instanceof Error ? httpErr.message : String(httpErr);
      this.logger.warn(`Call Center SV-HTTP ${year}-${month} falló: ${svError}`);
    }

    return { rows: [], source: 'sin-datos', svError: svError ?? 'Sin filas en SV' };
  }

  async syncAndCalculateCallCenter(periodId: number): Promise<CommissionDashboard> {
    try {
      const period = await this.periodRepo.findOne({ where: { id: periodId } });
      if (!period) throw new Error(`Período ${periodId} no encontrado`);
      if (period.area !== 'CALL_CENTER') throw new Error('El período no es de área CALL_CENTER');

      await this.ensureCallCenterEjecutivosConfigured(period);

      const { rows, source, svError } = await this.fetchCallCenterMetricsFromSv(
        period.year, period.month, period.campusId,
      );

      const config = parseCallCenterConfig(period);
      if (period.objEvaluaciones != null) config.minEvaVendidas = Number(period.objEvaluaciones);
      if (period.metaCantidad != null) config.minEvaAsistidas = Number(period.metaCantidad);

      const metricsByKey = new Map<string, CallCenterExecutivoInput>();
      for (const raw of rows) {
        const svKey = String(raw.ejecutivo ?? '').trim().toLowerCase();
        if (!svKey) continue;
        const campusId = raw.campus_id != null ? Number(raw.campus_id) : null;
        const key = `${svKey}::${campusId ?? 'all'}`;
        const prev = metricsByKey.get(key);
        const merged: CallCenterExecutivoInput = {
          userId: svKey,
          userName: prev?.userName ?? svKey,
          campusId,
          campusNombre: campusId != null ? this.commissionCampusNombre(campusId) : '',
          ttoOfmContado: (prev?.ttoOfmContado ?? 0) + Number(raw.tto_ofm_contado ?? 0),
          ttoOfmCuotas: (prev?.ttoOfmCuotas ?? 0) + Number(raw.tto_ofm_cuotas ?? 0),
          ttoApneaContado: (prev?.ttoApneaContado ?? 0) + Number(raw.tto_apnea_contado ?? 0),
          ttoApneaCuotas: (prev?.ttoApneaCuotas ?? 0) + Number(raw.tto_apnea_cuotas ?? 0),
          evaVendidasOfm: (prev?.evaVendidasOfm ?? 0) + Number(raw.eva_vendidas_ofm ?? 0),
          evaVendidasApnea: (prev?.evaVendidasApnea ?? 0) + Number(raw.eva_vendidas_apnea ?? 0),
          evaAsistidas: (prev?.evaAsistidas ?? 0) + Number(raw.eva_asistidas ?? 0),
        };
        metricsByKey.set(key, merged);
      }

      const team = await this.listCallCenterEjecutivos();
      const teamByKey = new Map(team.map((e) => [e.userId.toLowerCase(), e]));
      for (const m of metricsByKey.values()) {
        m.userName = teamByKey.get(m.userId)?.userName
          ?? await this.oiSvInvoiceService.lookupDisplayName(m.userId)
          ?? m.userId;
      }

      const configRecords = await this.recordRepo.find({
        where: { period: { id: periodId } },
        relations: ['period'],
      });
      const svKeyMap = await this.buildCrmUserSvKeyMap(configRecords.map((r) => r.userId));

      const ejecutivosInput: CallCenterExecutivoInput[] = [];
      const seenKeys = new Set<string>();

      for (const rec of configRecords) {
        const svKey = (svKeyMap.get(rec.userId) ?? rec.userId).trim().toLowerCase();
        const campusId = rec.campusId;
        const match = [...metricsByKey.values()].find(
          (m) => m.userId === svKey
            && (campusId == null || m.campusId === campusId),
        );
        const dedupeKey = `${svKey}::${campusId ?? 'all'}`;
        if (seenKeys.has(dedupeKey)) continue;
        seenKeys.add(dedupeKey);
        ejecutivosInput.push({
          userId: svKey,
          userName: rec.userName ?? match?.userName ?? svKey,
          campusId,
          campusNombre: rec.campusNombre ?? (campusId != null ? this.commissionCampusNombre(campusId) : ''),
          ttoOfmContado: match?.ttoOfmContado ?? 0,
          ttoOfmCuotas: match?.ttoOfmCuotas ?? 0,
          ttoApneaContado: match?.ttoApneaContado ?? 0,
          ttoApneaCuotas: match?.ttoApneaCuotas ?? 0,
          evaVendidasOfm: match?.evaVendidasOfm ?? 0,
          evaVendidasApnea: match?.evaVendidasApnea ?? 0,
          evaAsistidas: match?.evaAsistidas ?? 0,
        });
      }

      await calculateCallCenter(period, config, ejecutivosInput, this.recordRepo);

      const syncedAt = new Date().toISOString();
      period.notas = JSON.stringify({
        config,
        syncedAt,
        source,
        rowCount: rows.length,
        svError: svError ?? undefined,
      });
      await this.periodRepo.save(period);

      const dash = await this.buildDashboard(periodId, syncedAt);
      return { ...dash, lastSyncAt: syncedAt, dataSource: source, svError: svError ?? null };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`syncAndCalculateCallCenter ${periodId}: ${msg}`);
      const dash = await this.buildDashboard(periodId, new Date().toISOString());
      return { ...dash, svError: msg };
    }
  }

  async getCallCenterDashboard(periodId: number): Promise<CommissionDashboard> {
    return this.syncAndCalculateCallCenter(periodId);
  }

  async getExportDetail(periodId: number): Promise<CommissionExportDetail> {
    const period = await this.periodRepo.findOne({ where: { id: periodId } });
    if (!period) throw new Error(`Período ${periodId} no encontrado`);

    const dashboard = await this.buildDashboard(periodId);
    const { start, end } = this.monthRange(period.year, period.month);
    const campusId = period.campusId ?? undefined;

    const nameByLogin = new Map<string, string>();
    for (const e of dashboard.ejecutivos) {
      const key = String(e.userId ?? '').trim().toLowerCase();
      if (key) nameByLogin.set(key, e.userName ?? key);
    }

    const resolveName = (login: string): string | null => {
      const k = login.trim().toLowerCase();
      return nameByLogin.get(k) ?? null;
    };

    const usuarios: CommissionExportUsuario[] = dashboard.ejecutivos.map((e) => ({
      userId: e.userId,
      userName: e.userName,
      loginSv: e.userId,
      campusId: e.campusId ?? null,
      campusNombre: e.campusId != null ? this.commissionCampusNombre(e.campusId) : '—',
      comisionTotal: Number(e.comisionTotal ?? 0),
      filasResumen: 1,
    }));

    let facturacion: CommissionExportFactLine[] = [];
    let comisiones = dashboard.detalleLineas ?? [];
    let source = dashboard.dataSource ?? 'crm';

    const mapFactRow = (
      row: Record<string, unknown>,
      tipo: CommissionExportFactLine['tipo'],
      loginKey: string,
    ): CommissionExportFactLine => {
      const login = String(row[loginKey] ?? row.ejecutivo ?? row.ejecutivo_oi ?? row.ejecutivo_controles ?? 'sin_asignar').trim().toLowerCase();
      const campus = row.campus_id != null ? Number(row.campus_id) : null;
      const montoRaw = row.amount_pen ?? row.amount;
      return {
        tipo,
        ejecutivoLogin: login,
        ejecutivoNombre: resolveName(login),
        campusId: campus,
        campusNombre: campus != null ? this.commissionCampusNombre(campus) : '—',
        paciente: row.paciente != null ? String(row.paciente).trim() : (
          row.nombre_paciente != null
            ? `${row.nombre_paciente} ${row.ap_paterno ?? ''} ${row.ap_materno ?? ''}`.trim()
            : null
        ),
        historia: row.historia != null ? String(row.historia) : (
          row.id_historia_clinica != null ? String(row.id_historia_clinica) : null
        ),
        fecha: String(row.fecha_abono ?? row.payment_date ?? row.invoice_date ?? row.fecha ?? row.fecha_cita ?? '') || null,
        concepto: String(row.tipo_arancel ?? row.tarifa ?? row.tipo ?? '') || null,
        monto: montoRaw != null ? Number(montoRaw) : null,
        moneda: row.moneda != null ? String(row.moneda) : null,
        comprobante: row.comprobante != null ? String(row.comprobante) : null,
        estado: row.estado_cita != null ? String(row.estado_cita) : null,
        facturador: row.facturador_username != null
          ? String(row.facturador_username)
          : (row.facturador != null ? String(row.facturador) : (
            row.ejecutivo_controles != null ? String(row.ejecutivo_controles) : null
          )),
      };
    };

    try {
      const { tokenSv } = await this.svServices.getTokenSvAdmin();

      if (period.area === 'OI') {
        const [factRows, evalRows] = await Promise.all([
          this.svServices.getFacturacionOiFromSv(tokenSv, start, end, campusId),
          this.svServices.getEvaluacionesOiDetalleFromSv(tokenSv, start, end, campusId),
        ]);
        facturacion = [
          ...factRows.map((r) => mapFactRow(r, 'facturacion', 'ejecutivo_oi')),
          ...evalRows.map((r) => mapFactRow(r, 'eval_asistida', 'ejecutivo')),
        ];
        source = 'sv-http';
      } else if (period.area === 'CALL_CENTER') {
        const ccLines = await this.svServices.getCallCenterExportLinesFromSv(tokenSv, start, end, campusId);
        facturacion = [
          ...ccLines.vendidas.map((r) => mapFactRow(r, 'eval_vendida', 'ejecutivo')),
          ...ccLines.asistidas.map((r) => mapFactRow(r, 'eval_asistida', 'ejecutivo')),
        ];
        source = 'sv-http';
      } else if (period.area === 'CONTROLES') {
        const { rows, source: ctrlSource } = await this.fetchControlesFacturacionRows(
          period.year,
          period.month,
          period.campusId,
        );
        facturacion = rows.map((r) => mapFactRow(r, 'facturacion', 'ejecutivo_controles'));
        source = ctrlSource;
      }
    } catch (err) {
      this.logger.warn(`Export detail SV ${periodId}: ${err instanceof Error ? err.message : err}`);
    }

    if (period.area === 'CIERRE_TTO' && comisiones.length === 0) {
      const dash = await this.buildDashboard(periodId);
      comisiones = dash.detalleLineas ?? [];
    }

    for (const u of usuarios) {
      const login = u.loginSv.toLowerCase();
      u.filasResumen = facturacion.filter((f) => f.ejecutivoLogin === login).length
        + comisiones.filter((c) => c.userId.toLowerCase() === login).length;
    }

    return {
      area: period.area,
      source,
      usuarios,
      facturacion,
      comisiones,
    };
  }

  async buildDashboard(
    periodId: number,
    lastSyncAt: string | null = null,
    grupalOverride?: number,
    filterCampusId?: number,
    syncStats?: { contractsTotal: number; contractsCrm: number; contractsSv: number },
  ): Promise<CommissionDashboard> {
    const period = await this.periodRepo.findOne({ where: { id: periodId } });
    if (!period) throw new Error(`Período ${periodId} no encontrado`);

    const records = await this.recordRepo.find({
      where: { period: { id: periodId } },
      order: { comisionTotal: 'DESC' },
    });
    const filteredRecords = filterCampusId != null
      ? records.filter((r) => this.matchesFilterCampus(r.campusId, filterCampusId))
      : records;

    const filteredRecordIds = new Set(filteredRecords.map((r) => r.id));
    const details = (await this.detailRepo.find({
      where: { record: { period: { id: periodId } } },
      relations: ['record', 'commissionType'],
    })).filter((d) => filteredRecordIds.has(d.record?.id ?? 0));

    const tags = period.area === 'CIERRE_TTO'
      ? await this.tagRepo.find({ where: { period: { id: periodId } } })
      : [];
    const tagByContract = new Map(tags.map((t) => [t.contractId, t]));

    const isOi = period.area === 'OI';
    const isCallCenter = period.area === 'CALL_CENTER';
    const isCierre = period.area === 'CIERRE_TTO';
    const baseFija = Number(period.baseFijaConIgv ?? 0);
    const cerradorasCatalog = isCierre ? await this.listCerradorasEjecutivos() : undefined;

    const facturacionGrupalSinIgv = grupalOverride ?? filteredRecords.reduce((sum, r) => {
      if (isOi) return sum + Number(r.montoFacturadoConIgv ?? 0);
      if (isCallCenter) return sum + Number(r.cantidadUnidades ?? 0);
      if (isCierre) return sum + Number(r.comisionTotal ?? 0);
      return sum + Number(r.montoFacturadoSinIgv ?? 0);
    }, 0);

    const metaGrupal = isOi
      ? Number(period.metaMontoConIgv ?? 0)
      : isCallCenter
        ? Number(period.metaCantidad ?? DEFAULT_CALL_CENTER_CONFIG.minEvaAsistidas)
        : Number(period.metaMontoSinIgv ?? 0);
    const porcentajeGrupal = isCierre ? 0 : (metaGrupal > 0 ? facturacionGrupalSinIgv / metaGrupal : 0);

    const detalleCountByUser = new Map<string, number>();
    for (const d of details) {
      const uid = d.record?.userId ?? '';
      detalleCountByUser.set(uid, (detalleCountByUser.get(uid) ?? 0) + 1);
    }

    const ejecutivos: CommissionDashboardEjecutivo[] = filteredRecords.map((r) => {
      const montoFacturado = isOi
        ? Number(r.montoFacturadoConIgv ?? 0)
        : Number(r.montoFacturadoSinIgv ?? 0);
      const metaIndividual = isOi
        ? metaGrupal
        : Number(r.metaMontoIndividual ?? r.dbAsignada ?? metaGrupal);
      const comisionTtos = Number(r.comisionTtos ?? 0);
      const aplicaComisionTtos = isOi ? montoFacturado >= baseFija : undefined;
      const diferencial = isOi && aplicaComisionTtos
        ? Math.max(0, montoFacturado - baseFija)
        : (isOi ? 0 : undefined);

      return {
        userId: r.userId,
        userName: r.userName,
        campusId: r.campusId,
        montoFacturadoSinIgv: isCierre ? Number(r.comisionTotal ?? 0) : montoFacturado,
        metaMontoSinIgv: metaIndividual,
        porcentajeAlcanzado: Number(r.porcentajeAlcanzado ?? 0),
        dbAsignada: Number(r.dbAsignada ?? 0),
        factorEspecial: Number(r.factorEspecial ?? 1),
        comisionBase: comisionTtos,
        comisionTotal: Number(r.comisionTotal ?? 0),
        aplica: Number(r.comisionTotal ?? 0) > 0,
        estado: r.estado ?? 'PENDIENTE',
        comisionTtos: isOi || isCierre || isCallCenter ? Number(r.comisionTtos ?? 0) : undefined,
        comisionEvaluaciones: isOi || isCallCenter ? Number(r.comisionEvaluaciones ?? 0) : undefined,
        comisionBono: isOi || isCierre || isCallCenter ? Number(r.comisionBono ?? 0) : undefined,
        comisionOi: isCierre ? Number(r.comisionOi ?? 0) : undefined,
        montoFacturadoOiConIgv: isCierre ? Number(r.montoFacturadoOiConIgv ?? 0) : undefined,
        porcentajeSedeApoyo: isCierre && r.porcentajeSedeApoyo != null
          ? Number(r.porcentajeSedeApoyo)
          : undefined,
        cantidadEvaluaciones: isOi || isCallCenter ? Number(r.cantidadUnidades ?? 0) : undefined,
        diferencial,
        cantidadCierres: isCierre ? (detalleCountByUser.get(r.userId) ?? 0) : undefined,
      };
    });

    const totalComision = ejecutivos.reduce((s, e) => s + e.comisionTotal, 0);

    const chartData = ejecutivos.map((e) => ({
      name: e.userName ?? e.userId,
      meta: isOi ? metaGrupal : (isCierre ? e.comisionTotal : (e.dbAsignada || metaGrupal)),
      actual: e.montoFacturadoSinIgv,
      comision: e.comisionTotal,
    }));

    const detalleLineas: CommissionDetalleLinea[] = details.map((d) => {
      const ct = d.commissionType;
      const tag = d.contractId ? tagByContract.get(d.contractId) : undefined;
      return {
        userId: d.record?.userId ?? '',
        userName: d.record?.userName ?? null,
        contractId: d.contractId,
        quotationId: d.quotationId,
        tratamiento: ct?.tratamiento ?? null,
        modalidad: ct?.modalidad ?? null,
        timing: tag?.timing ?? ct?.timing ?? null,
        modifier: tag?.modifier ?? ct?.modifier ?? null,
        cuotaNum: ct?.cuotaNum ?? null,
        descripcion: ct?.description ?? ct?.code ?? 'Comisión',
        importe: Number(d.importeTotal ?? 0),
        campusId: d.record?.campusId ?? null,
      };
    });

    const chartByTratamiento = isCierre ? this.groupSum(detalleLineas, (l) => l.tratamiento ?? 'Otro') : undefined;
    const chartByModalidad = isCierre ? this.groupSum(detalleLineas, (l) => {
      if (l.modalidad === 'CUOTAS' && l.cuotaNum) return `Cuotas C${l.cuotaNum}`;
      return l.modalidad ?? 'Contado';
    }) : undefined;

    // Extrae meta de sync desde period.notas
    let notasMeta: Record<string, unknown> = {};
    try {
      if (period.notas) notasMeta = JSON.parse(period.notas) as Record<string, unknown>;
    } catch { /* plain text */ }
    const notasSource = notasMeta.source != null ? String(notasMeta.source) : undefined;
    const notasSvError = notasMeta.svError != null ? String(notasMeta.svError) : null;
    const notasSyncedAt = notasMeta.syncedAt != null ? String(notasMeta.syncedAt) : null;
    const oiSyncStats = isOi && (
      notasMeta.factRowCount != null || notasMeta.facturadoTotal != null
    )
      ? {
        factRowCount: Number(notasMeta.factRowCount ?? 0),
        evalGroupCount: Number(notasMeta.evalGroupCount ?? 0),
        ejecutivasConDatos: Number(notasMeta.ejecutivasConDatos ?? 0),
        facturadoTotal: Number(notasMeta.facturadoTotal ?? 0),
      }
      : undefined;

    return {
      period: {
        id: period.id,
        year: period.year,
        month: period.month,
        area: period.area,
        campusId: period.campusId,
        campusNombre: period.campusNombre,
        estado: period.estado,
        metaMontoSinIgv: period.metaMontoSinIgv != null ? Number(period.metaMontoSinIgv) : null,
        metaMontoConIgv: period.metaMontoConIgv != null ? Number(period.metaMontoConIgv) : null,
        dbTotal: period.dbTotal != null ? Number(period.dbTotal) : null,
        baseFijaConIgv: period.baseFijaConIgv != null ? Number(period.baseFijaConIgv) : null,
        nEjecutivas: period.nEjecutivas,
        porcentajeComision: period.porcentajeComision != null ? Number(period.porcentajeComision) : (isOi ? OI_PORCENTAJE_COMISION_TTOS : null),
        objEvaluaciones: period.objEvaluaciones,
        metaCantidad: period.metaCantidad,
        bonoPersonalTtosThreshold: period.bonoPersonalTtosThreshold != null
          ? Number(period.bonoPersonalTtosThreshold) : null,
        bonoPersonalAmount: period.bonoPersonalAmount != null ? Number(period.bonoPersonalAmount) : null,
        bonoEquipoTtosThreshold: period.bonoEquipoTtosThreshold != null
          ? Number(period.bonoEquipoTtosThreshold) : null,
        bonoEquipoAmount: period.bonoEquipoAmount != null ? Number(period.bonoEquipoAmount) : null,
        porcentajeComisionOi: isCierre
          ? Number(period.porcentajeComisionOi ?? CERRADORAS_OI_PORCENTAJE_DEFAULT)
          : null,
      },
      facturacionGrupalSinIgv: Math.round(facturacionGrupalSinIgv * 100) / 100,
      porcentajeGrupal: Math.round(porcentajeGrupal * 10000) / 10000,
      totalComision: Math.round(totalComision * 100) / 100,
      lastSyncAt: lastSyncAt ?? notasSyncedAt ?? period.updatedAt?.toISOString() ?? null,
      ejecutivos,
      chartData,
      detalleLineas: detalleLineas.length > 0 ? detalleLineas : undefined,
      chartByTratamiento,
      chartByModalidad,
      pendingClosures: isCierre ? detalleLineas.filter((l) => !l.timing).length : undefined,
      cerradorasCatalog,
      syncStats,
      dataSource: notasSource,
      svError: notasSvError,
      oiSyncStats,
    };
  }

  private groupSum(items: CommissionDetalleLinea[], keyFn: (l: CommissionDetalleLinea) => string) {
    const map = new Map<string, number>();
    for (const item of items) {
      const k = keyFn(item);
      map.set(k, (map.get(k) ?? 0) + item.importe);
    }
    return [...map.entries()]
      .map(([name, value]) => ({ name, value: Math.round(value * 100) / 100 }))
      .sort((a, b) => b.value - a.value);
  }

  async updatePeriodMeta(
    periodId: number,
    dto: {
      metaMontoConIgv?: number;
      metaMontoSinIgv?: number;
      metaCantidad?: number;
      baseFijaConIgv?: number;
      nEjecutivas?: number;
      dbTotal?: number;
      objEvaluaciones?: number;
      notas?: string;
      campusNombre?: string;
      ejecutivos?: Array<{
        userId: string;
        userName?: string;
        campusId?: number;
        campusNombre?: string;
        metaMontoSinIgv?: number;
        dbAsignada?: number;
        factorEspecial?: number;
      }>;
    },
  ): Promise<CommissionPeriod> {
    const period = await this.periodRepo.findOne({ where: { id: periodId } });
    if (!period) throw new Error(`Período ${periodId} no encontrado`);

    if (dto.metaMontoConIgv != null) period.metaMontoConIgv = dto.metaMontoConIgv;
    if (dto.metaMontoSinIgv != null) period.metaMontoSinIgv = dto.metaMontoSinIgv;
    if (dto.metaCantidad != null) period.metaCantidad = dto.metaCantidad;
    if (dto.baseFijaConIgv != null) period.baseFijaConIgv = dto.baseFijaConIgv;
    if (dto.nEjecutivas != null) period.nEjecutivas = dto.nEjecutivas;
    if (dto.dbTotal != null) period.dbTotal = dto.dbTotal;
    if (dto.objEvaluaciones != null) period.objEvaluaciones = dto.objEvaluaciones;
    if (dto.notas != null) period.notas = dto.notas;
    if (dto.campusNombre != null) period.campusNombre = dto.campusNombre;

    const saved = await this.periodRepo.save(period);
    if (dto.ejecutivos?.length) {
      await this.saveExecutivosConfig(saved, dto.ejecutivos);
    }
    return saved;
  }

  async deletePeriod(periodId: number): Promise<void> {
    const period = await this.periodRepo.findOne({ where: { id: periodId } });
    if (!period) throw new Error(`Período ${periodId} no encontrado`);
    if (period.estado === 'CERRADO') {
      throw new Error('No se puede eliminar un período cerrado');
    }
    const records = await this.recordRepo.find({ where: { period: { id: periodId } } });
    for (const rec of records) {
      await this.detailRepo.delete({ record: { id: rec.id } });
    }
    await this.rateRepo.delete({ periodId });
    if (await this.hasSedeApoyoPeriodColumn()) {
      await this.dataSource.query(
        `DELETE FROM commission_cerradora_sede_apoyo WHERE period_id = $1`,
        [periodId],
      );
    }
    await this.recordRepo.delete({ period: { id: periodId } });
    await this.periodRepo.delete(periodId);
  }

  async getDashboardByAreaMonth(
    area: 'CIERRE_TTO' | 'OI' | 'CONTROLES' | 'CALL_CENTER',
    year: number,
    month: number,
    campusId?: number,
  ): Promise<CommissionDashboard | null> {
    try {
      let period = await this.findPeriodForDashboard(year, month, area, campusId);

      if (!period) {
        if (area === 'CIERRE_TTO') {
          period = await this.ensurePeriod(year, month, area);
        } else if (area === 'OI') {
          period = await this.ensureOiPeriod(year, month);
        } else if (area === 'CALL_CENTER') {
          period = await this.ensureCallCenterPeriod(year, month);
        } else if (area === 'CONTROLES') {
          if (!campusId) {
            throw new Error('Se requiere campusId para comisiones Controles');
          }
          period = await this.ensureControlesPeriod(year, month, campusId);
        }
      }
      if (!period) return null;

      if (area === 'CONTROLES') {
        return this.syncAndCalculateControles(period.id, true);
      }

      if (area === 'OI') {
        return this.syncAndCalculateOi(period.id);
      }

      if (area === 'CALL_CENTER') {
        return this.syncAndCalculateCallCenter(period.id);
      }

      if (area === 'CIERRE_TTO') {
        const dash = await this.syncAndCalculateCierreTto(period.id);
        if (campusId != null) {
          return this.buildDashboard(period.id, dash.lastSyncAt, undefined, campusId);
        }
        return dash;
      }

      return this.buildDashboard(period.id);
    } catch (err) {
      this.logger.error(
        `getDashboardByAreaMonth ${area} ${year}-${month}: ${err instanceof Error ? err.message : err}`,
      );
      throw err;
    }
  }
}
