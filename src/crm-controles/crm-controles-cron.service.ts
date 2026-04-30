import { Injectable, Logger, Optional } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { CrmControlesService } from './crm-controles.service';
import { KpiGerencialService } from 'src/kpi-gerencial/kpi-gerencial.service';

/**
 * Polling backend → SV. Expresión por env CRM_CONTROLES_CRON (default cada 3 min).
 * Formato: segundo minuto hora día mes día-semana (6 campos, @nestjs/schedule).
 */
@Injectable()
export class CrmControlesCronService {
  private readonly logger = new Logger(CrmControlesCronService.name);

  constructor(
    private readonly crmControlesService: CrmControlesService,
    @Optional() private readonly kpiService: KpiGerencialService,
  ) {}

  @Cron(process.env.CRM_CONTROLES_CRON ?? '0 */1 * * * *')
  async handlePollSv(): Promise<void> {
    try {
      await this.crmControlesService.syncFromSv();
    } catch {
      // error ya logueado en service
    }
  }

  @Cron(process.env.CRM_CONTROLES_SESSIONS_CRON ?? '0 */10 * * * *')
  async handlePollControlesSv(): Promise<void> {
    try {
      await this.crmControlesService.syncControlesFromSv();
    } catch {
      // error ya logueado en service
    }
  }

  /** Sincroniza facturación cada 15 min */
  @Cron(process.env.CRM_CONTROLES_FACTURACION_CRON ?? '0 */15 * * * *')
  async handlePollFacturacion(): Promise<void> {
    try {
      await this.crmControlesService.syncFacturacionFromSv();
    } catch {
      // error ya logueado en service
    }
  }

  /** Sincroniza reprogramaciones cada 30 min */
  @Cron(process.env.CRM_CONTROLES_REPROG_CRON ?? '0 */30 * * * *')
  async handlePollReprogramaciones(): Promise<void> {
    try {
      await this.crmControlesService.syncReprogramacionesFromSv();
    } catch {
      // error ya logueado en service
    }
  }

  /**
   * Congelado diario — guarda snapshot de KPIs en la tabla kpi_snapshot.
   * Ejecuta a las 23:55 (hora del servidor).
   */
  @Cron(process.env.CRM_CONTROLES_SNAPSHOT_CRON ?? '0 55 23 * * *')
  async handleDailySnapshot(): Promise<void> {
    if (!this.kpiService) {
      this.logger.warn('KpiGerencialService no disponible — snapshot diario omitido');
      return;
    }

    const hoy = new Date().toISOString().slice(0, 10);
    this.logger.log(`Generando snapshot diario para ${hoy}…`);

    try {
      const { data: patients } = this.crmControlesService.getSnapshot();
      const { data: sessions } = this.crmControlesService.getControlesSnapshot();
      const { data: facturacion } = this.crmControlesService.getFacturacionSnapshot();
      const { data: reprogramaciones } = this.crmControlesService.getReprogramacionesSnapshot();

      const todaySessions = sessions.filter(
        (s: Record<string, unknown>) => String(s.fecha ?? '').startsWith(hoy),
      );
      const completados = todaySessions.filter(
        (s: Record<string, unknown>) => Number(s.estado) === 3 || Number(s.estado) === 4,
      ).length;
      const pendientes = todaySessions.filter(
        (s: Record<string, unknown>) => Number(s.estado) === 1 || Number(s.estado) === 2,
      ).length;
      const cancelados = todaySessions.filter(
        (s: Record<string, unknown>) => Number(s.estado) === 0,
      ).length;

      const todayReprog = reprogramaciones.filter(
        (r: Record<string, unknown>) => String(r.fecha ?? '').startsWith(hoy),
      );
      const totalReprog = todayReprog.reduce(
        (sum: number, r: Record<string, unknown>) => sum + (Number(r.reprogramaciones) || 0),
        0,
      );

      const todayFacturacion = facturacion.filter(
        (f: Record<string, unknown>) => String(f.fecha_abono ?? '').startsWith(hoy),
      );
      const montoFacturado = todayFacturacion.reduce(
        (sum: number, f: Record<string, unknown>) => sum + (Number(f.amount) || 0),
        0,
      );

      await this.kpiService.saveSnapshot(hoy, 'resumen_diario', {
        totalPacientes: patients.length,
        sesionesHoy: todaySessions.length,
        completados,
        pendientes,
        cancelados,
        reprogramaciones: totalReprog,
        montoFacturadoHoy: montoFacturado,
        facturadasHoy: todayFacturacion.length,
      });

      // Snapshot de facturación por campus
      const campusMap = new Map<number, { monto: number; cantidad: number }>();
      for (const f of facturacion) {
        const raw = f as Record<string, unknown>;
        if (!String(raw.fecha_abono ?? '').startsWith(hoy)) continue;
        const cid = Number(raw.campus_id) || 0;
        const entry = campusMap.get(cid) ?? { monto: 0, cantidad: 0 };
        entry.monto += Number(raw.amount) || 0;
        entry.cantidad++;
        campusMap.set(cid, entry);
      }
      for (const [campusId, datos] of campusMap) {
        await this.kpiService.saveSnapshot(hoy, 'facturacion_campus', datos, campusId || undefined);
      }

      this.logger.log(`Snapshot diario ${hoy}: sesiones=${todaySessions.length}, facturado=${montoFacturado}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Error snapshot diario: ${msg}`);
    }
  }
}
