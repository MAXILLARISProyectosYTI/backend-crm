import {
  Controller,
  Get,
  Post,
  Param,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { AdminUserGuard } from 'src/auth/guards/admin-user.guard';
import { CrmControlesService } from './crm-controles.service';
import type { CrmControlesPacientesResponse } from './crm-controles.types';

/**
 * API interna del CRM para la vista "CRM Controles".
 * Los datos vienen de cache alimentada por polling a SV (ver CrmControlesCronService).
 *
 * Base URL típica: {VITE_CRM_API_BASE_URL}/crm-controles/...
 */
@UseGuards(JwtAuthGuard, AdminUserGuard)
@Controller('crm-controles')
export class CrmControlesController {
  constructor(private readonly crmControlesService: CrmControlesService) {}

  /** Listado cacheado (última sync desde SV). */
  @Get('pacientes')
  getPacientes(): CrmControlesPacientesResponse {
    return this.crmControlesService.getSnapshot();
  }

  /** Estado de sync (sin lista completa; útil para monitoreo). */
  @Get('health')
  getHealth(): { meta: CrmControlesPacientesResponse['meta']; count: number } {
    const { data, meta } = this.crmControlesService.getSnapshot();
    return { meta, count: data.length };
  }

  /** Fuerza una sincronización inmediata de pacientes con SV (solo admin). */
  @Post('sync')
  async postSync(): Promise<CrmControlesPacientesResponse> {
    await this.crmControlesService.syncFromSv();
    return this.crmControlesService.getSnapshot();
  }

  /** Sesiones de control OFM cacheadas (última sync desde SV). */
  @Get('controles')
  getControles(): CrmControlesPacientesResponse {
    return this.crmControlesService.getControlesSnapshot();
  }

  /** Fuerza sincronización de sesiones de control con SV. */
  @Post('controles/sync')
  async postControlesSync(): Promise<CrmControlesPacientesResponse> {
    await this.crmControlesService.syncControlesFromSv();
    return this.crmControlesService.getControlesSnapshot();
  }

  /**
   * Timeline completo de un paciente OFM (consulta directa a SV, sin cache).
   * Devuelve TODAS sus reservaciones (evaluaciones, moldes, instalaciones, controles...)
   * ordenadas cronológicamente de la primera a la última.
   */
  @Get('timeline/:patientId')
  async getPatientTimeline(
    @Param('patientId', ParseIntPipe) patientId: number,
  ): Promise<Record<string, unknown>[]> {
    return this.crmControlesService.getPatientTimeline(patientId);
  }

  /**
   * Últimas notas médicas de un paciente (consulta directa a SV, sin cache).
   * Recibe el id_clinic_history del paciente en SV.
   */
  @Get('patient-notes/:clinicHistoryId')
  async getPatientNotes(
    @Param('clinicHistoryId', ParseIntPipe) clinicHistoryId: number,
  ): Promise<Record<string, unknown>[]> {
    return this.crmControlesService.getPatientMedicalNotes(clinicHistoryId);
  }

}
