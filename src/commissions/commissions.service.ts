import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { CommissionType } from './commission-type.entity';
import { CommissionPeriod } from './commission-period.entity';
import { CommissionRecord } from './commission-record.entity';
import { CommissionDetail } from './commission-detail.entity';
import { CommissionClosureTag } from './commission-closure-tag.entity';
import { CreatePeriodDto } from './dto/create-period.dto';
import { UpsertRecordDto } from './dto/upsert-record.dto';
import { UpsertPeriodRatesDto } from './dto/upsert-period-rates.dto';
import { UpdatePeriodDto } from './dto/update-period.dto';
import type { UpsertSedeApoyoDto } from './dto/upsert-sede-apoyo.dto';
import { TagClosureDto } from './dto/tag-closure.dto';
import { calculateCierreTto, type ContractSvRow } from './engines/cierre-tto.engine';
import { calculateOi, OI_PORCENTAJE_COMISION_TTOS, type OiExecutivoInput, type OiPeriodInput } from './engines/oi.engine';
import { calculateControles, type ControlesEjecutivoInput, type ControlesPeriodInput } from './engines/controles.engine';
import { CommissionsDataService } from './commissions-data.service';
import { OiSvInvoiceService } from './services/oi-sv-invoice.service';

@Injectable()
export class CommissionsService {
  private readonly logger = new Logger(CommissionsService.name);

  constructor(
    @InjectRepository(CommissionType)
    private readonly typeRepo: Repository<CommissionType>,
    @InjectRepository(CommissionPeriod)
    private readonly periodRepo: Repository<CommissionPeriod>,
    @InjectRepository(CommissionRecord)
    private readonly recordRepo: Repository<CommissionRecord>,
    @InjectRepository(CommissionDetail)
    private readonly detailRepo: Repository<CommissionDetail>,
    @InjectRepository(CommissionClosureTag)
    private readonly tagRepo: Repository<CommissionClosureTag>,
    private readonly dataService: CommissionsDataService,
    private readonly oiSvInvoiceService: OiSvInvoiceService,
  ) {}

  // ── Catálogo ──────────────────────────────────────────────────────────────

  async getTypes(area?: string): Promise<CommissionType[]> {
    const where = area ? { area: area as any, active: true } : { active: true };
    return this.typeRepo.find({ where, order: { area: 'ASC', tratamiento: 'ASC', cuotaNum: 'ASC' } });
  }

  // ── Períodos ──────────────────────────────────────────────────────────────

  async createPeriod(dto: CreatePeriodDto): Promise<CommissionPeriod> {
    try {
      return await this.createPeriodInternal(dto);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('commission_period_area_check') || msg.includes('CALL_CENTER')) {
        this.logger.error(
          `createPeriod ${dto.area} ${dto.year}-${dto.month}: falta migración CALL_CENTER. Ejecuta: npm run migration:run`,
        );
        throw new Error(
          'El área CALL_CENTER no está habilitada en la base de datos. Ejecuta la migración 1749420000000-CommissionCallCenterArea en el backend CRM.',
        );
      }
      throw err;
    }
  }

  private async createPeriodInternal(dto: CreatePeriodDto): Promise<CommissionPeriod> {
    const existing = await this.periodRepo.findOne({
      where: {
        year: dto.year,
        month: dto.month,
        area: dto.area,
        campusId: dto.campusId != null ? dto.campusId : IsNull(),
      },
    });

    if (existing) {
      existing.metaMontoConIgv = dto.metaMontoConIgv ?? existing.metaMontoConIgv;
      existing.metaMontoSinIgv = dto.metaMontoSinIgv ?? existing.metaMontoSinIgv;
      existing.metaCantidad = dto.metaCantidad ?? existing.metaCantidad;
      existing.baseFijaConIgv = dto.baseFijaConIgv ?? existing.baseFijaConIgv;
      existing.nEjecutivas = dto.nEjecutivas ?? existing.nEjecutivas;
      existing.porcentajeComision = dto.area === 'OI' ? OI_PORCENTAJE_COMISION_TTOS : (existing.porcentajeComision ?? null);
      existing.dbTotal = dto.dbTotal ?? existing.dbTotal;
      existing.objEvaluaciones = dto.objEvaluaciones ?? existing.objEvaluaciones;
      if (dto.notas) existing.notas = dto.notas;
      if (dto.campusNombre) existing.campusNombre = dto.campusNombre;
      const saved = await this.periodRepo.save(existing);
      if (dto.ejecutivos?.length) {
        await this.dataService.saveExecutivosConfig(saved, dto.ejecutivos);
      }
      return saved;
    }

    const period = this.periodRepo.create({
      year: dto.year,
      month: dto.month,
      area: dto.area,
      campusId: dto.campusId ?? null,
      campusNombre: dto.campusNombre ?? null,
      metaMontoConIgv: dto.metaMontoConIgv ?? null,
      metaMontoSinIgv: dto.metaMontoSinIgv ?? null,
      metaCantidad: dto.metaCantidad ?? null,
      baseFijaConIgv: dto.baseFijaConIgv ?? (dto.area === 'OI' ? 40000 : null),
      nEjecutivas: dto.nEjecutivas ?? null,
      porcentajeComision: dto.area === 'OI' ? OI_PORCENTAJE_COMISION_TTOS : null,
      dbTotal: dto.dbTotal ?? null,
      objEvaluaciones: dto.objEvaluaciones ?? (dto.area === 'OI' ? 20 : dto.area === 'CALL_CENTER' ? 25 : null),
      notas: dto.notas ?? (dto.area === 'CALL_CENTER'
        ? JSON.stringify({ config: { minEvaVendidas: 25, minEvaAsistidas: 25 } })
        : null),
    });
    const saved = await this.periodRepo.save(period);

    if (dto.ejecutivos?.length) {
      await this.dataService.saveExecutivosConfig(saved, dto.ejecutivos);
    }

    return saved;
  }

  async getPeriods(area?: string): Promise<CommissionPeriod[]> {
    const where = area ? { area: area as any } : {};
    return this.periodRepo.find({
      where,
      order: { year: 'DESC', month: 'DESC' },
      relations: ['records'],
    });
  }

  async getPeriodById(id: number): Promise<CommissionPeriod> {
    const p = await this.periodRepo.findOne({ where: { id }, relations: ['records'] });
    if (!p) throw new NotFoundException(`Período ${id} no encontrado`);
    return p;
  }

  async closePeriod(id: number): Promise<CommissionPeriod> {
    const period = await this.getPeriodById(id);
    period.estado = 'CERRADO';
    return this.periodRepo.save(period);
  }

  // ── Records ───────────────────────────────────────────────────────────────

  async upsertRecord(periodId: number, dto: UpsertRecordDto): Promise<CommissionRecord> {
    const period = await this.getPeriodById(periodId);

    const campusWhere = dto.campusId != null ? dto.campusId : undefined;
    const existing = await this.recordRepo.findOne({
      where: { period: { id: periodId }, userId: dto.userId, campusId: campusWhere },
      relations: ['period'],
    });
    const record = existing ?? this.recordRepo.create({ period, userId: dto.userId, factorEspecial: dto.factorEspecial ?? 1 });

    if (dto.userName) record.userName = dto.userName;
    if (dto.campusId !== undefined) record.campusId = dto.campusId;
    if (dto.campusNombre) record.campusNombre = dto.campusNombre;
    if (dto.montoFacturadoConIgv !== undefined) record.montoFacturadoConIgv = dto.montoFacturadoConIgv;
    if (dto.montoFacturadoSinIgv !== undefined) record.montoFacturadoSinIgv = dto.montoFacturadoSinIgv;
    if (dto.cantidadUnidades !== undefined) record.cantidadUnidades = dto.cantidadUnidades;
    if (dto.dbAsignada !== undefined) record.dbAsignada = dto.dbAsignada;
    if (dto.factorEspecial !== undefined) record.factorEspecial = dto.factorEspecial;
    if (dto.notas) record.notas = dto.notas;

    return this.recordRepo.save(record);
  }

  async getRecordsByPeriod(periodId: number): Promise<CommissionRecord[]> {
    return this.recordRepo.find({
      where: { period: { id: periodId } },
      relations: ['period', 'details', 'details.commissionType'],
      order: { comisionTotal: 'DESC' },
    });
  }

  // ── Etiquetas de contratos (Cerradoras) ───────────────────────────────────

  async tagClosure(dto: TagClosureDto, createdBy: string): Promise<CommissionClosureTag> {
    const existing = await this.tagRepo.findOne({ where: { contractId: dto.contractId } });
    const tag = existing ?? this.tagRepo.create({ contractId: dto.contractId });

    tag.quotationId = dto.quotationId ?? null;
    tag.timing = dto.timing ?? null;
    tag.modifier = dto.modifier ?? null;
    tag.notas = dto.notas ?? null;
    tag.createdBy = createdBy;

    if (dto.periodId) {
      const period = await this.periodRepo.findOne({ where: { id: dto.periodId } });
      tag.period = period ?? null;
    }

    return this.tagRepo.save(tag);
  }

  async getTagsByPeriod(periodId: number): Promise<CommissionClosureTag[]> {
    return this.tagRepo.find({
      where: { period: { id: periodId } },
      relations: ['commissionType'],
    });
  }

  // ── Cálculo Cerradoras ────────────────────────────────────────────────────

  async calculateCierreTto(periodId: number, contracts: ContractSvRow[]) {
    const period = await this.getPeriodById(periodId);
    this.logger.log(`Calculando comisiones CIERRE_TTO para período ${period.year}-${period.month}`);
    const rateByCode = await this.dataService.getPeriodRatesMap(periodId);
    return calculateCierreTto(
      period,
      contracts,
      this.typeRepo,
      this.recordRepo,
      this.detailRepo,
      this.tagRepo,
      rateByCode,
    );
  }

  getPeriodRates(periodId: number) {
    return this.dataService.getPeriodRates(periodId);
  }

  async upsertPeriodRates(periodId: number, dto: UpsertPeriodRatesDto) {
    await this.dataService.upsertPeriodRates(periodId, dto.rates, {
      bonoPersonalTtosThreshold: dto.bonoPersonalTtosThreshold,
      bonoPersonalAmount: dto.bonoPersonalAmount,
      bonoEquipoTtosThreshold: dto.bonoEquipoTtosThreshold,
      bonoEquipoAmount: dto.bonoEquipoAmount,
      porcentajeComisionOi: dto.porcentajeComisionOi,
    });
    return this.dataService.getPeriodRates(periodId);
  }

  syncCierreTtoPeriod(periodId: number) {
    return this.dataService.syncAndCalculateCierreTto(periodId);
  }

  // ── Cálculo OI ────────────────────────────────────────────────────────────

  async calculateOi(periodId: number, periodInput: OiPeriodInput, ejecutivos: OiExecutivoInput[]) {
    const period = await this.getPeriodById(periodId);
    this.logger.log(`Calculando comisiones OI para período ${period.year}-${period.month}`);
    return calculateOi(period, periodInput, ejecutivos, this.recordRepo);
  }

  // ── Cálculo Controles ─────────────────────────────────────────────────────

  async calculateControles(periodId: number, periodInput: ControlesPeriodInput, ejecutivos: ControlesEjecutivoInput[]) {
    const period = await this.getPeriodById(periodId);
    this.logger.log(`Calculando comisiones CONTROLES para período ${period.year}-${period.month} campus ${period.campusId}`);
    return calculateControles(period, periodInput, ejecutivos, this.recordRepo);
  }

  // ── Resumen para pantallas KPI ────────────────────────────────────────────

  async getSummaryByPeriod(periodId: number) {
    const period = await this.getPeriodById(periodId);
    const records = await this.getRecordsByPeriod(periodId);
    const totalComision = records.reduce((acc, r) => acc + Number(r.comisionTotal), 0);
    return {
      period: {
        id: period.id,
        year: period.year,
        month: period.month,
        area: period.area,
        campusId: period.campusId,
        campusNombre: period.campusNombre,
        estado: period.estado,
        metaMontoConIgv: period.metaMontoConIgv,
      },
      totalComision: Math.round(totalComision * 100) / 100,
      ejecutivos: records.map((r) => ({
        userId: r.userId,
        userName: r.userName,
        campusId: r.campusId,
        montoFacturado: r.montoFacturadoConIgv || r.montoFacturadoSinIgv,
        comisionTtos: Number(r.comisionTtos),
        comisionEvaluaciones: Number(r.comisionEvaluaciones),
        comisionBono: Number(r.comisionBono),
        comisionTotal: Number(r.comisionTotal),
        estado: r.estado,
      })),
    };
  }

  async getSummaryByAreaAndMonth(area: string, year: number, month: number) {
    const periods = await this.periodRepo.find({
      where: { area: area as any, year, month },
    });
    const summaries = await Promise.all(periods.map((p) => this.getSummaryByPeriod(p.id)));
    return summaries;
  }

  // ── Dashboard KPI (meta + cálculo automático) ─────────────────────────────

  getDashboard(area: 'CIERRE_TTO' | 'OI' | 'CONTROLES' | 'CALL_CENTER', year: number, month: number, campusId?: number) {
    return this.dataService.getDashboardByAreaMonth(area, year, month, campusId);
  }

  getFacturacionMtd(
    area: 'CIERRE_TTO' | 'OI' | 'CONTROLES' | 'CALL_CENTER',
    year: number,
    month: number,
    campusId?: number,
  ) {
    return this.dataService.getFacturacionMtd(area, year, month, campusId);
  }

  syncControlesPeriod(periodId: number) {
    return this.dataService.syncAndCalculateControles(periodId, true);
  }

  syncOiPeriod(periodId: number) {
    return this.dataService.syncAndCalculateOi(periodId);
  }

  syncCallCenterPeriod(periodId: number) {
    return this.dataService.syncAndCalculateCallCenter(periodId);
  }

  pingOiSvDatabase(year: number, month: number, campusId?: number) {
    return this.dataService.diagnoseOiSv(year, month, campusId ?? null);
  }

  async getDashboardByPeriodId(periodId: number) {
    const period = await this.getPeriodById(periodId);
    try {
      if (period.area === 'CONTROLES') {
        return await this.dataService.getControlesDashboard(periodId);
      }
      if (period.area === 'OI') {
        return await this.dataService.getOiDashboard(periodId);
      }
      if (period.area === 'CALL_CENTER') {
        return await this.dataService.getCallCenterDashboard(periodId);
      }
      if (period.area === 'CIERRE_TTO') {
        return await this.dataService.getCierreTtoDashboard(periodId);
      }
      return await this.dataService.buildDashboard(periodId);
    } catch (err) {
      this.logger.error(
        `getDashboardByPeriodId ${periodId} (${period.area}): ${err instanceof Error ? err.message : err}`,
      );
      return this.dataService.buildDashboard(periodId);
    }
  }

  listCerradorasEjecutivos() {
    return this.dataService.listCerradorasEjecutivos();
  }

  getCerradorasFacturacionResumen(year: number, month: number, campusId?: number) {
    return this.dataService.getCerradorasFacturacionResumen(year, month, campusId);
  }

  listVentasStaffCatalog(area?: 'CALL_CENTER' | 'OI' | 'ALL') {
    return this.dataService.listVentasStaffCatalog(area ?? 'ALL');
  }

  getExportDetail(periodId: number) {
    return this.dataService.getExportDetail(periodId);
  }

  async listSedeApoyo(periodId?: number) {
    try {
      return await this.dataService.listSedeApoyo(periodId);
    } catch (err) {
      this.logger.error(
        `listSedeApoyo periodId=${periodId ?? 'all'}: ${err instanceof Error ? err.message : err}`,
      );
      return [];
    }
  }

  upsertSedeApoyo(items: UpsertSedeApoyoDto['items'], periodId?: number) {
    return this.dataService.upsertSedeApoyo(items, periodId);
  }

  deleteSedeApoyo(id: number) {
    return this.dataService.deleteSedeApoyo(id);
  }

  updatePeriod(id: number, dto: UpdatePeriodDto) {
    return this.dataService.updatePeriodMeta(id, dto);
  }

  deletePeriod(id: number) {
    return this.dataService.deletePeriod(id);
  }

  async getCallCenterDiagnostics(periodId: number) {
    const period = await this.getPeriodById(periodId);
    return this.dataService.getCallCenterDiagnostics(period);
  }
}
