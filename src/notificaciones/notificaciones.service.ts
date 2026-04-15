import { Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { Notificacion, TipoNotificacion } from './notificacion.entity';
import { NotificacionesGateway } from './notificaciones.gateway';
import { User } from 'src/user/user.entity';
import type { CrmControlesPatientRow } from 'src/crm-controles/crm-controles.types';

const MS_DAY = 24 * 60 * 60 * 1000;

@Injectable()
export class NotificacionesService implements OnModuleInit {
  private readonly logger = new Logger(NotificacionesService.name);

  constructor(
    @InjectRepository(Notificacion)
    private readonly repo: Repository<Notificacion>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @Optional() private readonly gateway: NotificacionesGateway,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.repo.query(`
        CREATE TABLE IF NOT EXISTS crm_notificaciones (
          id                  SERIAL PRIMARY KEY,
          tipo                VARCHAR(30)   NOT NULL,
          titulo              VARCHAR(255)  NOT NULL,
          descripcion         TEXT          NOT NULL,
          paciente_id         INTEGER       NOT NULL,
          paciente_nombre     VARCHAR(255)  NOT NULL,
          estado              VARCHAR(20)   NOT NULL DEFAULT 'nueva',
          ejecutivo_username  VARCHAR(100),
          fecha_creacion      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
        );
      `);
      await this.repo.query(`
        DO $$ BEGIN
          ALTER TABLE crm_notificaciones ADD COLUMN IF NOT EXISTS ejecutivo_username VARCHAR(100);
        EXCEPTION WHEN duplicate_column THEN NULL;
        END $$;
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

  /**
   * Admin → todas; usuario regular → solo las de sus pacientes asignados.
   */
  async findAllForUser(userId: string | null): Promise<Notificacion[]> {
    if (!userId) return this.findAll();

    const user = await this.userRepo.findOne({ where: { id: userId, deleted: false } });
    if (!user || user.type === 'admin') return this.findAll();

    const svUsername = (user.cUsersv ?? '').trim().toLowerCase();
    if (!svUsername) return [];

    return this.repo
      .createQueryBuilder('n')
      .where('LOWER(TRIM(n.ejecutivoUsername)) = :svUsername', { svUsername })
      .orderBy('n.fechaCreacion', 'DESC')
      .getMany();
  }

  async markAsRead(id: number): Promise<Notificacion | null> {
    await this.repo.update(id, { estado: 'leida' });
    return this.repo.findOne({ where: { id } });
  }

  async markAllAsRead(userId: string | null): Promise<void> {
    if (!userId) {
      await this.repo.update({ estado: 'nueva' }, { estado: 'leida' });
      return;
    }
    const user = await this.userRepo.findOne({ where: { id: userId, deleted: false } });
    if (!user || user.type === 'admin') {
      await this.repo.update({ estado: 'nueva' }, { estado: 'leida' });
      return;
    }
    const svUsername = (user.cUsersv ?? '').trim().toLowerCase();
    if (!svUsername) return;
    await this.repo
      .createQueryBuilder()
      .update(Notificacion)
      .set({ estado: 'leida' })
      .where('estado = :estado', { estado: 'nueva' })
      .andWhere('LOWER(TRIM(ejecutivo_username)) = :svUsername', { svUsername })
      .execute();
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
      const ejecutivo = str(row.ejecutivo_controles, '').trim().toLowerCase() || null;

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
            ejecutivo,
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
            ejecutivo,
          );
          created++;
        }
      }

      // ── Regla 4: Sin agendamiento (tuvo reservas pero no tiene próxima cita) ─
      if (totalReservas > 0 && citasPendientes === 0 && !proximaCita) {
        await this.upsertNotif(pacienteIdRaw, nombre, 'sin_agendamiento',
          `Sin próxima cita — ${nombre.split(' ')[0]}`,
          `${nombre.split(' ')[0]} tiene historial OFM pero no tiene ninguna cita próxima agendada.`,
          ejecutivo,
        );
        created++;
      }

      // ── Regla 5: Controles de urgencia recurrentes (>= 2) ───────────────────
      const totalUrgencias = num(row.total_urgencias ?? 0);
      if (totalUrgencias >= 2) {
        await this.upsertNotif(pacienteIdRaw, nombre, 'urgencia',
          `Urgencias recurrentes — ${nombre.split(' ')[0]}`,
          `${nombre.split(' ')[0]} tiene ${totalUrgencias} controles de urgencia OFM registrados. Requiere revisión prioritaria.`,
          ejecutivo,
        );
        created++;
      }
    }

    if (created > 0) {
      this.logger.log(`Notificaciones generadas/actualizadas: ${created}`);
      // Notifica en tiempo real a todos los clientes WebSocket conectados
      this.gateway?.broadcast(created);
    }

    // Limpia las leídas antiguas en cada ciclo
    await this.cleanup().catch(() => null);
  }

  // ── Notificación de asignación de paciente ──────────────────────────────

  /**
   * Genera una notificación de tipo 'asignacion' cuando un paciente nuevo
   * se asigna (auto o manual) a un ejecutivo de controles.
   */
  async notifyPatientAssignment(
    pacienteId: number,
    pacienteNombre: string,
    ejecutivoUsername: string,
  ): Promise<void> {
    await this.upsertNotif(
      pacienteId,
      pacienteNombre,
      'asignacion',
      `Nuevo paciente asignado — ${pacienteNombre.split(' ')[0]}`,
      `Se te ha asignado el paciente ${pacienteNombre} (HC: ${pacienteId}) para seguimiento de controles OFM.`,
      ejecutivoUsername.trim().toLowerCase() || null,
    );

    this.gateway?.broadcast(1);
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
    ejecutivoUsername: string | null,
  ): Promise<void> {
    const sevenDaysAgo = new Date(Date.now() - 7 * MS_DAY);

    const existing = await this.repo
      .createQueryBuilder('n')
      .where('n.pacienteId = :pacienteId', { pacienteId })
      .andWhere('n.tipo = :tipo', { tipo })
      .andWhere('n.fechaCreacion > :cutoff', { cutoff: sevenDaysAgo })
      .getOne();

    if (existing) {
      if (existing.estado === 'nueva') {
        await this.repo.update(existing.id, { titulo, descripcion, ejecutivoUsername });
      }
    } else {
      const n = new Notificacion();
      n.tipo               = tipo;
      n.titulo             = titulo;
      n.descripcion        = descripcion;
      n.pacienteId         = pacienteId;
      n.pacienteNombre     = pacienteNombre;
      n.estado             = 'nueva';
      n.ejecutivoUsername   = ejecutivoUsername;
      await this.repo.save(n);
    }
  }
}
