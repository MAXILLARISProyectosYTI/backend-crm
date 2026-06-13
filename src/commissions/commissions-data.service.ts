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
import { SUB_CAMPAIGN_NAMES, TEAMS_IDS } from '../globals/ids';

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
    // Siempre recalcular desde CRM al abrir/cambiar mes para reflejar cierres actuales.
    return this.syncAndCalculateCierreTto(periodId);
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

  /** Garantiza ejecutivas OI en el período (backfill si quedó vacío). */
  private async ensureOiEjecutivosConfigured(period: CommissionPeriod): Promise<void> {
    const existing = await this.recordRepo.count({ where: { period: { id: period.id } } });
    if (existing > 0) return;

    const prevMonth = period.month === 1 ? 12 : period.month - 1;
    const prevYear = period.month === 1 ? period.year - 1 : period.year;
    const prev = await this.periodRepo.findOne({
      where: { year: prevYear, month: prevMonth, area: 'OI', campusId: IsNull() },
    });

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
      if (prevRecords.length > 0) return;
    }

    const oiTeam = await this.listOiEjecutivos();
    if (oiTeam.length > 0) {
      for (const eje of oiTeam) {
        await this.recordRepo.save(this.recordRepo.create({
          period,
          userId: eje.userId,
          userName: eje.userName,
          campusId: 1,
          campusNombre: this.commissionCampusNombre(1),
          factorEspecial: 1,
          estado: 'PENDIENTE',
        }));
      }
      return;
    }

    const fallbackId = await this.resolveCrmUserId('christian.melendez');
    await this.recordRepo.save(this.recordRepo.create({
      period,
      userId: fallbackId,
      userName: 'Christian Melendez',
      campusId: 1,
      campusNombre: this.commissionCampusNombre(1),
      factorEspecial: 1,
      estado: 'PENDIENTE',
    }));
  }

  /** Miembros del equipo Ejecutivas OI (CRM). */
  async listOiEjecutivos(): Promise<Array<{ userId: string; userName: string; userLogin: string | null }>> {
    const rows: Array<{
      user_id: string;
      display_name: string | null;
      user_login: string | null;
    }> = await this.dataSource.query(
      `
      SELECT u.id AS user_id,
        COALESCE(
          NULLIF(TRIM(CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, ''))), ''),
          u.user_name
        ) AS display_name,
        u.user_name AS user_login
      FROM "user" u
      INNER JOIN team_user tu ON tu.user_id = u.id
        AND tu.team_id = $1
        AND COALESCE(tu.deleted, false) = false
      WHERE COALESCE(u.deleted, false) = false
        AND COALESCE(u.is_active, true) = true
      ORDER BY display_name ASC NULLS LAST, u.user_name ASC
      `,
      [OI_TEAM_ID],
    );
    return rows.map((r) => ({
      userId: r.user_id,
      userName: r.display_name ?? r.user_login ?? r.user_id,
      userLogin: r.user_login,
    }));
  }

  /** Resuelve login SV / username → id CRM canónico. */
  private async resolveCrmUserId(raw: string): Promise<string> {
    const key = raw.trim();
    if (!key) return key;
    const map = await this.buildCrmUsernameToUserIdMap();
    return map.get(key.toLowerCase()) ?? key;
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

  /** Configuración de apoyo entre sedes (activa). */
  async listSedeApoyo(): Promise<Array<{
    id: number;
    userId: string;
    userName: string | null;
    campusId: number;
    campusNombre: string;
    porcentaje: number;
    activo: boolean;
  }>> {
    const rows = await this.sedeApoyoRepo.find({ where: { activo: true }, order: { userId: 'ASC' } });
    if (rows.length === 0) return [];

    const userIds = [...new Set(rows.map((r) => r.userId))];
    const users: Array<{ id: string; user_name: string | null; first_name: string | null; last_name: string | null }> =
      await this.dataSource.query(
        `SELECT id, user_name, first_name, last_name FROM "user" WHERE id = ANY($1::text[])`,
        [userIds],
      );
    const nameById = new Map(users.map((u) => [
      u.id,
      [u.first_name, u.last_name].filter(Boolean).join(' ').trim() || u.user_name || u.id,
    ]));

    return rows.map((r) => ({
      id: r.id,
      userId: r.userId,
      userName: nameById.get(r.userId) ?? null,
      campusId: r.campusId,
      campusNombre: this.commissionCampusNombre(r.campusId),
      porcentaje: Number(r.porcentaje),
      activo: r.activo,
    }));
  }

  async upsertSedeApoyo(items: Array<{ userId: string; campusId: number; porcentaje: number; activo?: boolean }>): Promise<void> {
    for (const item of items) {
      const existing = await this.sedeApoyoRepo.findOne({
        where: { userId: item.userId, campusId: item.campusId },
      });
      const row = existing ?? this.sedeApoyoRepo.create({
        userId: item.userId,
        campusId: item.campusId,
      });
      row.porcentaje = item.porcentaje;
      row.activo = item.activo ?? true;
      await this.sedeApoyoRepo.save(row);
    }
  }

  async deleteSedeApoyo(id: number): Promise<void> {
    await this.sedeApoyoRepo.update(id, { activo: false });
  }

  private async buildCierreTtoSedeConfig(): Promise<CierreTtoSedeConfig> {
    const catalog = await this.listCerradorasEjecutivos();
    const homeCampusByUser = new Map<string, number>();
    for (const e of catalog) {
      homeCampusByUser.set(e.userId, e.campusId);
    }

    const apoyoRows = await this.sedeApoyoRepo.find({ where: { activo: true } });
    const apoyoFactorByUserCampus = new Map<string, number>();
    for (const row of apoyoRows) {
      apoyoFactorByUserCampus.set(`${row.userId}__${row.campusId}`, Number(row.porcentaje));
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
    const apoyoRows = await this.sedeApoyoRepo.find({ where: { activo: true } });
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
    const sedeConfig = await this.buildCierreTtoSedeConfig();
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
    for (const eje of ejecutivos) {
      const resolvedUserId = await this.resolveCrmUserId(eje.userId);
      const campusId = eje.campusId ?? period.campusId ?? undefined;
      const existing = await this.recordRepo.findOne({
        where: {
          period: { id: period.id },
          userId: resolvedUserId,
          ...(campusId != null ? { campusId } : {}),
        },
        relations: ['period'],
      });
      const record = existing ?? this.recordRepo.create({
        period,
        userId: resolvedUserId,
        campusId: campusId ?? null,
        factorEspecial: eje.factorEspecial ?? 1,
      });
      if (eje.userName) record.userName = eje.userName;
      if (eje.campusNombre) record.campusNombre = eje.campusNombre;
      if (eje.dbAsignada != null) record.dbAsignada = eje.dbAsignada;
      if (eje.factorEspecial != null) record.factorEspecial = eje.factorEspecial;
      if (eje.metaMontoSinIgv != null) record.metaMontoIndividual = eje.metaMontoSinIgv;
      record.estado = record.estado === 'CALCULADO' ? record.estado : 'PENDIENTE';
      await this.recordRepo.save(record);
    }
  }

  /**
   * Sincroniza facturación SV del mes, agrega por ejecutivo y recalcula comisiones Controles.
   */
  async syncAndCalculateControles(periodId: number, forceSync = true): Promise<CommissionDashboard> {
    const period = await this.periodRepo.findOne({ where: { id: periodId } });
    if (!period) throw new Error(`Período ${periodId} no encontrado`);
    if (period.area !== 'CONTROLES') throw new Error('El período no es de área CONTROLES');

    await this.ensureControlesEjecutivosConfigured(period);

    const { start, end } = this.monthRange(period.year, period.month);
    let rows: Record<string, unknown>[] = [];
    let lastSyncAt: string | null = null;

    try {
      const { tokenSv } = await this.svServices.getTokenSvAdmin();
      rows = await this.svServices.getFacturacionControlesFromSv(
        tokenSv,
        start,
        end,
        period.campusId ?? undefined,
      );
      lastSyncAt = new Date().toISOString();
    } catch (err) {
      this.logger.warn(
        `Consulta SV controles (${start}→${end}) falló, usando cache: ${err instanceof Error ? err.message : err}`,
      );
      if (forceSync) {
        try {
          await this.crmControlesService.syncFacturacionFromSv();
        } catch (syncErr) {
          this.logger.warn(`Sync SV facturación falló: ${syncErr instanceof Error ? syncErr.message : syncErr}`);
        }
      }
      const { data, meta } = this.crmControlesService.getFacturacionSnapshot();
      lastSyncAt = meta.lastSyncAt;
      const campusFilter = period.campusId;
      rows = data.filter((row) => {
        const date = this.parseDate(row.invoice_date ?? row.fecha_abono);
        if (!date || !this.inMonth(date, period.year, period.month)) return false;
        if (campusFilter != null && Number(row.campus_id) !== campusFilter) return false;
        return true;
      }) as Record<string, unknown>[];
    }

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

    const ejecutivosInput: ControlesEjecutivoInput[] = configRecords.map((rec) => {
      const key = rec.userId.trim().toLowerCase();
      const montoIndividual = byEjecutivo.get(key) ?? 0;
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
    if (userIds.length === 0) return new Map();
    const rows: Array<{ id: string; user_name: string | null; c_usersv: string | null }> =
      await this.dataSource.query(
        `SELECT id, user_name, c_usersv FROM "user"
         WHERE id = ANY($1::text[])
            OR LOWER(user_name) = ANY(SELECT LOWER unnest($1::text[]))
            OR LOWER(c_usersv) = ANY(SELECT LOWER unnest($1::text[]))`,
        [userIds],
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

  /**
   * Agrega facturado (invoice SV) y evaluaciones por userId CRM.
   * Facturación: ejecutiva OI del paciente (union_doctor_patient); fallback facturador SV.
   * Evaluaciones: ejecutiva OI asignada al paciente.
   */
  private async fetchOiMetricsFromSv(
    year: number,
    month: number,
    campusId?: number | null,
  ): Promise<Map<string, { facturadoConIgv: number; evaluaciones: number }>> {
    const { start, end } = this.monthRange(year, month);
    const map = new Map<string, { facturadoConIgv: number; evaluaciones: number }>();

    const { tokenSv } = await this.svServices.getTokenSvAdmin();
    const usernameToCrmId = await this.buildCrmUsernameToUserIdMap();

    const addToMap = (
      username: string,
      updater: (prev: { facturadoConIgv: number; evaluaciones: number }) => void,
    ) => {
      const u = username.trim().toLowerCase();
      if (!u || u === 'sin_asignar') return;
      const crmId = usernameToCrmId.get(u);
      const keys = new Set<string>([u]);
      if (crmId) keys.add(crmId);
      const existing = map.get(u) ?? (crmId ? map.get(crmId) : undefined);
      const prev = existing ?? { facturadoConIgv: 0, evaluaciones: 0 };
      updater(prev);
      for (const key of keys) {
        map.set(key, prev);
      }
    };

    const [factRawRows, evaRawRows] = await Promise.all([
      this.svServices.getFacturacionOiFromSv(tokenSv, start, end, campusId ?? undefined),
      this.svServices.getEvaluacionesOiFromSv(tokenSv, start, end, campusId ?? undefined),
    ]);

    for (const row of factRawRows) {
      const ejecutivoOi = String(row.ejecutivo_oi ?? '').trim().toLowerCase();
      const facturador = String(row.facturador_username ?? '').trim().toLowerCase();
      const attrib = (ejecutivoOi && ejecutivoOi !== 'sin_asignar')
        ? ejecutivoOi
        : facturador;
      const amountPen = Number(row.amount_pen ?? row.amount ?? 0);
      if (!attrib || amountPen <= 0) continue;
      addToMap(attrib, (prev) => { prev.facturadoConIgv += amountPen; });
    }

    for (const row of evaRawRows) {
      const ejecutivo = String(row.ejecutivo_oi ?? '').trim().toLowerCase();
      const evals = Number(row.evaluaciones ?? 1);
      if (!ejecutivo || ejecutivo === 'sin_asignar') continue;
      addToMap(ejecutivo, (prev) => { prev.evaluaciones += evals; });
    }

    this.logger.log(
      `OI SV HTTP ${year}-${month}: ${map.size} claves, ${factRawRows.length} líneas factura, ${evaRawRows.length} grupos eval`,
    );
    return map;
  }

  /** Busca métricas SV para un record OI probando userId, login SV y c_usersv. */
  private resolveOiMetricsForRecord(
    rec: CommissionRecord,
    svMetrics: Map<string, { facturadoConIgv: number; evaluaciones: number }>,
    svKeyMap: Map<string, string>,
    usernameToCrmId: Map<string, string>,
  ): { facturadoConIgv: number; evaluaciones: number } | undefined {
    const uid = rec.userId.trim();
    const candidates = new Set<string>([
      uid,
      uid.toLowerCase(),
      svKeyMap.get(uid) ?? '',
      svKeyMap.get(uid.toLowerCase()) ?? '',
    ]);
    const crmFromLogin = usernameToCrmId.get(uid.toLowerCase());
    if (crmFromLogin) candidates.add(crmFromLogin);

    for (const key of candidates) {
      if (!key) continue;
      const hit = svMetrics.get(key) ?? svMetrics.get(key.toLowerCase());
      if (hit) return hit;
    }
    return undefined;
  }

  /**
   * Sincroniza montos OI desde SV (facturas + evaluaciones) y recalcula comisiones.
   */
  async syncAndCalculateOi(periodId: number): Promise<CommissionDashboard> {
    const period = await this.periodRepo.findOne({ where: { id: periodId } });
    if (!period) throw new Error(`Período ${periodId} no encontrado`);
    if (period.area !== 'OI') throw new Error('El período no es de área OI');

    await this.ensureOiEjecutivosConfigured(period);

    const configRecords = await this.recordRepo.find({
      where: { period: { id: periodId } },
      relations: ['period'],
    });

    if (configRecords.length === 0) {
      this.logger.warn(`Período OI ${periodId} sin ejecutivos configurados`);
      return this.buildDashboard(periodId);
    }

    const svMetrics = await this.fetchOiMetricsFromSv(period.year, period.month, period.campusId);
    const [svKeyMap, usernameToCrmId] = await Promise.all([
      this.buildCrmUserSvKeyMap(configRecords.map((r) => r.userId)),
      this.buildCrmUsernameToUserIdMap(),
    ]);

    const ejecutivosInput: OiExecutivoInput[] = configRecords.map((rec) => {
      const metrics = this.resolveOiMetricsForRecord(rec, svMetrics, svKeyMap, usernameToCrmId);
      return {
        userId: rec.userId,
        userName: rec.userName ?? rec.userId,
        campusId: rec.campusId ?? period.campusId ?? null,
        campusNombre: rec.campusNombre ?? '',
        montoFacturadoConIgv: metrics?.facturadoConIgv ?? 0,
        cantidadEvaluaciones: metrics?.evaluaciones ?? 0,
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

    period.notas = JSON.stringify({
      syncedAt: new Date().toISOString(),
      source: 'sv-invoice-http',
      facturacionLineas: svMetrics.size,
      facturadoTotal: ejecutivosInput.reduce((s, e) => s + e.montoFacturadoConIgv, 0),
    });
    await this.periodRepo.save(period);

    return this.buildDashboard(periodId, new Date().toISOString());
  }

  async getControlesDashboard(periodId: number): Promise<CommissionDashboard> {
    return this.syncAndCalculateControles(periodId, true);
  }

  async getOiDashboard(periodId: number): Promise<CommissionDashboard> {
    return this.syncAndCalculateOi(periodId);
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
    const isCierre = period.area === 'CIERRE_TTO';
    const baseFija = Number(period.baseFijaConIgv ?? 0);
    const cerradorasCatalog = isCierre ? await this.listCerradorasEjecutivos() : undefined;

    const facturacionGrupalSinIgv = grupalOverride ?? filteredRecords.reduce((sum, r) => {
      if (isOi) return sum + Number(r.montoFacturadoConIgv ?? 0);
      if (isCierre) return sum + Number(r.comisionTotal ?? 0);
      return sum + Number(r.montoFacturadoSinIgv ?? 0);
    }, 0);

    const metaGrupal = isOi
      ? Number(period.metaMontoConIgv ?? 0)
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
        comisionTtos: isOi || isCierre ? Number(r.comisionTtos ?? 0) : undefined,
        comisionEvaluaciones: isOi ? Number(r.comisionEvaluaciones ?? 0) : undefined,
        comisionBono: isOi || isCierre ? Number(r.comisionBono ?? 0) : undefined,
        comisionOi: isCierre ? Number(r.comisionOi ?? 0) : undefined,
        montoFacturadoOiConIgv: isCierre ? Number(r.montoFacturadoOiConIgv ?? 0) : undefined,
        porcentajeSedeApoyo: isCierre && r.porcentajeSedeApoyo != null
          ? Number(r.porcentajeSedeApoyo)
          : undefined,
        cantidadEvaluaciones: isOi ? Number(r.cantidadUnidades ?? 0) : undefined,
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
      lastSyncAt: lastSyncAt ?? period.updatedAt?.toISOString() ?? null,
      ejecutivos,
      chartData,
      detalleLineas: detalleLineas.length > 0 ? detalleLineas : undefined,
      chartByTratamiento,
      chartByModalidad,
      pendingClosures: isCierre ? detalleLineas.filter((l) => !l.timing).length : undefined,
      cerradorasCatalog,
      syncStats,
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

  async getDashboardByAreaMonth(
    area: 'CIERRE_TTO' | 'OI' | 'CONTROLES',
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
        } else if (area === 'CONTROLES') {
          period = await this.ensureControlesPeriod(year, month, campusId ?? 1);
        }
      }
      if (!period) return null;

      if (area === 'CONTROLES') {
        return this.syncAndCalculateControles(period.id, true);
      }

      if (area === 'OI') {
        return this.syncAndCalculateOi(period.id);
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
