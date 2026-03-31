import { Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common';
import { SvServices } from 'src/sv-services/sv.services';
import { NotificacionesService } from 'src/notificaciones/notificaciones.service';
import type {
  CrmControlesCacheMeta,
  CrmControlesPatientRow,
} from './crm-controles.types';

@Injectable()
export class CrmControlesService implements OnModuleInit {
  private readonly logger = new Logger(CrmControlesService.name);

  // ── Cache pacientes ───────────────────────────────────────────────────────
  private patients: CrmControlesPatientRow[] = [];
  private meta: CrmControlesCacheMeta = {
    lastSyncAt: null,
    lastError: null,
    source: 'sv',
  };

  // ── Cache sesiones de control ─────────────────────────────────────────────
  private controles: CrmControlesPatientRow[] = [];
  private controlesMeta: CrmControlesCacheMeta = {
    lastSyncAt: null,
    lastError: null,
    source: 'sv',
  };

  constructor(
    private readonly svServices: SvServices,
    @Optional() private readonly notifService: NotificacionesService,
  ) {}

  async onModuleInit(): Promise<void> {
    const delay = Number(process.env.CRM_CONTROLES_BOOT_SYNC_DELAY_MS ?? 8000);
    setTimeout(() => {
      void this.syncFromSv().catch((e) =>
        this.logger.warn(`Sync inicial CRM Controles: ${e instanceof Error ? e.message : e}`),
      );
      void this.syncControlesFromSv().catch((e) =>
        this.logger.warn(`Sync inicial Controles OFM: ${e instanceof Error ? e.message : e}`),
      );
    }, delay);
  }

  getSnapshot(): { data: CrmControlesPatientRow[]; meta: CrmControlesCacheMeta } {
    return { data: this.patients, meta: { ...this.meta } };
  }

  getControlesSnapshot(): { data: CrmControlesPatientRow[]; meta: CrmControlesCacheMeta } {
    return { data: this.controles, meta: { ...this.controlesMeta } };
  }

  /** Sincroniza UN SOLO paciente desde SV y actualiza el cache */
  async syncSinglePatient(clinicHistoryId: number): Promise<CrmControlesPatientRow | null> {
    const { tokenSv } = await this.svServices.getTokenSvAdmin();
    const row = await this.svServices.getCrmControlesSinglePatientFromSv(tokenSv, clinicHistoryId);
    if (!row) return null;

    const idx = this.patients.findIndex(
      (p) => Number(p.id_historia_clinica) === clinicHistoryId,
    );
    if (idx >= 0) {
      this.patients[idx] = row as unknown as CrmControlesPatientRow;
    } else {
      this.patients.push(row as unknown as CrmControlesPatientRow);
    }
    return row as unknown as CrmControlesPatientRow;
  }

  /** Sincroniza pacientes desde SV */
  async syncFromSv(): Promise<void> {
    try {
      const { tokenSv } = await this.svServices.getTokenSvAdmin();
      const rows = await this.svServices.getCrmControlesPatientsFromSv(tokenSv);
      this.patients = Array.isArray(rows) ? rows : [];
      this.meta = { lastSyncAt: new Date().toISOString(), lastError: null, source: 'sv' };
      this.logger.log(`CRM Controles pacientes: ${this.patients.length} sincronizados`);
      // Genera notificaciones reales a partir de los datos frescos
      if (this.notifService) {
        void this.notifService.generateFromPatients(this.patients).catch((e) =>
          this.logger.warn(`Error generando notificaciones: ${e instanceof Error ? e.message : e}`),
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.meta = { ...this.meta, lastError: msg };
      this.logger.error(`CRM Controles: error sync pacientes — ${msg}`);
      throw err;
    }
  }

  /**
   * Timeline completo de un paciente — consulta directa a SV (sin cache).
   * Devuelve todas las reservaciones del paciente ordenadas ASC por fecha.
   */
  async getPatientTimeline(patientId: number): Promise<Record<string, unknown>[]> {
    const { tokenSv } = await this.svServices.getTokenSvAdmin();
    return this.svServices.getCrmPatientTimelineFromSv(patientId, tokenSv);
  }

  /**
   * Últimas notas médicas de un paciente — consulta directa a SV (sin cache).
   * Usa id_clinic_history (NO id_registro).
   */
  async getPatientMedicalNotes(clinicHistoryId: number): Promise<Record<string, unknown>[]> {
    const { tokenSv } = await this.svServices.getTokenSvAdmin();
    return this.svServices.getPatientMedicalNotesFromSv(clinicHistoryId, tokenSv);
  }

  // ── Billing proxy para CRM Controles ─────────────────────────────────────

  async checkIsFirstFreeControl(patientId: number): Promise<Record<string, unknown>> {
    return this.svServices.checkIsFirstFreeControl(patientId);
  }

  async checkUrgencyControl(patientId: number): Promise<Record<string, unknown>> {
    return this.svServices.checkUrgencyControl(patientId);
  }

  async checkPostControlFree(patientId: number): Promise<Record<string, unknown>> {
    return this.svServices.checkPostControlFree(patientId);
  }

  async getInvoiceData(clinicHistoryId: number): Promise<Record<string, unknown>> {
    const { tokenSv } = await this.svServices.getTokenSvAdmin();
    return this.svServices.getInvoiceData(clinicHistoryId, tokenSv);
  }

  async createControlInvoice(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    const { tokenSv } = await this.svServices.getTokenSvAdmin();
    return this.svServices.createControlInvoice(payload, tokenSv);
  }

  async getInvoiceQueueStatus(queueId: number): Promise<Record<string, unknown>> {
    const { tokenSv } = await this.svServices.getTokenSvAdmin();
    return this.svServices.getInvoiceQueueStatus(queueId, tokenSv);
  }

  async getPendingControlOS(clinicHistoryId: number): Promise<Record<string, unknown>> {
    const { tokenSv } = await this.svServices.getTokenSvAdmin();
    return this.svServices.getPendingControlOS(clinicHistoryId, tokenSv);
  }

  async getContractQuotas(clinicHistoryId: number): Promise<Record<string, unknown>[]> {
    const { tokenSv } = await this.svServices.getTokenSvAdmin();
    return this.svServices.getContractQuotas(clinicHistoryId, tokenSv);
  }

  async getQuotaInvoiceDetails(contractDetailId: number): Promise<Record<string, unknown>[]> {
    const { tokenSv } = await this.svServices.getTokenSvAdmin();
    return this.svServices.getQuotaInvoiceDetails(contractDetailId, tokenSv);
  }

  async getControlPrice(clinicHistoryId: number): Promise<{ amount: number; currency: string }> {
    const { tokenSv } = await this.svServices.getTokenSvAdmin();
    return this.svServices.getControlPrice(clinicHistoryId, tokenSv);
  }

  async getPatientServiceOrders(clinicHistoryId: number): Promise<Record<string, unknown>[]> {
    const { tokenSv } = await this.svServices.getTokenSvAdmin();
    return this.svServices.getPatientServiceOrders(clinicHistoryId, tokenSv);
  }

  async getPatientCampus(clinicHistoryId: number): Promise<{ campusId: number; campusName: string }> {
    const { tokenSv } = await this.svServices.getTokenSvAdmin();
    return this.svServices.getPatientCampus(clinicHistoryId, tokenSv);
  }

  async getDoctorsForDate(date: string, campusId: number | null): Promise<any[]> {
    const { tokenSv } = await this.svServices.getTokenSvAdmin();
    return this.svServices.getDoctorsForDate(date, campusId, tokenSv);
  }

  async createReservation(data: Record<string, unknown>): Promise<Record<string, unknown>> {
    const { tokenSv } = await this.svServices.getTokenSvAdmin();
    return this.svServices.createReservation(data, tokenSv);
  }

  async cancelReservation(reservationId: number, userId: number, reason: string): Promise<{ code: number; message: string }> {
    const { tokenSv } = await this.svServices.getTokenSvAdmin();
    return this.svServices.cancelReservation(reservationId, userId, reason, tokenSv);
  }

  async linkReservationToOS(osIds: number[], reservationId: number): Promise<{ message: string }> {
    const { tokenSv } = await this.svServices.getTokenSvAdmin();
    return this.svServices.linkReservationToOS(osIds, reservationId, tokenSv);
  }

  /** Sincroniza sesiones de control OFM desde SV */
  async syncControlesFromSv(): Promise<void> {
    try {
      const { tokenSv } = await this.svServices.getTokenSvAdmin();
      const rows = await this.svServices.getCrmControlesSessionsFromSv(tokenSv);
      this.controles = Array.isArray(rows) ? rows : [];
      this.controlesMeta = { lastSyncAt: new Date().toISOString(), lastError: null, source: 'sv' };
      this.logger.log(`CRM Controles sesiones: ${this.controles.length} sincronizadas`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.controlesMeta = { ...this.controlesMeta, lastError: msg };
      this.logger.error(`CRM Controles: error sync sesiones — ${msg}`);
      throw err;
    }
  }
}
