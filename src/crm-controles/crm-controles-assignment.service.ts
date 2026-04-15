import { Injectable, Logger, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from 'src/user/user.entity';
import { SvServices } from 'src/sv-services/sv.services';
import { AssignmentQueueStateService } from 'src/assignment-queue-state/assignment-queue-state.service';
import { NotificacionesGateway } from 'src/notificaciones/notificaciones.gateway';
import { NotificacionesService } from 'src/notificaciones/notificaciones.service';
import { TEAMS_IDS } from 'src/globals/ids';

/**
 * Clave de subcampaña usada para la cola de asignación de controles
 * en la tabla assignment_queue_state.
 * Se usa un ID fijo (no conflicta con campañas de ventas).
 */
const CONTROLES_QUEUE_KEY = 'CONTROLES';

/**
 * Campus genérico para la cola de controles.
 * Se usa 0 porque los controles no están segmentados por sede todavía.
 */
const CONTROLES_CAMPUS_ID = 0;

@Injectable()
export class CrmControlesAssignmentService {
  private readonly logger = new Logger(CrmControlesAssignmentService.name);

  /** Cache local: username_sv → id_sv, para no consultar SV en cada asignación. */
  private svUserIdCache = new Map<string, number | null>();

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly svServices: SvServices,
    private readonly assignmentQueueStateService: AssignmentQueueStateService,
    @Optional() private readonly notificacionesGateway: NotificacionesGateway,
    @Optional() private readonly notificacionesService: NotificacionesService,
  ) {}

  /**
   * Recibe la lista de pacientes recién sincronizados desde SV y asigna
   * un ejecutivo de controles a los que no tengan uno válido y cumplan criterios.
   *
   * Criterios para asignar:
   *   - ejecutivo_controles es null/vacío (LEFT JOIN no encontró usuario)
   *   - Tiene evaluación atendida (campo is_first_free_control presente, o instalación completada detectada en SV)
   *
   * El sistema ya filtra en SV que el paciente tenga evaluación + instalación atendidas
   * para aparecer en el listado. Por lo tanto, cualquier paciente del listado sin
   * ejecutivo_controles es candidato para asignación.
   */
  async autoAssignFromPatients(patients: Record<string, unknown>[]): Promise<void> {
    const unassigned = patients.filter(
      (p) => !p['ejecutivo_controles'] || String(p['ejecutivo_controles']).trim() === '',
    );

    if (unassigned.length === 0) return;

    this.logger.log(`Pacientes sin ejecutivo de controles detectados: ${unassigned.length}`);

    const executivos = await this.getControlesExecutivos();
    if (executivos.length === 0) {
      this.logger.warn('No hay ejecutivos de controles activos en el equipo. Asignación omitida.');
      return;
    }

    let tokenSv: string;
    try {
      const { tokenSv: t } = await this.svServices.getTokenSvAdmin();
      tokenSv = t;
    } catch (err) {
      this.logger.error(`No se pudo obtener token de SV para asignación automática: ${err instanceof Error ? err.message : err}`);
      return;
    }

    let assignedCount = 0;
    let errorCount = 0;

    for (const patient of unassigned) {
      try {
        const clinicHistoryId = Number(patient['id_historia_clinica']);
        if (!clinicHistoryId || isNaN(clinicHistoryId)) continue;

        const nextExecutivo = await this.getNextExecutivo(executivos);
        if (!nextExecutivo) {
          this.logger.warn('No se pudo determinar el siguiente ejecutivo. Deteniendo asignación.');
          break;
        }

        const svUserId = await this.resolveSvUserId(tokenSv, nextExecutivo.cUsersv ?? '');
        if (!svUserId) {
          this.logger.warn(`Ejecutivo ${nextExecutivo.userName} no tiene c_usersv válido o no existe en SV. Saltando.`);
          continue;
        }

        const updated = await this.svServices.assignControllerExecutiveInSv(tokenSv, clinicHistoryId, svUserId);

        if (updated) {
          await this.assignmentQueueStateService.recordAssignment(
            CONTROLES_CAMPUS_ID,
            CONTROLES_QUEUE_KEY,
            nextExecutivo.id,
            null,
          );
          assignedCount++;
          this.logger.log(`CH ${clinicHistoryId} → ${nextExecutivo.userName} (sv_id=${svUserId})`);

          const pacienteNombre = [
            String(patient['nombre_paciente'] ?? ''),
            String(patient['ap_paterno'] ?? ''),
            String(patient['ap_materno'] ?? ''),
          ].filter(Boolean).join(' ') || 'Paciente';
          const svUsername = (nextExecutivo.cUsersv ?? '').trim();
          if (svUsername && this.notificacionesService) {
            this.notificacionesService
              .notifyPatientAssignment(clinicHistoryId, pacienteNombre, svUsername)
              .catch((err) => this.logger.warn(`Error creando notificación de asignación: ${err}`));
          }
        } else {
          this.logger.warn(`SV no actualizó CH ${clinicHistoryId} (registro no encontrado o ya borrado)`);
        }
      } catch (err) {
        errorCount++;
        this.logger.error(`Error asignando paciente ${patient['id_historia_clinica']}: ${err instanceof Error ? err.message : err}`);
      }
    }

    if (assignedCount > 0 || errorCount > 0) {
      this.logger.log(`Asignación automática controles: ${assignedCount} asignados, ${errorCount} errores`);
    }
    // Notificar en tiempo real a todos los clientes conectados para que re-fetchen
    if (assignedCount > 0 && this.notificacionesGateway) {
      this.notificacionesGateway.broadcastControlesUpdated(assignedCount);
    }
  }

  /** Obtiene los usuarios activos del equipo Equipo ejecutivos controles. */
  private async getControlesExecutivos(): Promise<User[]> {
    const rows = await this.userRepository
      .createQueryBuilder('u')
      .innerJoin('team_user', 'tu', 'tu.user_id = u.id AND tu.deleted = false')
      .where('tu.team_id = :teamId', { teamId: TEAMS_IDS.EQ_EJECUTIVOS_CONTROLES })
      .andWhere('u.deleted = false')
      .andWhere('u.is_active = true')
      .andWhere("u.type = 'regular'")
      .andWhere('u.c_usersv IS NOT NULL')
      .andWhere("TRIM(u.c_usersv) <> ''")
      .orderBy('u.user_name', 'ASC')
      .getMany();
    return rows;
  }

  /**
   * Determina el siguiente ejecutivo usando round-robin basado en
   * el estado guardado en assignment_queue_state.
   */
  private async getNextExecutivo(executivos: User[]): Promise<User | null> {
    if (executivos.length === 0) return null;
    if (executivos.length === 1) return executivos[0];

    const state = await this.assignmentQueueStateService.getState(CONTROLES_CAMPUS_ID, CONTROLES_QUEUE_KEY);
    if (!state) return executivos[0];

    const lastIndex = executivos.findIndex((u) => u.id === state.lastAssignedUserId);
    const nextIndex = lastIndex === -1 ? 0 : (lastIndex + 1) % executivos.length;
    return executivos[nextIndex];
  }

  /**
   * Resuelve el ID numérico de un usuario en SV a partir de su username.
   * Usa cache en memoria para evitar llamadas repetidas.
   */
  private async resolveSvUserId(tokenSv: string, cUsersv: string): Promise<number | null> {
    if (!cUsersv || cUsersv.trim() === '') return null;

    const key = cUsersv.trim().toLowerCase();
    if (this.svUserIdCache.has(key)) return this.svUserIdCache.get(key) ?? null;

    const id = await this.svServices.getSvUserIdByUsername(tokenSv, cUsersv.trim());
    this.svUserIdCache.set(key, id);
    return id;
  }

  /** Limpia el cache de IDs de SV (útil si se recrean usuarios). */
  clearSvUserIdCache(): void {
    this.svUserIdCache.clear();
  }

  /**
   * Devuelve la lista de ejecutivos de controles activos para la API del frontend
   * (solo usuarios regular del equipo controles con credenciales SV).
   */
  async getControlesExecutivosForApi(): Promise<
    { id: string; userName: string; firstName: string; lastName: string }[]
  > {
    const users = await this.getControlesExecutivos();
    return users.map((u) => ({
      id: u.id,
      userName: u.userName ?? '',
      firstName: u.firstName ?? '',
      lastName: u.lastName ?? '',
    }));
  }

  /**
   * Reasignación manual de un paciente a un ejecutivo de controles específico.
   * Llama a SV para actualizar id_controller_executive y registra el evento en la cola.
   */
  async manualReassignPatient(
    clinicHistoryId: number,
    targetUserId: string,
    _requestingUserId: string | null,
  ): Promise<{ ok: boolean; message?: string }> {
    const executivo = await this.userRepository.findOne({
      where: { id: targetUserId, deleted: false, isActive: true },
    });

    if (!executivo) {
      return { ok: false, message: 'Ejecutivo no encontrado o inactivo' };
    }

    let tokenSv: string;
    try {
      const { tokenSv: t } = await this.svServices.getTokenSvAdmin();
      tokenSv = t;
    } catch (err) {
      return {
        ok: false,
        message: `No se pudo obtener token de SV: ${err instanceof Error ? err.message : String(err)}`,
      };
    }

    const cUsersv = (executivo.cUsersv ?? '').trim();
    if (!cUsersv) {
      return {
        ok: false,
        message: `El ejecutivo "${executivo.userName}" no tiene el campo Usuario SV configurado. Edítalo en AdminCore y asegúrate de que el campo "Usuario SV" esté completo.`,
      };
    }

    const svUserId = await this.resolveSvUserId(tokenSv, cUsersv);
    if (!svUserId) {
      return {
        ok: false,
        message: `No se encontró ningún usuario activo en SV con el username "${cUsersv}" (credencial del ejecutivo "${executivo.userName}"). Verifica que el usuario exista en SV y esté activo.`,
      };
    }

    const updated = await this.svServices.assignControllerExecutiveInSv(
      tokenSv,
      clinicHistoryId,
      svUserId,
    );

    if (!updated) {
      return {
        ok: false,
        message: `SV no actualizó el paciente CH ${clinicHistoryId}. Verifica que el registro exista.`,
      };
    }

    await this.assignmentQueueStateService.recordAssignment(
      CONTROLES_CAMPUS_ID,
      CONTROLES_QUEUE_KEY,
      executivo.id,
      null,
    );

    this.logger.log(
      `Reasignación manual: CH ${clinicHistoryId} → ${executivo.userName} (sv_id=${svUserId})`,
    );

    if (cUsersv && this.notificacionesService) {
      this.notificacionesService
        .notifyPatientAssignment(
          clinicHistoryId,
          `Paciente HC ${clinicHistoryId}`,
          cUsersv,
        )
        .catch((err) => this.logger.warn(`Error notificación reasignación: ${err}`));
    }

    return {
      ok: true,
      message: `Paciente reasignado a ${executivo.firstName ?? ''} ${executivo.lastName ?? ''}`.trim(),
    };
  }

  /** Emite el broadcast WebSocket de controles-updated (llamado desde el controller tras actualizar el cache). */
  broadcastControlesUpdated(): void {
    if (this.notificacionesGateway) {
      this.notificacionesGateway.broadcastControlesUpdated(1);
    }
  }
}
