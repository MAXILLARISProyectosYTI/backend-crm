import { Injectable, Logger, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from 'src/user/user.entity';
import { SvServices } from 'src/sv-services/sv.services';
import { AssignmentQueueStateService } from 'src/assignment-queue-state/assignment-queue-state.service';
import { RoleService } from 'src/role/role.service';
import { NotificacionesGateway } from 'src/notificaciones/notificaciones.gateway';
import { NotificacionesService } from 'src/notificaciones/notificaciones.service';
import { TEAMS_IDS, ROLES_IDS } from 'src/globals/ids';

const CONTROLES_QUEUE_KEY = 'CONTROLES';

/** Mapeo roleId → campusId para segmentación por sede. */
const ROLE_TO_CAMPUS: Record<string, number> = {
  [ROLES_IDS.CONTROLES_LIMA]: 1,
  [ROLES_IDS.CONTROLES_AREQUIPA]: 2,
};

@Injectable()
export class CrmControlesAssignmentService {
  private readonly logger = new Logger(CrmControlesAssignmentService.name);

  private svUserIdCache = new Map<string, number | null>();
  private campusCache = new Map<number, number>();

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly svServices: SvServices,
    private readonly assignmentQueueStateService: AssignmentQueueStateService,
    @Optional() private readonly roleService: RoleService,
    @Optional() private readonly notificacionesGateway: NotificacionesGateway,
    @Optional() private readonly notificacionesService: NotificacionesService,
  ) {}

  async autoAssignFromPatients(patients: Record<string, unknown>[]): Promise<void> {
    const unassigned = patients.filter(
      (p) => !p['ejecutivo_controles'] || String(p['ejecutivo_controles']).trim() === '',
    );

    if (unassigned.length === 0) return;

    this.logger.log(`Pacientes sin ejecutivo de controles detectados: ${unassigned.length}`);

    const allExecutivos = await this.getControlesExecutivos();
    if (allExecutivos.length === 0) {
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

    const campusSegmentation = await this.buildCampusSegmentation(allExecutivos);
    const hasCampusConfig = campusSegmentation.size > 0;

    this.campusCache.clear();

    let assignedCount = 0;
    let errorCount = 0;

    for (const patient of unassigned) {
      try {
        const clinicHistoryId = Number(patient['id_historia_clinica']);
        if (!clinicHistoryId || isNaN(clinicHistoryId)) continue;

        let campusId = 0;
        let executivosForPatient = allExecutivos;

        if (hasCampusConfig) {
          campusId = await this.resolvePatientCampus(tokenSv, clinicHistoryId);
          const campusExecs = campusId > 0 ? campusSegmentation.get(campusId) : undefined;
          if (campusExecs && campusExecs.length > 0) {
            executivosForPatient = campusExecs;
          } else {
            campusId = 0;
          }
        }

        const nextExecutivo = await this.getNextExecutivo(executivosForPatient, campusId);
        if (!nextExecutivo) {
          this.logger.warn(`No se pudo determinar el siguiente ejecutivo (campus=${campusId}). Saltando paciente CH ${clinicHistoryId}.`);
          continue;
        }

        const svUserId = await this.resolveSvUserId(tokenSv, nextExecutivo.cUsersv ?? '');
        if (!svUserId) {
          this.logger.warn(`Ejecutivo ${nextExecutivo.userName} no tiene c_usersv válido o no existe en SV. Saltando.`);
          continue;
        }

        const updated = await this.svServices.assignControllerExecutiveInSv(tokenSv, clinicHistoryId, svUserId);

        if (updated) {
          await this.assignmentQueueStateService.recordAssignment(
            campusId,
            CONTROLES_QUEUE_KEY,
            nextExecutivo.id,
            null,
          );
          assignedCount++;
          this.logger.log(`CH ${clinicHistoryId} → ${nextExecutivo.userName} (sv_id=${svUserId}, campus=${campusId})`);

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

    this.campusCache.clear();

    if (assignedCount > 0 || errorCount > 0) {
      this.logger.log(`Asignación automática controles: ${assignedCount} asignados, ${errorCount} errores`);
    }
    if (assignedCount > 0 && this.notificacionesGateway) {
      this.notificacionesGateway.broadcastControlesUpdated(assignedCount);
    }
  }

  /**
   * Construye Map<campusId, User[]> usando roles de sede.
   * - CONTROLES (genérico)   → en TODOS los buckets de campus (todas las sedes)
   * - CONTROLES_LIMA         → solo bucket campus 1
   * - CONTROLES_AREQUIPA     → solo bucket campus 2
   * - Ambos roles de campus  → en ambos buckets
   * - Sin ningún rol de controles → no recibe pacientes segmentados
   */
  private async buildCampusSegmentation(allExecutivos: User[]): Promise<Map<number, User[]>> {
    const result = new Map<number, User[]>();
    if (!this.roleService || allExecutivos.length === 0) return result;

    const userCampusMap = new Map<string, Set<number>>();
    const usersWithGenericRole = new Set<string>();
    const allCampusIds = new Set<number>();
    let anyUserHasRelevantRole = false;

    for (const user of allExecutivos) {
      const roles = await this.roleService.getRolesByUser(user.id);
      const campuses = new Set<number>();
      let hasGeneric = false;

      for (const roleId of roles) {
        if (roleId === ROLES_IDS.CONTROLES) {
          hasGeneric = true;
          anyUserHasRelevantRole = true;
        }
        const campusId = ROLE_TO_CAMPUS[roleId];
        if (campusId != null) {
          campuses.add(campusId);
          allCampusIds.add(campusId);
          anyUserHasRelevantRole = true;
        }
      }

      if (hasGeneric) usersWithGenericRole.add(user.id);
      userCampusMap.set(user.id, campuses);
    }

    if (!anyUserHasRelevantRole) return result;

    if (allCampusIds.size === 0) {
      allCampusIds.add(1);
      allCampusIds.add(2);
    }

    for (const campusId of allCampusIds) {
      const usersForCampus = allExecutivos.filter((u) => {
        const campuses = userCampusMap.get(u.id)!;
        return campuses.has(campusId) || usersWithGenericRole.has(u.id);
      });
      if (usersForCampus.length > 0) {
        result.set(campusId, usersForCampus);
      }
    }

    for (const [cid, users] of result) {
      this.logger.debug(
        `Segmentación campus ${cid}: ${users.map((u) => u.userName).join(', ')}`,
      );
    }

    return result;
  }

  private async resolvePatientCampus(tokenSv: string, clinicHistoryId: number): Promise<number> {
    if (this.campusCache.has(clinicHistoryId)) {
      return this.campusCache.get(clinicHistoryId)!;
    }
    try {
      const { campusId } = await this.svServices.getPatientCampus(clinicHistoryId, tokenSv);
      this.campusCache.set(clinicHistoryId, campusId);
      return campusId;
    } catch (err) {
      this.logger.warn(`No se pudo obtener campus de CH ${clinicHistoryId}: ${err instanceof Error ? err.message : err}`);
      this.campusCache.set(clinicHistoryId, 0);
      return 0;
    }
  }

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

  private async getNextExecutivo(executivos: User[], campusId: number): Promise<User | null> {
    if (executivos.length === 0) return null;
    if (executivos.length === 1) return executivos[0];

    const state = await this.assignmentQueueStateService.getState(campusId, CONTROLES_QUEUE_KEY);
    if (!state) return executivos[0];

    const lastIndex = executivos.findIndex((u) => u.id === state.lastAssignedUserId);
    const nextIndex = lastIndex === -1 ? 0 : (lastIndex + 1) % executivos.length;
    return executivos[nextIndex];
  }

  private async resolveSvUserId(tokenSv: string, cUsersv: string): Promise<number | null> {
    if (!cUsersv || cUsersv.trim() === '') return null;

    const key = cUsersv.trim().toLowerCase();
    if (this.svUserIdCache.has(key)) return this.svUserIdCache.get(key) ?? null;

    const id = await this.svServices.getSvUserIdByUsername(tokenSv, cUsersv.trim());
    this.svUserIdCache.set(key, id);
    return id;
  }

  clearSvUserIdCache(): void {
    this.svUserIdCache.clear();
  }

  async getControlesExecutivosForApi(): Promise<
    { id: string; userName: string; firstName: string; lastName: string; cUsersv: string }[]
  > {
    const users = await this.getControlesExecutivos();
    return users.map((u) => ({
      id: u.id,
      userName: u.userName ?? '',
      firstName: u.firstName ?? '',
      lastName: u.lastName ?? '',
      cUsersv: (u.cUsersv ?? '').trim(),
    }));
  }

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
        message: `El ejecutivo "${executivo.userName}" no tiene el campo Usuario SV configurado. Edítalo en UserManagement y asegúrate de que el campo "Usuario SV" esté completo.`,
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

    const campusId = await this.resolvePatientCampus(tokenSv, clinicHistoryId);

    await this.assignmentQueueStateService.recordAssignment(
      campusId,
      CONTROLES_QUEUE_KEY,
      executivo.id,
      null,
    );

    this.logger.log(
      `Reasignación manual: CH ${clinicHistoryId} → ${executivo.userName} (sv_id=${svUserId}, campus=${campusId})`,
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

  /**
   * Reasigna TODOS los pacientes de un ejecutivo origen a otro ejecutivo destino.
   * Obtiene el token SV y resuelve el sv_user_id del destino una sola vez para
   * minimizar llamadas externas.
   */
  async bulkReassignPatients(
    sourceUserName: string,
    targetUserId: string,
    _requestingUserId: string | null,
  ): Promise<{ ok: boolean; count: number; errors: number; message?: string }> {
    const targetExecutivo = await this.userRepository.findOne({
      where: { id: targetUserId, deleted: false, isActive: true },
    });

    if (!targetExecutivo) {
      return { ok: false, count: 0, errors: 0, message: 'Ejecutivo destino no encontrado o inactivo' };
    }

    const cUsersv = (targetExecutivo.cUsersv ?? '').trim();
    if (!cUsersv) {
      return {
        ok: false,
        count: 0,
        errors: 0,
        message: `El ejecutivo "${targetExecutivo.userName}" no tiene el campo Usuario SV configurado.`,
      };
    }

    let tokenSv: string;
    try {
      const { tokenSv: t } = await this.svServices.getTokenSvAdmin();
      tokenSv = t;
    } catch (err) {
      return {
        ok: false,
        count: 0,
        errors: 0,
        message: `No se pudo obtener token de SV: ${err instanceof Error ? err.message : String(err)}`,
      };
    }

    const svUserId = await this.resolveSvUserId(tokenSv, cUsersv);
    if (!svUserId) {
      return {
        ok: false,
        count: 0,
        errors: 0,
        message: `No se encontró usuario en SV con username "${cUsersv}".`,
      };
    }

    // Obtener todos los pacientes asignados al ejecutivo origen desde SV
    let allPatients: Record<string, unknown>[] = [];
    try {
      allPatients = await this.svServices.getCrmControlesPatientsFromSv(tokenSv);
    } catch (err) {
      this.logger.error(`Error obteniendo pacientes de SV para bulk-reassign: ${err instanceof Error ? err.message : err}`);
      return { ok: false, count: 0, errors: 0, message: 'Error obteniendo listado de pacientes de SV.' };
    }

    const isSinAsignar = sourceUserName === '__sin_asignar__';
    const sourcePatients = isSinAsignar
      ? allPatients.filter((p) => {
          const val = String(p['ejecutivo_controles'] ?? '').trim();
          return val === '' || val === 'null' || val === 'undefined';
        })
      : allPatients.filter(
          (p) => String(p['ejecutivo_controles'] ?? '').toLowerCase() === sourceUserName.toLowerCase(),
        );

    const sourceLabel = isSinAsignar ? 'Sin asignar' : `"${sourceUserName}"`;

    if (sourcePatients.length === 0) {
      return {
        ok: true,
        count: 0,
        errors: 0,
        message: `No se encontraron pacientes ${isSinAsignar ? 'sin ejecutivo asignado' : `asignados a "${sourceUserName}"`}.`,
      };
    }

    this.logger.log(
      `Bulk-reassign: ${sourcePatients.length} pacientes de ${sourceLabel} → "${targetExecutivo.userName}"`,
    );

    let count = 0;
    let errors = 0;

    // Procesar en lotes paralelos para evitar timeouts con grandes volúmenes
    const BATCH_SIZE = 20;
    const validPatients = sourcePatients.filter((p) => {
      const id = Number(p['id_historia_clinica']);
      return id && !isNaN(id);
    });

    for (let i = 0; i < validPatients.length; i += BATCH_SIZE) {
      const batch = validPatients.slice(i, i + BATCH_SIZE);

      const results = await Promise.allSettled(
        batch.map(async (patient) => {
          const clinicHistoryId = Number(patient['id_historia_clinica']);
          const updated = await this.svServices.assignControllerExecutiveInSv(
            tokenSv,
            clinicHistoryId,
            svUserId,
          );
          if (!updated) throw new Error(`SV no actualizó CH ${clinicHistoryId}`);
          return { clinicHistoryId, patient };
        }),
      );

      for (const result of results) {
        if (result.status === 'fulfilled') {
          count++;
          const { clinicHistoryId, patient } = result.value;
          if (cUsersv && this.notificacionesService) {
            const pacienteNombre = [
              String(patient['nombre_paciente'] ?? ''),
              String(patient['ap_paterno'] ?? ''),
              String(patient['ap_materno'] ?? ''),
            ].filter(Boolean).join(' ') || `Paciente HC ${clinicHistoryId}`;
            this.notificacionesService
              .notifyPatientAssignment(clinicHistoryId, pacienteNombre, cUsersv)
              .catch((e) => this.logger.warn(`Error notificación bulk-reassign: ${e}`));
          }
        } else {
          errors++;
          this.logger.warn(`Bulk-reassign error: ${result.reason instanceof Error ? result.reason.message : result.reason}`);
        }
      }

      this.logger.log(
        `Bulk-reassign progreso: ${Math.min(i + BATCH_SIZE, validPatients.length)}/${validPatients.length} procesados`,
      );
    }

    const targetName = `${targetExecutivo.firstName ?? ''} ${targetExecutivo.lastName ?? ''}`.trim() || targetExecutivo.userName;
    return {
      ok: true,
      count,
      errors,
      message: `${count} paciente(s) reasignado(s) a ${targetName}${errors > 0 ? ` (${errors} errores)` : ''}.`,
    };
  }

  broadcastControlesUpdated(): void {
    if (this.notificacionesGateway) {
      this.notificacionesGateway.broadcastControlesUpdated(1);
    }
  }
}
