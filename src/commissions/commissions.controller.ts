import {
  Controller, Get, Post, Patch, Body, Param, ParseIntPipe,
  Query, Request, UseGuards,
} from '@nestjs/common';
import { CommissionsService } from './commissions.service';
import { CreatePeriodDto } from './dto/create-period.dto';
import { UpsertRecordDto } from './dto/upsert-record.dto';
import { TagClosureDto } from './dto/tag-closure.dto';
import { UpsertPeriodRatesDto } from './dto/upsert-period-rates.dto';
import { UpsertSedeApoyoDto } from './dto/upsert-sede-apoyo.dto';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import type { OiExecutivoInput, OiPeriodInput } from './engines/oi.engine';
import type { ControlesEjecutivoInput, ControlesPeriodInput } from './engines/controles.engine';
import type { ContractSvRow } from './engines/cierre-tto.engine';

@UseGuards(JwtAuthGuard)
@Controller('commissions')
export class CommissionsController {
  constructor(private readonly service: CommissionsService) {}

  // ── Catálogo ──────────────────────────────────────────────────────────────

  @Get('types')
  getTypes(@Query('area') area?: string) {
    return this.service.getTypes(area);
  }

  @Get('cerradoras/ejecutivos')
  listCerradorasEjecutivos() {
    return this.service.listCerradorasEjecutivos();
  }

  @Get('cerradoras/sede-apoyo')
  listSedeApoyo() {
    return this.service.listSedeApoyo();
  }

  @Patch('cerradoras/sede-apoyo')
  upsertSedeApoyo(@Body() dto: UpsertSedeApoyoDto) {
    return this.service.upsertSedeApoyo(dto.items);
  }

  @Patch('cerradoras/sede-apoyo/:id/deactivate')
  deactivateSedeApoyo(@Param('id', ParseIntPipe) id: number) {
    return this.service.deleteSedeApoyo(id);
  }

  // ── Períodos ──────────────────────────────────────────────────────────────

  @Post('periods')
  createPeriod(@Body() dto: CreatePeriodDto) {
    return this.service.createPeriod(dto);
  }

  @Get('periods')
  getPeriods(@Query('area') area?: string) {
    return this.service.getPeriods(area);
  }

  @Get('periods/:id')
  getPeriod(@Param('id', ParseIntPipe) id: number) {
    return this.service.getPeriodById(id);
  }

  @Patch('periods/:id/close')
  closePeriod(@Param('id', ParseIntPipe) id: number) {
    return this.service.closePeriod(id);
  }

  // ── Records ───────────────────────────────────────────────────────────────

  @Post('periods/:id/records')
  upsertRecord(
    @Param('id', ParseIntPipe) periodId: number,
    @Body() dto: UpsertRecordDto,
  ) {
    return this.service.upsertRecord(periodId, dto);
  }

  @Get('periods/:id/records')
  getRecords(@Param('id', ParseIntPipe) id: number) {
    return this.service.getRecordsByPeriod(id);
  }

  // ── Cálculo ───────────────────────────────────────────────────────────────

  @Post('periods/:id/calculate/cierre-tto')
  calculateCierreTto(
    @Param('id', ParseIntPipe) periodId: number,
    @Body() body: { contracts: ContractSvRow[] },
  ) {
    return this.service.calculateCierreTto(periodId, body.contracts);
  }

  @Post('periods/:id/calculate/oi')
  calculateOi(
    @Param('id', ParseIntPipe) periodId: number,
    @Body() body: { periodInput: OiPeriodInput; ejecutivos: OiExecutivoInput[] },
  ) {
    return this.service.calculateOi(periodId, body.periodInput, body.ejecutivos);
  }

  @Post('periods/:id/calculate/controles')
  calculateControles(
    @Param('id', ParseIntPipe) periodId: number,
    @Body() body: { periodInput: ControlesPeriodInput; ejecutivos: ControlesEjecutivoInput[] },
  ) {
    return this.service.calculateControles(periodId, body.periodInput, body.ejecutivos);
  }

  // ── Etiquetas (Cerradoras) ────────────────────────────────────────────────

  @Post('closures/tag')
  tagClosure(@Body() dto: TagClosureDto, @Request() req: any) {
    const createdBy: string = req.user?.id ?? 'unknown';
    return this.service.tagClosure(dto, createdBy);
  }

  @Get('periods/:id/closures/tags')
  getTagsByPeriod(@Param('id', ParseIntPipe) id: number) {
    return this.service.getTagsByPeriod(id);
  }

  // ── Resumen KPI ───────────────────────────────────────────────────────────

  @Get('periods/:id/summary')
  getSummary(@Param('id', ParseIntPipe) id: number) {
    return this.service.getSummaryByPeriod(id);
  }

  @Get('dashboard')
  getDashboard(
    @Query('area') area: 'CIERRE_TTO' | 'OI' | 'CONTROLES',
    @Query('year', ParseIntPipe) year: number,
    @Query('month', ParseIntPipe) month: number,
    @Query('campusId') campusId?: string,
  ) {
    const campus = campusId ? parseInt(campusId, 10) : undefined;
    return this.service.getDashboard(area, year, month, campus);
  }

  @Get('periods/:id/dashboard')
  getDashboardByPeriod(@Param('id', ParseIntPipe) id: number) {
    return this.service.getDashboardByPeriodId(id);
  }

  @Get('periods/:id/rates')
  getPeriodRates(@Param('id', ParseIntPipe) id: number) {
    return this.service.getPeriodRates(id);
  }

  @Patch('periods/:id/rates')
  upsertPeriodRates(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpsertPeriodRatesDto,
  ) {
    return this.service.upsertPeriodRates(id, dto);
  }

  @Post('periods/:id/sync/cierre-tto')
  syncCierreTto(@Param('id', ParseIntPipe) id: number) {
    return this.service.syncCierreTtoPeriod(id);
  }

  @Post('periods/:id/sync/controles')
  syncControles(@Param('id', ParseIntPipe) id: number) {
    return this.service.syncControlesPeriod(id);
  }

  @Post('periods/:id/sync/oi')
  syncOi(@Param('id', ParseIntPipe) id: number) {
    return this.service.syncOiPeriod(id);
  }

  @Get('summary')
  getSummaryByAreaAndMonth(
    @Query('area') area: string,
    @Query('year', ParseIntPipe) year: number,
    @Query('month', ParseIntPipe) month: number,
  ) {
    return this.service.getSummaryByAreaAndMonth(area, year, month);
  }
}
