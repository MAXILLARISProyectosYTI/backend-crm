import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, LessThanOrEqual, MoreThanOrEqual } from 'typeorm';
import { MetaGerencial } from './meta-gerencial.entity';
import { KpiSnapshot } from './kpi-snapshot.entity';
import { CreateMetaGerencialDto } from './dto/create-meta-gerencial.dto';
import { UpdateMetaGerencialDto } from './dto/update-meta-gerencial.dto';

@Injectable()
export class KpiGerencialService {
  constructor(
    @InjectRepository(MetaGerencial)
    private readonly metaRepo: Repository<MetaGerencial>,
    @InjectRepository(KpiSnapshot)
    private readonly snapshotRepo: Repository<KpiSnapshot>,
  ) {}

  // ── Meta Gerencial CRUD ────────────────────────────────────────────────────

  async createMeta(dto: CreateMetaGerencialDto): Promise<MetaGerencial> {
    const entity = this.metaRepo.create(dto);
    return this.metaRepo.save(entity);
  }

  async findAllMetas(activo?: boolean): Promise<MetaGerencial[]> {
    const where: Record<string, unknown> = {};
    if (activo !== undefined) where.activo = activo;
    return this.metaRepo.find({ where, order: { fechaInicio: 'DESC' } });
  }

  async findMetaById(id: number): Promise<MetaGerencial> {
    const meta = await this.metaRepo.findOne({ where: { id } });
    if (!meta) throw new NotFoundException(`Meta gerencial ${id} no encontrada`);
    return meta;
  }

  async findMetasForDate(fecha: string, campusId?: number): Promise<MetaGerencial[]> {
    const where: Record<string, unknown> = {
      fechaInicio: LessThanOrEqual(fecha),
      fechaFin: MoreThanOrEqual(fecha),
      activo: true,
    };
    if (campusId !== undefined) where.campusId = campusId;
    return this.metaRepo.find({ where });
  }

  async updateMeta(id: number, dto: UpdateMetaGerencialDto): Promise<MetaGerencial> {
    await this.findMetaById(id);
    await this.metaRepo.update(id, { ...dto, updatedAt: new Date() });
    return this.findMetaById(id);
  }

  async deleteMeta(id: number): Promise<void> {
    await this.findMetaById(id);
    await this.metaRepo.delete(id);
  }

  // ── KPI Snapshot ───────────────────────────────────────────────────────────

  async saveSnapshot(
    fecha: string,
    tipoKpi: string,
    datos: Record<string, unknown>,
    campusId?: number,
    metaGerencialId?: number,
  ): Promise<KpiSnapshot> {
    const existing = await this.snapshotRepo.findOne({
      where: { fecha, tipoKpi, campusId: campusId ?? null as unknown as number },
    });

    if (existing) {
      await this.snapshotRepo.update(existing.id, { datos, metaGerencialId: metaGerencialId ?? null });
      return this.snapshotRepo.findOneOrFail({ where: { id: existing.id } });
    }

    const entity = this.snapshotRepo.create({
      fecha,
      tipoKpi,
      datos,
      campusId: campusId ?? null,
      metaGerencialId: metaGerencialId ?? null,
    });
    return this.snapshotRepo.save(entity);
  }

  async getSnapshots(fecha: string, campusId?: number): Promise<KpiSnapshot[]> {
    const where: Record<string, unknown> = { fecha };
    if (campusId !== undefined) where.campusId = campusId;
    return this.snapshotRepo.find({
      where,
      relations: ['metaGerencial'],
      order: { tipoKpi: 'ASC' },
    });
  }

  async getSnapshotRange(
    fechaInicio: string,
    fechaFin: string,
    tipoKpi?: string,
    campusId?: number,
  ): Promise<KpiSnapshot[]> {
    const where: Record<string, unknown> = {
      fecha: Between(fechaInicio, fechaFin),
    };
    if (tipoKpi) where.tipoKpi = tipoKpi;
    if (campusId !== undefined) where.campusId = campusId;
    return this.snapshotRepo.find({
      where,
      relations: ['metaGerencial'],
      order: { fecha: 'ASC', tipoKpi: 'ASC' },
    });
  }
}
