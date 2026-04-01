import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
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

  /** Sincroniza un solo paciente desde SV y actualiza el cache. */
  @Post('sync/:clinicHistoryId')
  async postSyncSingle(
    @Param('clinicHistoryId', ParseIntPipe) clinicHistoryId: number,
  ) {
    const row = await this.crmControlesService.syncSinglePatient(clinicHistoryId);
    return { updated: !!row, data: row };
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

  // ── Facturación de controles (con fecha_abono, método de pago) ──────────

  /** Datos de facturación cacheados — invoices de controles OFM. */
  @Get('facturacion-kpi')
  getFacturacion(): CrmControlesPacientesResponse {
    return this.crmControlesService.getFacturacionSnapshot();
  }

  /** Fuerza sincronización de facturación con SV. */
  @Post('facturacion-kpi/sync')
  async postFacturacionSync(): Promise<CrmControlesPacientesResponse> {
    await this.crmControlesService.syncFacturacionFromSv();
    return this.crmControlesService.getFacturacionSnapshot();
  }

  // ── Reprogramaciones ────────────────────────────────────────────────────

  /** Reprogramaciones cacheadas — conteo por día y campus. */
  @Get('reprogramaciones')
  getReprogramaciones(): CrmControlesPacientesResponse {
    return this.crmControlesService.getReprogramacionesSnapshot();
  }

  /** Fuerza sincronización de reprogramaciones con SV. */
  @Post('reprogramaciones/sync')
  async postReprogramacionesSync(): Promise<CrmControlesPacientesResponse> {
    await this.crmControlesService.syncReprogramacionesFromSv();
    return this.crmControlesService.getReprogramacionesSnapshot();
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

  // ── Billing endpoints para CRM Controles ────────────────────────────────

  /** Verifica si el paciente tiene derecho a primer control gratuito. */
  @Get('is-first-free-control/:patientId')
  async isFirstFreeControl(
    @Param('patientId', ParseIntPipe) patientId: number,
  ): Promise<Record<string, unknown>> {
    return this.crmControlesService.checkIsFirstFreeControl(patientId);
  }

  /** Verifica si el paciente puede acceder a un control de urgencia gratuito. */
  @Get('urgency-control-check/:patientId')
  async urgencyControlCheck(
    @Param('patientId', ParseIntPipe) patientId: number,
  ): Promise<Record<string, unknown>> {
    return this.crmControlesService.checkUrgencyControl(patientId);
  }

  /** Verifica si el paciente tiene un control gratuito por plazo de 15 días post-atención. */
  @Get('post-control-free-check/:patientId')
  async postControlFreeCheck(
    @Param('patientId', ParseIntPipe) patientId: number,
  ): Promise<Record<string, unknown>> {
    return this.crmControlesService.checkPostControlFree(patientId);
  }

  /** Datos de facturación del paciente (cliente + comprobante). */
  @Get('invoice-data/:clinicHistoryId')
  async getInvoiceData(
    @Param('clinicHistoryId', ParseIntPipe) clinicHistoryId: number,
  ): Promise<Record<string, unknown>> {
    return this.crmControlesService.getInvoiceData(clinicHistoryId);
  }

  /** Crea OS + factura para control OFM. Proxy a SV invoice-mifact-v3. */
  @Post('create-control-invoice')
  async createControlInvoice(
    @Body() payload: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    return this.crmControlesService.createControlInvoice(payload);
  }

  /** Estado de la cola de facturación. */
  @Get('invoice-status/:queueId')
  async getInvoiceQueueStatus(
    @Param('queueId', ParseIntPipe) queueId: number,
  ): Promise<Record<string, unknown>> {
    return this.crmControlesService.getInvoiceQueueStatus(queueId);
  }

  /** Verifica si el paciente tiene una OS de Control OFM facturada sin agendar. */
  @Get('pending-control-os/:clinicHistoryId')
  async getPendingControlOS(
    @Param('clinicHistoryId', ParseIntPipe) clinicHistoryId: number,
  ): Promise<Record<string, unknown>> {
    return this.crmControlesService.getPendingControlOS(clinicHistoryId);
  }

  /** Cuotas del contrato OFM del paciente. */
  @Get('contract-quotas/:clinicHistoryId')
  async getContractQuotas(
    @Param('clinicHistoryId', ParseIntPipe) clinicHistoryId: number,
  ): Promise<Record<string, unknown>[]> {
    return this.crmControlesService.getContractQuotas(clinicHistoryId);
  }

  /** Detalle de facturación de una cuota específica (pagos, comprobantes). */
  @Get('quota-invoice/:contractDetailId')
  async getQuotaInvoiceDetails(
    @Param('contractDetailId', ParseIntPipe) contractDetailId: number,
  ): Promise<Record<string, unknown>[]> {
    return this.crmControlesService.getQuotaInvoiceDetails(contractDetailId);
  }

  /** Precio de control OFM para el paciente (COALESCE contract.amount_controls, tariff.price_sol). */
  @Get('control-price/:clinicHistoryId')
  async getControlPrice(
    @Param('clinicHistoryId', ParseIntPipe) clinicHistoryId: number,
  ): Promise<{ amount: number; currency: string }> {
    return this.crmControlesService.getControlPrice(clinicHistoryId);
  }

  /** Todas las OS del paciente (serviceOrderInvoiceNewVersion). */
  @Get('service-orders/:clinicHistoryId')
  async getPatientServiceOrders(
    @Param('clinicHistoryId', ParseIntPipe) clinicHistoryId: number,
  ): Promise<Record<string, unknown>[]> {
    return this.crmControlesService.getPatientServiceOrders(clinicHistoryId);
  }

  /** Campus del paciente por clinicHistoryId. */
  @Get('patient-campus/:clinicHistoryId')
  async getPatientCampus(
    @Param('clinicHistoryId', ParseIntPipe) clinicHistoryId: number,
  ): Promise<{ campusId: number; campusName: string }> {
    return this.crmControlesService.getPatientCampus(clinicHistoryId);
  }

  // ── Agenda endpoints ──────────────────────────────────────────────────────

  /** Doctores disponibles para una fecha (con tarifas). */
  @Get('doctors/:date')
  async getDoctorsForDate(
    @Param('date') date: string,
  ): Promise<any[]> {
    return this.crmControlesService.getDoctorsForDate(date, null);
  }

  @Get('doctors/:date/:campusId')
  async getDoctorsForDateWithCampus(
    @Param('date') date: string,
    @Param('campusId', ParseIntPipe) campusId: number,
  ): Promise<any[]> {
    return this.crmControlesService.getDoctorsForDate(date, campusId);
  }

  /** Crear reserva (cita). */
  @Post('create-reservation')
  async createReservation(
    @Body() payload: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    return this.crmControlesService.createReservation(payload);
  }

  /** Cancelar reserva (cita) — proxy a WSK reservation-cancel-for-client. */
  @Post('cancel-reservation')
  async cancelReservation(
    @Body() body: { reservationId: number; userId: number; reason: string },
  ): Promise<{ code: number; message: string }> {
    return this.crmControlesService.cancelReservation(body.reservationId, body.userId, body.reason);
  }

  /** Vincular OS con reserva (PATCH /service-order-api/update-reservation). */
  @Patch('link-reservation-os')
  async linkReservationToOS(
    @Body() body: { osIds: number[]; reservationId: number },
  ): Promise<{ message: string }> {
    return this.crmControlesService.linkReservationToOS(body.osIds, body.reservationId);
  }

}
