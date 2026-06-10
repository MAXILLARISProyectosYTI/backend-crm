import {
  BadRequestException,
  Injectable,
  Logger,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Incidencia, EstadoIncidencia } from './incidencia.entity';
import { User } from 'src/user/user.entity';
import { CreateIncidenciaDto, UpdateEstadoDto } from './incidencias.dto';
import { SvServices } from 'src/sv-services/sv.services';
import { IncidenciaRemotaDto, SvIssueJoinRaw } from './incidencias-sv.types';

export interface SyncPendingIncidenciaItem {
  crmId: number;
  pacienteId: number;
  pacienteNombre: string;
  titulo: string;
  status: 'pending' | 'synced' | 'failed';
  svIssueId?: number;
  error?: string;
}

export interface SyncPendingIncidenciasResult {
  dryRun: boolean;
  total: number;
  synced: number;
  failed: number;
  normalizedAreas: number;
  items: SyncPendingIncidenciaItem[];
}

const SV_PRIORITY_LABEL: Record<number, string> = {
  1: 'Baja',
  2: 'Alta',
  3: 'Media',
  4: 'Baja',
};
const SV_STATUS_LABEL: Record<string, string> = {
  a: 'Abierta',
  c: 'Abierta',
  u: 'En revisión',
  p: 'En revisión',
  d: 'Cerrada',
};
/** SV: `collection_interactions_record.observation` admite ~500; `issue_body.descripcion` ~100. */
const SV_ISSUE_OBSERVATION_MAX = 500;

const AREA_NAME_FALLBACK: Record<string, number> = {
  cobranza: 1,
  cobranzas: 1,
  clínica: 2,
  clinica: 2,
  laboratorio: 3,
  ventas: 4,
  facturación: 5,
  facturacion: 5,
  recepción: 5,
  recepcion: 5,
};

@Injectable()
export class IncidenciasService implements OnModuleInit {
  private readonly logger = new Logger(IncidenciasService.name);
  private schemaReady: Promise<void> | null = null;

  constructor(
    @InjectRepository(Incidencia)
    private readonly repo: Repository<Incidencia>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly svServices: SvServices,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.ensureSchema();
  }

  /** Crea/actualiza columnas de crm_incidencias (idempotente). */
  private async ensureSchema(): Promise<void> {
    if (!this.schemaReady) {
      this.schemaReady = this.runSchemaMigrations();
    }
    return this.schemaReady;
  }

  private async runSchemaMigrations(): Promise<void> {
    try {
      await this.repo.query(`
        CREATE TABLE IF NOT EXISTS crm_incidencias (
          id                   SERIAL PRIMARY KEY,
          titulo               VARCHAR(255)  NOT NULL,
          descripcion          TEXT          NOT NULL,
          tipo                 VARCHAR(50)   NOT NULL DEFAULT 'Queja',
          prioridad            VARCHAR(10)   NOT NULL DEFAULT 'Media',
          estado               VARCHAR(20)   NOT NULL DEFAULT 'Abierta',
          paciente_id          INTEGER       NOT NULL,
          paciente_nombre      VARCHAR(255)  NOT NULL,
          creada_por           VARCHAR(100)  NOT NULL DEFAULT 'Admin',
          ejecutivo_username   VARCHAR(100),
          area_destino         VARCHAR(50)   DEFAULT 'CRM Controles',
          sv_issue_id          INTEGER,
          sync_status          VARCHAR(20)   DEFAULT 'synced',
          sync_error           TEXT,
          fecha_creacion       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
          fecha_actualizacion  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
        );
      `);
      await this.repo.query(
        `ALTER TABLE crm_incidencias ADD COLUMN IF NOT EXISTS ejecutivo_username VARCHAR(100);`,
      );
      await this.repo.query(
        `ALTER TABLE crm_incidencias ADD COLUMN IF NOT EXISTS area_destino VARCHAR(50) DEFAULT 'CRM Controles';`,
      );
      await this.repo.query(
        `ALTER TABLE crm_incidencias ADD COLUMN IF NOT EXISTS sv_issue_id INTEGER;`,
      );
      await this.repo.query(
        `ALTER TABLE crm_incidencias ADD COLUMN IF NOT EXISTS sync_status VARCHAR(20) DEFAULT 'synced';`,
      );
      await this.repo.query(
        `ALTER TABLE crm_incidencias ADD COLUMN IF NOT EXISTS sync_error TEXT;`,
      );
      this.logger.log('Tabla crm_incidencias lista ✓');
    } catch (err) {
      this.schemaReady = null;
      this.logger.error('Error creando tabla crm_incidencias:', err);
      throw err;
    }
  }

  async findAll(): Promise<Incidencia[]> {
    await this.ensureSchema();
    return this.repo.find({ order: { fechaCreacion: 'DESC' } });
  }

  async findAllForUser(
    userId: string | null,
    pacienteId?: number,
    area?: string,
  ): Promise<Incidencia[]> {
    await this.ensureSchema();
    if (pacienteId) return this.findByPaciente(pacienteId);

    const qb = this.repo.createQueryBuilder('i').orderBy('i.fechaCreacion', 'DESC');

    if (area) {
      qb.andWhere('i.areaDestino = :area', { area });
    }

    if (!userId) return qb.getMany();

    const user = await this.userRepo.findOne({ where: { id: userId, deleted: false } });
    if (!user || user.type === 'admin') return qb.getMany();

    const svUsername = (user.cUsersv ?? '').trim().toLowerCase();
    if (!svUsername) return [];

    qb.andWhere('LOWER(TRIM(i.ejecutivoUsername)) = :svUsername', { svUsername });
    return qb.getMany();
  }

  async findByPaciente(pacienteId: number): Promise<Incidencia[]> {
    await this.ensureSchema();
    return this.repo.find({
      where: { pacienteId },
      order: { fechaCreacion: 'DESC' },
    });
  }

  async findForPatient(pacienteId: number): Promise<IncidenciaRemotaDto[]> {
    await this.ensureSchema();
    const fromSv = await this.listFromSvForPatient(pacienteId);
    const local = await this.findByPaciente(pacienteId);
    const localBySvId = new Map(
      local
        .filter((inc) => inc.svIssueId != null)
        .map((inc) => [inc.svIssueId as number, inc]),
    );

    const fromSvEnriched = fromSv.map((item) => {
      const mirror = localBySvId.get(item.id);
      if (!mirror) return item;
      const preferLocal =
        mirror.descripcion.length > (item.descripcion?.length ?? 0);
      if (!preferLocal) return item;
      return {
        ...item,
        titulo: mirror.titulo || item.titulo,
        descripcion: mirror.descripcion,
        creadaPor: mirror.creadaPor || item.creadaPor,
      };
    });

    const legacyLocal = local
      .filter((inc) => inc.svIssueId == null)
      .map((inc) => this.localToRemota(inc));
    if (fromSvEnriched.length === 0) return legacyLocal;
    const svIds = new Set(fromSvEnriched.map((i) => i.id));
    const extraLocal = local
      .filter((inc) => inc.svIssueId != null && !svIds.has(inc.svIssueId))
      .map((inc) => this.localToRemota(inc));
    return [...fromSvEnriched, ...extraLocal, ...legacyLocal];
  }

  /**
   * Lista incidencias como las ve Historia clínica (collection-interactions + issue_body).
   */
  async listFromSvForPatient(pacienteId: number): Promise<IncidenciaRemotaDto[]> {
    try {
      const { tokenSv } = await this.svServices.getTokenSvAdmin();
      const rows = await this.svServices.getCollectionInteractionsForClient(
        pacienteId,
        tokenSv,
      );
      return rows
        .filter((row) => this.isSvIncidenciaRow(row))
        .map((row) => this.mapCollectionRowToRemota(row, pacienteId));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`listFromSvForPatient ${pacienteId}: ${msg}`);
      return [];
    }
  }

  /**
   * Intenta crear en SV (HC). Siempre guarda en CRM.
   * Si SV responde bien → visible en Historia clínica + listado CRM.
   * Si SV falla → queda en CRM con soloCrm y mensaje (comportamiento previo).
   */
  async create(
    dto: CreateIncidenciaDto,
    crmUserId: string | null = null,
  ): Promise<IncidenciaRemotaDto> {
    await this.ensureSchema();
    const enriched: CreateIncidenciaDto = {
      ...dto,
      creadaPor: dto.creadaPor ?? (await this.resolveCreadaPorLabel(crmUserId)),
    };

    try {
      const remota = await this.createInSv(enriched, crmUserId);
      try {
        await this.saveMirrorFromSv(enriched, remota);
      } catch (mirrorErr) {
        this.logger.warn(
          `Incidencia SV ok pero falló espejo CRM paciente ${dto.pacienteId}: ${
            mirrorErr instanceof Error ? mirrorErr.message : mirrorErr
          }`,
        );
      }
      return remota;
    } catch (err) {
      const reason =
        err instanceof Error ? err.message : 'No se pudo sincronizar con SV';
      this.logger.warn(
        `Incidencia paciente ${dto.pacienteId} → solo CRM: ${reason}`,
      );
      const local = await this.createLocal(enriched, {
        syncStatus: 'failed',
        syncError: reason,
      });
      return {
        ...this.localToRemota(local),
        soloCrm: true,
        mensajeSv: reason,
      };
    }
  }

  private async createInSv(
    dto: CreateIncidenciaDto,
    crmUserId: string | null,
  ): Promise<IncidenciaRemotaDto> {
    if (!this.svServices) {
      throw new ServiceUnavailableException('Servicio SV no disponible');
    }

    const auth = await this.resolveSvAuth(crmUserId, dto.ejecutivoUsername);
    const { tokenSv, svUserId, svUsername } = auth;

    let contractId = await this.svServices.getActiveContractIdForPatient(
      dto.pacienteId,
      tokenSv,
    );
    if (!contractId) {
      this.logger.log(
        `Paciente ${dto.pacienteId} sin contrato: creando contrato técnico en SV`,
      );
      contractId = await this.svServices.ensureContractForIncidents(
        dto.pacienteId,
        tokenSv,
      );
    }
    if (!contractId) {
      throw new BadRequestException(
        `No se pudo obtener ni crear contrato SV para el paciente ${dto.pacienteId}`,
      );
    }

    const typeId = await this.svServices.resolveIssueTypeId(dto.tipo, tokenSv);
    const priorityId = await this.svServices.resolveIssuePriorityId(
      dto.prioridad,
      tokenSv,
    );
    const areaId = await this.resolveAreaId(dto, tokenSv);
    const areasCatalog = await this.svServices.getIssueAreas(tokenSv);
    const areaName =
      areasCatalog.find((a) => a.id === areaId)?.name ??
      dto.areaDestino ??
      'Recepción';

    this.logger.log(
      `POST SV /issues paciente=${dto.pacienteId} contract=${contractId} area=${areaId} autor=${svUsername ?? svUserId ?? 'admin'}`,
    );

    const created = await this.svServices.createIssue(tokenSv, {
      patientId: dto.pacienteId,
      contractId,
      affectation: dto.prioridad === 'Alta' ? 4 : dto.prioridad === 'Baja' ? 2 : 3,
      description: this.buildSvIssueDescription(dto),
      typeId,
      priorityId,
      areas: [areaId],
      ...(svUserId != null ? { userId: svUserId } : {}),
    });

    this.logger.log(
      `Incidencia SV #${created.id} creada (visible en listByIdForClient) paciente ${dto.pacienteId}`,
    );

    const remota = this.mapSvToRemota(created as unknown as SvIssueJoinRaw, dto, areaName);
    if (svUsername) remota.creadaPor = svUsername;
    remota.svIssueId = Number(created.id) || remota.id;
    return remota;
  }

  /** Texto completo para observation (500); el body en SV se trunca aparte. */
  private buildSvIssueDescription(dto: CreateIncidenciaDto): string {
    const full = `[${dto.tipo}] ${dto.titulo}\n\n${dto.descripcion}`;
    if (full.length <= SV_ISSUE_OBSERVATION_MAX) return full;

    const header = `[${dto.tipo}] ${dto.titulo}`;
    if (header.length >= SV_ISSUE_OBSERVATION_MAX) {
      return `${header.slice(0, SV_ISSUE_OBSERVATION_MAX - 3)}...`;
    }

    const room = SV_ISSUE_OBSERVATION_MAX - header.length - 2;
    const body =
      dto.descripcion.length <= room
        ? dto.descripcion
        : `${dto.descripcion.slice(0, Math.max(0, room - 3))}...`;
    return `${header}\n\n${body}`;
  }

  private async resolveCreadaPorLabel(
    crmUserId: string | null,
  ): Promise<string> {
    if (!crmUserId) return 'CRM Controles';
    const user = await this.userRepo.findOne({
      where: { id: crmUserId, deleted: false },
    });
    const svUser = user?.cUsersv?.trim();
    if (svUser) return svUser;
    const name = [user?.firstName, user?.lastName].filter(Boolean).join(' ').trim();
    return user?.userName?.trim() || name || 'CRM Controles';
  }

  private async saveMirrorFromSv(
    dto: CreateIncidenciaDto,
    remota: IncidenciaRemotaDto,
  ): Promise<void> {
    const inc = new Incidencia();
    inc.titulo = dto.titulo;
    inc.descripcion = dto.descripcion;
    inc.tipo = dto.tipo as Incidencia['tipo'];
    inc.prioridad = dto.prioridad as Incidencia['prioridad'];
    inc.pacienteId = dto.pacienteId;
    inc.pacienteNombre = dto.pacienteNombre;
    inc.creadaPor = remota.creadaPor ?? dto.creadaPor ?? 'CRM Controles';
    inc.ejecutivoUsername = dto.ejecutivoUsername?.trim().toLowerCase() ?? null;
    inc.areaDestino = remota.areaDestino ?? dto.areaDestino ?? 'Recepción';
    inc.estado = (remota.estado as Incidencia['estado']) ?? 'Abierta';
    const svId = remota.svIssueId ?? remota.id;
    inc.svIssueId = Number.isFinite(Number(svId)) ? Number(svId) : null;
    inc.syncStatus = 'synced';
    inc.syncError = null;
    await this.repo.save(inc);
  }

  /**
   * Token SV del creador → si no, del ejecutivo asignado → admin + userId del creador/ejecutivo.
   */
  private async resolveSvAuth(
    crmUserId: string | null,
    ejecutivoUsername?: string,
  ): Promise<{ tokenSv: string; svUserId?: number; svUsername?: string }> {
    const tryUserToken = async (
      user: User | null,
    ): Promise<{ tokenSv: string; svUsername: string } | null> => {
      const username = user?.cUsersv?.trim();
      if (!username || !user?.cContraseaSv) return null;
      try {
        const { tokenSv } = await this.svServices.getTokenSv(username, user.cContraseaSv);
        return { tokenSv, svUsername: username };
      } catch {
        return null;
      }
    };

    if (crmUserId) {
      const creator = await this.userRepo.findOne({
        where: { id: crmUserId, deleted: false },
      });
      const creatorToken = await tryUserToken(creator);
      if (creatorToken) return creatorToken;
    }

    const execKey = ejecutivoUsername?.trim().toLowerCase();
    if (execKey) {
      const exec = await this.userRepo
        .createQueryBuilder('u')
        .where('LOWER(TRIM(u.cUsersv)) = :exec', { exec: execKey })
        .andWhere('(u.deleted IS NULL OR u.deleted = false)')
        .getOne();
      const execToken = await tryUserToken(exec);
      if (execToken) return execToken;
    }

    let targetUsername: string | null = null;
    if (crmUserId) {
      const creator = await this.userRepo.findOne({ where: { id: crmUserId } });
      targetUsername = creator?.cUsersv?.trim() ?? null;
    }
    if (!targetUsername && ejecutivoUsername?.trim()) {
      targetUsername = ejecutivoUsername.trim();
    }

    const { tokenSv } = await this.svServices.getTokenSvAdmin();
    if (targetUsername) {
      const svUserId = await this.svServices.getSvUserIdByUsername(
        tokenSv,
        targetUsername,
      );
      if (svUserId) {
        return { tokenSv, svUserId, svUsername: targetUsername };
      }
    }

    return { tokenSv };
  }

  private isSvIncidenciaRow(row: Record<string, unknown>): boolean {
    if (String(row.detail ?? '').toUpperCase() === 'INCIDENCIA') return true;
    if (row.issueHeadId != null) return true;
    const bodies = row.issueBodies;
    return Array.isArray(bodies) && bodies.length > 0;
  }

  private mapCollectionRowToRemota(
    row: Record<string, unknown>,
    pacienteId: number,
  ): IncidenciaRemotaDto {
    const bodies = Array.isArray(row.issueBodies)
      ? (row.issueBodies as Array<Record<string, unknown>>)
      : [];
    const body = bodies[0];
    const status = String(body?.status ?? 'c');
    const prioId = body?.priorityId != null ? Number(body.priorityId) : null;
    const observationText = String(row.observation ?? '');
    const bodyText = String(body?.descripcion ?? '');
    const descripcion =
      observationText.length >= bodyText.length ? observationText : bodyText || observationText;

    return {
      id: body?.id != null ? Number(body.id) : Number(row.id),
      titulo: String(body?.subject ?? row.detail ?? 'Incidencia'),
      descripcion,
      tipo: 'Incidencia',
      prioridad:
        (prioId != null ? SV_PRIORITY_LABEL[prioId] : null) ?? 'Media',
      estado: SV_STATUS_LABEL[status] ?? 'Abierta',
      pacienteId,
      pacienteNombre: '',
      creadaPor: String(row.username ?? 'SV'),
      areaDestino: null,
      fechaCreacion: String(
        body?.createdDate ?? row.date ?? new Date().toISOString(),
      ),
    };
  }

  private async resolveAreaId(dto: CreateIncidenciaDto, tokenSv: string): Promise<number> {
    if (dto.areaId != null && dto.areaId > 0) return dto.areaId;

    const areas = await this.svServices.getIssueAreas(tokenSv);
    if (dto.areaDestino?.trim() && areas.length > 0) {
      const byName = areas.find(
        (a) => a.name.trim().toLowerCase() === dto.areaDestino!.trim().toLowerCase(),
      );
      if (byName) return byName.id;
    }
    if (areas.length > 0) {
      const recep = areas.find((a) => /recepción|recepcion/i.test(a.name));
      return recep?.id ?? areas[0].id;
    }

    const key = (dto.areaDestino ?? 'recepción').trim().toLowerCase();
    return AREA_NAME_FALLBACK[key] ?? 5;
  }

  private mapSvToRemota(
    raw: SvIssueJoinRaw,
    dto: CreateIncidenciaDto,
    areaName: string,
  ): IncidenciaRemotaDto {
    const prioId = raw.priority?.id;
    const prioridad =
      (prioId != null ? SV_PRIORITY_LABEL[prioId] : null) ??
      raw.priority?.name ??
      dto.prioridad;

    return {
      id: raw.id,
      titulo: raw.type?.name ?? dto.titulo,
      descripcion: raw.description ?? dto.descripcion,
      tipo: raw.type?.name ?? dto.tipo,
      prioridad,
      estado: SV_STATUS_LABEL[raw.status ?? 'c'] ?? 'Abierta',
      pacienteId: raw.patientId ?? dto.pacienteId,
      pacienteNombre: dto.pacienteNombre,
      creadaPor: dto.creadaPor ?? 'CRM Controles',
      areaDestino: areaName,
      fechaCreacion: raw.createdDate ?? new Date().toISOString(),
      svIssueId: raw.id,
    };
  }

  private localToRemota(inc: Incidencia): IncidenciaRemotaDto {
    const soloCrm = inc.syncStatus === 'failed' || inc.svIssueId == null;
    return {
      id: inc.id,
      titulo: inc.titulo,
      descripcion: inc.descripcion,
      tipo: inc.tipo,
      prioridad: inc.prioridad,
      estado: inc.estado,
      pacienteId: inc.pacienteId,
      pacienteNombre: inc.pacienteNombre,
      creadaPor: inc.creadaPor,
      areaDestino: inc.areaDestino,
      fechaCreacion: inc.fechaCreacion.toISOString(),
      svIssueId: inc.svIssueId,
      ...(soloCrm
        ? {
            soloCrm: true,
            mensajeSv:
              inc.syncError ??
              'Incidencia pendiente de sincronizar con Historia clínica',
          }
        : {}),
    };
  }

  private async createLocal(
    dto: CreateIncidenciaDto,
    opts?: { syncStatus?: string; syncError?: string | null },
  ): Promise<Incidencia> {
    const inc = new Incidencia();
    inc.titulo = dto.titulo;
    inc.descripcion = dto.descripcion;
    inc.tipo = dto.tipo as Incidencia['tipo'];
    inc.prioridad = dto.prioridad as Incidencia['prioridad'];
    inc.pacienteId = dto.pacienteId;
    inc.pacienteNombre = dto.pacienteNombre;
    inc.creadaPor = dto.creadaPor ?? 'CRM Controles';
    inc.ejecutivoUsername = dto.ejecutivoUsername?.trim().toLowerCase() ?? null;
    inc.areaDestino = dto.areaDestino ?? 'Recepción';
    inc.estado = 'Abierta';
    inc.svIssueId = null;
    inc.syncStatus = opts?.syncStatus ?? 'failed';
    inc.syncError = opts?.syncError ?? null;
    return this.repo.save(inc);
  }

  /**
   * Sincroniza a SV (Historia clínica) todas las filas de crm_incidencias sin sv_issue_id.
   * Uso: `npm run incidencias:sync-sv` o `--dry-run` para solo listar pendientes.
   */
  async syncPendingToSv(opts?: { dryRun?: boolean }): Promise<SyncPendingIncidenciasResult> {
    await this.ensureSchema();
    const dryRun = opts?.dryRun === true;

    const normalizedAreas = await this.normalizePendingAreaTypos();
    const pending = await this.repo
      .createQueryBuilder('i')
      .where('i.sv_issue_id IS NULL')
      .orderBy('i.id', 'ASC')
      .getMany();

    const result: SyncPendingIncidenciasResult = {
      dryRun,
      total: pending.length,
      synced: 0,
      failed: 0,
      normalizedAreas,
      items: [],
    };

    if (pending.length === 0) {
      this.logger.log('No hay incidencias CRM pendientes de sincronizar con SV.');
      return result;
    }

    this.logger.log(
      `${dryRun ? '[DRY-RUN] ' : ''}${pending.length} incidencia(s) pendiente(s) de sync SV`,
    );

    for (const inc of pending) {
      const item: SyncPendingIncidenciaItem = {
        crmId: inc.id,
        pacienteId: inc.pacienteId,
        pacienteNombre: inc.pacienteNombre,
        titulo: inc.titulo,
        status: dryRun ? 'pending' : 'failed',
      };
      result.items.push(item);

      if (dryRun) continue;

      try {
        const dto = this.incidenciaToCreateDto(inc);
        const remota = await this.createInSv(dto, null);
        const svIssueId = remota.svIssueId ?? remota.id;
        await this.repo.update(inc.id, {
          svIssueId: Number.isFinite(Number(svIssueId)) ? Number(svIssueId) : null,
          syncStatus: 'synced',
          syncError: null,
          ...(remota.creadaPor ? { creadaPor: remota.creadaPor } : {}),
        });
        item.status = 'synced';
        item.svIssueId = Number(svIssueId);
        result.synced += 1;
        this.logger.log(
          `CRM #${inc.id} → SV issue #${svIssueId} (paciente ${inc.pacienteId})`,
        );
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        await this.repo.update(inc.id, {
          syncStatus: 'failed',
          syncError: error,
        });
        item.status = 'failed';
        item.error = error;
        result.failed += 1;
        this.logger.warn(`CRM #${inc.id} paciente ${inc.pacienteId}: ${error}`);
      }
    }

    return result;
  }

  /** Corrige typos conocidos en area_destino antes de migrar. */
  private async normalizePendingAreaTypos(): Promise<number> {
    const rows = (await this.repo.query(`
      UPDATE crm_incidencias
      SET area_destino = 'Clínica'
      WHERE sv_issue_id IS NULL
        AND LOWER(TRIM(area_destino)) IN ('clínuca', 'clinuca')
      RETURNING id
    `)) as Array<{ id: number }>;
    const count = rows?.length ?? 0;
    if (count > 0) {
      this.logger.log(`Área corregida Clínuca → Clínica en ${count} fila(s)`);
    }
    return count;
  }

  private incidenciaToCreateDto(inc: Incidencia): CreateIncidenciaDto {
    const ejecutivo = inc.ejecutivoUsername?.trim();
    const creadaPor =
      ejecutivo || (inc.creadaPor !== 'Admin' ? inc.creadaPor : undefined);
    return {
      titulo: inc.titulo,
      descripcion: inc.descripcion,
      tipo: inc.tipo,
      prioridad: inc.prioridad,
      pacienteId: inc.pacienteId,
      pacienteNombre: inc.pacienteNombre,
      creadaPor,
      ejecutivoUsername: ejecutivo || undefined,
      areaDestino: inc.areaDestino ?? 'Recepción',
    };
  }

  async updateEstado(id: number, dto: UpdateEstadoDto): Promise<Incidencia | null> {
    await this.repo.update(id, { estado: dto.estado as unknown as EstadoIncidencia });
    return this.repo.findOne({ where: { id } });
  }

  async remove(id: number): Promise<void> {
    await this.repo.delete(id);
  }
}
