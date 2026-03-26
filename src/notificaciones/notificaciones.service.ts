import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { Notificacion, TipoNotificacion } from './notificacion.entity';
import type { CrmControlesPatientRow } from 'src/crm-controles/crm-controles.types';

const MS_DAY = 24 * 60 * 60 * 1000;

@Injectable()
export class NotificacionesService implements OnModuleInit {
  private readonly logger = new Logger(NotificacionesService.name);

  constructor(
    @InjectRepository(Notificacion)
    private readonly repo: Repository<Notificacion>,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.repo.query(`
        CREATE TABLE IF NOT EXISTS crm_notificaciones (
          id              SERIAL PRIMARY KEY,
          tipo            VARCHAR(30)   NOT NULL,
          titulo          VARCHAR(255)  NOT NULL,
          descripcion     TEXT          NOT NULL,
          paciente_id     INTEGER       NOT NULL,
          paciente_nombre VARCHAR(255)  NOT NULL,
          estado          VARCHAR(20)   NOT NULL DEFAULT 'nueva',
          fecha_creacion  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
        );
      `);
      this.logger.log('Tabla crm_notificaciones lista ✓');
    } catch (err) {
      this.logger.error('Error creando tabla crm_notificaciones:', err);
    }
  }

  // ── CRUD ────────────────────────────────────────────────────────────────────

  findAll(): Promise<Notificacion[]> {
    return this.repo.find({ order: { fechaCreacion: 'DESC' } });
  }

  async markAsRead(id: number): Promise<Notificacion | null> {
    await this.repo.update(id, { estado: 'leida' });
    return this.repo.findOne({ where: { id } });
  }

  async markAllAsRead(): Promise<void> {
    await this.repo.update({ estado: 'nueva' }, { estado: 'leida' });
  }

  async remove(id: number): Promise<void> {
    await this.repo.delete(id);
  }

  /** Elimina notificaciones leídas con más de 7 días para no acumular basura */
  async cleanup(): Promise<void> {
    const cutoff = new Date(Date.now() - 7 * MS_DAY);
    await this.repo.delete({ estado: 'leida', fechaCreacion: LessThan(cutoff) });
  }

  // ── Generación automática desde datos de pacientes SV ─────────────────────

  /**
   * Analiza el array de pacientes frescos de SV y genera notificaciones
   * nuevas para los 4 tipos. Usa deduplicación por tipo+paciente (solo una
   * notificación activa por combo — no se repite si ya existe una sin leer).
   */
  async generateFromPatients(patients: CrmControlesPatientRow[]): Promise<void> {
    if (!patients.length) return;

    const str = (v: unknown, fb = '') => (v != null && v !== '' ? String(v) : fb);
    const num = (v: unknown) =>
      typeof v === 'number' ? v : parseInt(String(v ?? '0'), 10) || 0;

    let created = 0;

    for (const row of patients) {
      const pacienteIdRaw = num(row.id_registro ?? row.id_paciente ?? 0);
      if (!pacienteIdRaw) continue;

      const nombre = [str(row.nombre_paciente), str(row.ap_paterno), str(row.ap_materno)]
        .filter(Boolean)
        .join(' ') || 'Paciente desconocido';

      const proximaCitaStr  = str(row.proxima_cita, '');
      const ultimaCitaStr   = str(row.ultima_cita, str(row.ultima_atencion_fecha, ''));
      const citasPendientes = num(row.citas_pendientes);
      const totalReservas   = num(row.total_reservas);
      const proximaCita = proximaCitaStr ? new Date(proximaCitaStr) : null;
      const ultimaCita  = ultimaCitaStr  ? new Date(ultimaCitaStr)  : null;
      const now         = new Date();

      // ── Regla 1: Cita próxima en < 48 h ────────────────────────────────────
      if (proximaCita && !isNaN(proximaCita.getTime())) {
        const diffH = (proximaCita.getTime() - now.getTime()) / (1000 * 60 * 60);
        if (diffH >= 0 && diffH <= 48) {
          const fechaStr = proximaCita.toLocaleDateString('es-ES', {
            weekday: 'long', day: 'numeric', month: 'long',
          });
          const horaStr = str(row.proxima_cita_hora, '');
          await this.upsertNotif(pacienteIdRaw, nombre, 'cita',
            `Cita próxima — ${nombre.split(' ')[0]}`,
            `Control OFM agendado para ${fechaStr}${horaStr ? ` a las ${horaStr}` : ''}.`,
          );
          created++;
        }
      }

      // ── Regla 2: Sin contacto > 30 días (SLA crítico) ───────────────────────
      if (ultimaCita && !isNaN(ultimaCita.getTime())) {
        const diasSinContacto = Math.floor((now.getTime() - ultimaCita.getTime()) / MS_DAY);
        if (diasSinContacto > 30 && citasPendientes === 0) {
          await this.upsertNotif(pacienteIdRaw, nombre, 'alerta',
            `Sin contacto — ${nombre.split(' ')[0]}`,
            `Lleva ${diasSinContacto} días sin atención OFM registrada y no tiene próxima cita agendada.`,
          );
          created++;
        }
      }

      // ── Regla 4: Sin agendamiento (tuvo reservas pero no tiene próxima cita) ─
      if (totalReservas > 0 && citasPendientes === 0 && !proximaCita) {
        await this.upsertNotif(pacienteIdRaw, nombre, 'sin_agendamiento',
          `Sin próxima cita — ${nombre.split(' ')[0]}`,
          `${nombre.split(' ')[0]} tiene historial OFM pero no tiene ninguna cita próxima agendada.`,
        );
        created++;
      }

      // ── Regla 5: Controles de urgencia recurrentes (>= 2) ───────────────────
      const totalUrgencias = num(row.total_urgencias ?? 0);
      if (totalUrgencias >= 2) {
        await this.upsertNotif(pacienteIdRaw, nombre, 'urgencia',
          `Urgencias recurrentes — ${nombre.split(' ')[0]}`,
          `${nombre.split(' ')[0]} tiene ${totalUrgencias} controles de urgencia OFM registrados. Requiere revisión prioritaria.`,
        );
        created++;
      }
    }

    if (created > 0) {
      this.logger.log(`Notificaciones generadas/actualizadas: ${created}`);
    }

    // Limpia las leídas antiguas en cada ciclo
    await this.cleanup().catch(() => null);
  }

  // ── Deduplicación ────────────────────────────────────────────────────────
  // Regla: si ya existe una notificación (nueva O leída) del mismo tipo para
  // este paciente en los últimos 7 días, no volvemos a crearla.
  // Así el usuario puede marcar como leída y no reaparece en el próximo ciclo.

  private async upsertNotif(
    pacienteId: number,
    pacienteNombre: string,
    tipo: TipoNotificacion,
    titulo: string,
    descripcion: string,
  ): Promise<void> {
    const sevenDaysAgo = new Date(Date.now() - 7 * MS_DAY);

    const existing = await this.repo
      .createQueryBuilder('n')
      .where('n.pacienteId = :pacienteId', { pacienteId })
      .andWhere('n.tipo = :tipo', { tipo })
      .andWhere('n.fechaCreacion > :cutoff', { cutoff: sevenDaysAgo })
      .getOne();

    if (existing) {
      // Solo actualiza el texto si aún está sin leer (datos pueden haber cambiado)
      // Si ya fue leída → el usuario la descartó, NO la tocamos
      if (existing.estado === 'nueva') {
        await this.repo.update(existing.id, { titulo, descripcion });
      }
    } else {
      // No existe ninguna en los últimos 7 días → crear nueva
      const n = new Notificacion();
      n.tipo           = tipo;
      n.titulo         = titulo;
      n.descripcion    = descripcion;
      n.pacienteId     = pacienteId;
      n.pacienteNombre = pacienteNombre;
      n.estado         = 'nueva';
      await this.repo.save(n);
    }
  }
}
