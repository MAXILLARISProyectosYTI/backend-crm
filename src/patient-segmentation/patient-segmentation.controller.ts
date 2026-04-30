import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PatientSegmentationService } from './patient-segmentation.service';
import { UserService } from '../user/user.service';
import { FilterSegmentsDto } from './dto/filter-segments.dto';
import { UpdateRuleDto } from './dto/update-rule.dto';

@UseGuards(JwtAuthGuard)
@Controller('patient-segmentation')
export class PatientSegmentationController {
  constructor(
    private readonly segmentationService: PatientSegmentationService,
    private readonly userService: UserService,
  ) {}

  /**
   * GET /patient-segmentation
   * Lista paginada de pacientes con filtros dinámicos.
   * Acceso: cualquier usuario autenticado del CRM.
   */
  @Get()
  async getList(@Query() filters: FilterSegmentsDto) {
    return this.segmentationService.getList(filters);
  }

  /**
   * GET /patient-segmentation/stats
   * Totales y métricas por segmento. Bloque del dashboard.
   */
  @Get('stats')
  async getStats(@Query('companyId') companyId?: string) {
    return this.segmentationService.getStats(companyId ? Number(companyId) : undefined);
  }

  /**
   * GET /patient-segmentation/evolution?days=30
   * Evolución histórica de transiciones de segmento.
   */
  @Get('evolution')
  async getEvolution(@Query('days') days?: string) {
    return this.segmentationService.getEvolution(days ? Number(days) : undefined);
  }

  /**
   * GET /patient-segmentation/alerts/critical
   * Pacientes CRITICOS para contacto manual.
   */
  @Get('alerts/critical')
  async getAlertsCritical(@Query('companyId') companyId?: string) {
    return this.segmentationService.getAlertsCritical(companyId ? Number(companyId) : undefined);
  }

  /**
   * GET /patient-segmentation/alerts/at-risk
   * Pacientes EN_RIESGO sin cita futura (para campaña de reagendamiento).
   */
  @Get('alerts/at-risk')
  async getAlertsAtRisk(@Query('companyId') companyId?: string) {
    return this.segmentationService.getAlertsAtRisk(companyId ? Number(companyId) : undefined);
  }

  /**
   * GET /patient-segmentation/rules
   * Reglas configuradas. Acceso: cualquier usuario autenticado.
   */
  @Get('rules')
  async getRules() {
    return this.segmentationService.getRules();
  }

  /**
   * PATCH /patient-segmentation/rules
   * Modifica umbrales de segmentación. Solo administradores (user.type === 'admin').
   */
  @Patch('rules')
  async updateRule(@Body() dto: UpdateRuleDto, @Req() req: any) {
    const isAdmin = await this.userService.isAdmin(req.user.userId);
    if (!isAdmin) {
      throw new ForbiddenException('Solo administradores pueden modificar reglas de segmentación');
    }
    return this.segmentationService.updateRule(dto);
  }

  /**
   * POST /patient-segmentation/recalculate
   * Recálculo manual. Solo administradores.
   */
  @Post('recalculate')
  async recalculate(
    @Body() body: { patientIds?: number[] },
    @Req() req: any,
  ) {
    const isAdmin = await this.userService.isAdmin(req.user.userId);
    if (!isAdmin) {
      throw new ForbiddenException('Solo administradores pueden ejecutar recálculos manuales');
    }
    return this.segmentationService.recalculate(body.patientIds);
  }

  /**
   * GET /patient-segmentation/:patientId
   * Segmento actual + historial de un paciente.
   */
  @Get(':patientId')
  async getPatientDetail(@Param('patientId', ParseIntPipe) patientId: number) {
    return this.segmentationService.getPatientDetail(patientId);
  }

  /**
   * GET /patient-segmentation/:patientId/history
   * Historial de cambios de segmento de un paciente.
   */
  @Get(':patientId/history')
  async getPatientHistory(@Param('patientId', ParseIntPipe) patientId: number) {
    return this.segmentationService.getPatientHistory(patientId);
  }
}
