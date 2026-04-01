import {
  Controller, Get, Post, Patch, Delete, Param, Query, Body, UseGuards,
  ParseIntPipe,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { KpiGerencialService } from './kpi-gerencial.service';
import { CreateMetaGerencialDto } from './dto/create-meta-gerencial.dto';
import { UpdateMetaGerencialDto } from './dto/update-meta-gerencial.dto';

@Controller('kpi-gerencial')
@UseGuards(JwtAuthGuard)
export class KpiGerencialController {
  constructor(private readonly service: KpiGerencialService) {}

  // ── Meta Gerencial ─────────────────────────────────────────────────────────

  @Post('metas')
  createMeta(@Body() dto: CreateMetaGerencialDto) {
    return this.service.createMeta(dto);
  }

  @Get('metas')
  findAllMetas(@Query('activo') activo?: string) {
    const flag = activo === 'true' ? true : activo === 'false' ? false : undefined;
    return this.service.findAllMetas(flag);
  }

  @Get('metas/vigentes')
  findMetasVigentes(@Query('fecha') fecha?: string, @Query('campusId') campusId?: string) {
    const f = fecha || new Date().toISOString().slice(0, 10);
    return this.service.findMetasForDate(f, campusId ? +campusId : undefined);
  }

  @Get('metas/:id')
  findMetaById(@Param('id', ParseIntPipe) id: number) {
    return this.service.findMetaById(id);
  }

  @Patch('metas/:id')
  updateMeta(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateMetaGerencialDto) {
    return this.service.updateMeta(id, dto);
  }

  @Delete('metas/:id')
  deleteMeta(@Param('id', ParseIntPipe) id: number) {
    return this.service.deleteMeta(id);
  }

  // ── Snapshots ──────────────────────────────────────────────────────────────

  @Get('snapshots')
  getSnapshots(@Query('fecha') fecha?: string, @Query('campusId') campusId?: string) {
    const f = fecha || new Date().toISOString().slice(0, 10);
    return this.service.getSnapshots(f, campusId ? +campusId : undefined);
  }

  @Get('snapshots/rango')
  getSnapshotRange(
    @Query('fechaInicio') fechaInicio: string,
    @Query('fechaFin') fechaFin: string,
    @Query('tipoKpi') tipoKpi?: string,
    @Query('campusId') campusId?: string,
  ) {
    return this.service.getSnapshotRange(
      fechaInicio,
      fechaFin,
      tipoKpi,
      campusId ? +campusId : undefined,
    );
  }

  @Post('snapshots')
  saveSnapshot(
    @Body() body: { fecha: string; tipoKpi: string; datos: Record<string, unknown>; campusId?: number; metaGerencialId?: number },
  ) {
    return this.service.saveSnapshot(
      body.fecha, body.tipoKpi, body.datos, body.campusId, body.metaGerencialId,
    );
  }
}
