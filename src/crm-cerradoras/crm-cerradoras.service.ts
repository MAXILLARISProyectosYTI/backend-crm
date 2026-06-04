import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Client } from 'pg';
import axios from 'axios';
import { CrmCerradoraSolicitud } from './crm-cerradora-solicitud.entity';
import { OpportunitiesClosers } from '../opportunities-closers/opportunities-closers.entity';
import { dedupeOpportunitiesByPatient } from './utils/paciente-owner.util';
import { CreateSolicitudDto } from './dto/create-solicitud.dto';
import { ResponderSolicitudDto } from './dto/responder-solicitud.dto';
import { ActualizarFirmaDto } from './dto/actualizar-firma.dto';
import { UserService } from '../user/user.service';
import { User } from '../user/user.entity';
import { ROLES_IDS } from '../globals/ids';
import { OpportunitiesClosersService } from '../opportunities-closers/opportunities-closers.service';
import type { ContractChannel, ContractTypeFilter } from './utils/contract-channel.util';
import { getDocusealProductionCutover } from './utils/contract-channel.util';
import { isCloserOpportunityCommissionable } from './utils/closer-commission.util';

export interface PacienteCerradora {
  opportunityId: string;
  pacienteNombre: string;
  clinicHistoryId: number | null;
  quotationId: number | null;
  cerradoraUsername: string;
  firmaContrato: 'pendiente' | 'firmado' | 'rechazado';
  facturado: boolean;
  monto: number | null;
  tipoContrato: string | null;
  fechaContrato: Date | null;
  solicitudesPendientes: number;
  ultimaSolicitudId: number | null;
  createdAt: Date | null;
  contractId?: string | null;
  hasDigitalContract?: boolean;
  contractChannel?: ContractChannel;
  hCPatient?: string | null;
  status?: string | null;
  tipoTratamiento?: string | null;
  fechaCotizacion?: string | null;
  fechaLimiteCierre?: Date | null;
  isPresaved?: boolean;
  comisionDemoraAprobada?: boolean;
  esComisionable?: boolean;
  dateEnd?: Date | null;
}

export interface ListPacientesContratosParams {
  page?: number;
  limit?: number;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
  todayOnly?: boolean;
  contractType?: ContractTypeFilter;
  /** Si true, solo pacientes asignados a la cerradora (no admin). */
  filterByAssignedUser?: boolean;
}

@Injectable()
export class CrmCerradoresService {
  private readonly logger = new Logger(CrmCerradoresService.name);

  constructor(
    @InjectRepository(CrmCerradoraSolicitud)
    private readonly solicitudRepo: Repository<CrmCerradoraSolicitud>,
    @InjectRepository(OpportunitiesClosers)
    private readonly opportunityRepo: Repository<OpportunitiesClosers>,
    private readonly userService: UserService,
    private readonly dataSource: DataSource,
    private readonly opportunitiesClosersService: OpportunitiesClosersService,
  ) {}

  private async isAdmin(userId: string): Promise<boolean> {
    return this.userService.isAdmin(userId);
  }

  private async getUserInfo(userId: string): Promise<{ username: string; nombre: string }> {
    try {
      const user = await this.userService.findOne(userId);
      const username = user.userName ?? userId;
      const nombre = [user.firstName, user.lastName].filter(Boolean).join(' ') || username;
      return { username, nombre };
    } catch {
      return { username: userId, nombre: userId };
    }
  }

  /**
   * Fuente única para Mis Pacientes (CRM) y contratos cerradoras (MaxiCobranzas).
   */
  async listPacientesContratos(
    userId: string,
    params: ListPacientesContratosParams = {},
  ): Promise<{
    data: PacienteCerradora[];
    total: number;
    page: number;
    totalPages: number;
    docusealProductionDate: string;
  }> {
    const admin = await this.isAdmin(userId);
    const filterAssignedUserId =
      params.filterByAssignedUser !== false && !admin ? userId : undefined;

    const page = Math.max(1, params.page ?? 1);
    const limit = Math.min(Math.max(1, params.limit ?? 5000), 5000);
    const contractType = params.contractType ?? 'todos';
    /** Físico/digital se resuelve tras enriquecer con SV; hay que filtrar antes de paginar. */
    const needsChannelFilter = contractType !== 'todos';
    const fetchPage = needsChannelFilter ? 1 : page;
    const fetchLimit = needsChannelFilter ? 5000 : limit;

    const result = await this.opportunitiesClosersService.findAll(
      fetchPage,
      fetchLimit,
      params.search,
      undefined,
      params.dateFrom,
      params.dateTo,
      params.todayOnly === true,
      filterAssignedUserId,
      {
        forPacientesPanel: true,
        contractType,
      },
    );

    const dedupedOps = dedupeOpportunitiesByPatient(result.opportunities);
    let data: PacienteCerradora[] = dedupedOps.map((op) =>
      this.mapOpportunityToPaciente(op),
    );

    if (needsChannelFilter) {
      const total = data.length;
      const totalPages = Math.max(1, Math.ceil(total / limit));
      const start = (page - 1) * limit;
      data = data.slice(start, start + limit);
      return {
        data,
        total,
        page,
        totalPages,
        docusealProductionDate: getDocusealProductionCutover().toISOString().slice(0, 10),
      };
    }

    return {
      data,
      total: dedupedOps.length,
      page: result.page,
      totalPages: Math.max(1, Math.ceil(dedupedOps.length / limit)),
      docusealProductionDate: getDocusealProductionCutover().toISOString().slice(0, 10),
    };
  }

  private async assertMisPacientesAccess(userId: string): Promise<void> {
    const isAdmin = await this.isAdmin(userId);
    if (isAdmin) return;
    const roles = await this.userService.getRoleIds(userId);
    if (roles.includes(ROLES_IDS.CERRADORA)) return;
    throw new ForbiddenException(
      'Solo usuarios cerradoras o administradores pueden acceder a Mis Pacientes',
    );
  }

  async getPacientesCerradora(
    userId: string,
    params: ListPacientesContratosParams = {},
  ): Promise<{
    data: PacienteCerradora[];
    total: number;
    page: number;
    totalPages: number;
    docusealProductionDate: string;
  }> {
    try {
      await this.assertMisPacientesAccess(userId);
      return await this.listPacientesContratos(userId, {
        ...params,
        filterByAssignedUser: true,
        limit: params.limit ?? 5000,
        page: params.page ?? 1,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`getPacientesCerradora falló (userId=${userId}): ${msg}`, err instanceof Error ? err.stack : undefined);
      throw err;
    }
  }

  /** Contratos de todas las cerradoras (MaxiCobranzas / admin CRM). */
  async getContratosCerradoras(
    userId: string,
    params: ListPacientesContratosParams = {},
  ): Promise<{
    data: PacienteCerradora[];
    total: number;
    page: number;
    totalPages: number;
    docusealProductionDate: string;
  }> {
    return this.listPacientesContratos(userId, {
      ...params,
      filterByAssignedUser: false,
      page: params.page ?? 1,
      limit: params.limit ?? 20,
    });
  }

  private mapOpportunityToPaciente(op: {
    id: string;
    name?: string;
    hCPatient?: string;
    cotizacionId?: string;
    contractId?: string;
    status?: string;
    assignedUserName?: string | null;
    firmaContrato?: 'pendiente' | 'firmado' | 'rechazado';
    facturado?: boolean;
    monto?: number | null;
    tipoContrato?: string | null;
    fechaContrato?: Date | null;
    solicitudesPendientes?: number;
    ultimaSolicitudId?: number | null;
    createdAt?: Date;
    hasDigitalContract?: boolean;
    contractChannel?: ContractChannel;
    tipoTratamiento?: string | null;
    fechaCotizacion?: string | null;
    fechaLimiteCierre?: Date | null;
    isPresaved?: boolean;
    hasContractPresave?: boolean;
    hasRegisteredPayment?: boolean;
    comisionDemoraAprobada?: boolean;
    dateEnd?: Date | null;
    facturaId?: string | null;
  }): PacienteCerradora {
    const esComisionable = isCloserOpportunityCommissionable({
      status: op.status,
      dateEnd: op.dateEnd,
      isPresaved: op.isPresaved,
      hasContractPresave: op.hasContractPresave,
      firmaContrato: op.firmaContrato,
      facturaId: op.facturaId,
      facturado: op.facturado,
      hasRegisteredPayment: op.hasRegisteredPayment,
      comisionDemoraAprobada: op.comisionDemoraAprobada,
    });
    return {
      opportunityId: op.id,
      pacienteNombre: op.name || '',
      clinicHistoryId: op.hCPatient
        ? parseInt(op.hCPatient.replace(/\D/g, ''), 10) || null
        : null,
      hCPatient: op.hCPatient ?? null,
      quotationId: op.cotizacionId ? parseInt(op.cotizacionId, 10) || null : null,
      contractId: op.contractId ?? null,
      cerradoraUsername: op.assignedUserName || '—',
      status: op.status ?? null,
      firmaContrato: op.firmaContrato || 'pendiente',
      facturado: !!op.facturado,
      monto: op.monto ? Number(op.monto) : null,
      tipoContrato: op.tipoContrato || null,
      fechaContrato: op.fechaContrato || null,
      solicitudesPendientes: op.solicitudesPendientes || 0,
      ultimaSolicitudId: op.ultimaSolicitudId || null,
      createdAt: op.createdAt ? new Date(op.createdAt) : null,
      hasDigitalContract: !!op.hasDigitalContract,
      contractChannel: op.contractChannel,
      tipoTratamiento: op.tipoTratamiento ?? null,
      fechaCotizacion: op.fechaCotizacion ?? null,
      fechaLimiteCierre: op.fechaLimiteCierre ?? null,
      isPresaved: !!op.isPresaved,
      comisionDemoraAprobada: !!op.comisionDemoraAprobada,
      esComisionable,
      dateEnd: op.dateEnd ?? null,
    };
  }

  /** Lista de solicitudes de demora para revisión. Solo administradores CRM. */
  async getSolicitudes(userId: string): Promise<{ data: CrmCerradoraSolicitud[]; pendientes: number }> {
    const admin = await this.isAdmin(userId);
    if (!admin) {
      throw new ForbiddenException(
        'Solo administradores pueden ver el listado de solicitudes de demora',
      );
    }

    const data = await this.solicitudRepo.find({
      order: { createdAt: 'DESC' },
    });

    const pendientes = data.filter((s) => s.estado === 'pendiente').length;
    return { data, pendientes };
  }

  /** Cuenta solicitudes pendientes para el admin (para badge) */
  async countPendientesAdmin(): Promise<number> {
    return this.solicitudRepo.count({ where: { estado: 'pendiente' } });
  }

  /** Crea una solicitud de demora */
  async crearSolicitud(dto: CreateSolicitudDto, userId: string): Promise<CrmCerradoraSolicitud> {
    const userInfo = await this.getUserInfo(userId);
    const admin = await this.isAdmin(userId);

    let cerradoraUsername = userInfo.username;
    let cerradoraNombre = userInfo.nombre;

    if (admin && dto.cerradoraUsername) {
      try {
        const userRepo = this.dataSource.getRepository(User);
        const user = await userRepo.findOne({ where: { userName: dto.cerradoraUsername } });
        if (user) {
          cerradoraUsername = user.userName ?? dto.cerradoraUsername;
          cerradoraNombre = [user.firstName, user.lastName].filter(Boolean).join(' ') || cerradoraUsername;
        } else {
          cerradoraUsername = dto.cerradoraUsername;
          cerradoraNombre = dto.cerradoraUsername;
        }
      } catch {
        cerradoraUsername = dto.cerradoraUsername;
        cerradoraNombre = dto.cerradoraUsername;
      }
    }

    const solicitud = this.solicitudRepo.create({
      cerradoraUsername,
      cerradoraNombre,
      pacienteNombre: dto.pacienteNombre,
      clinicHistoryId: dto.clinicHistoryId ?? null,
      quotationId: dto.quotationId ?? null,
      opportunityId: dto.opportunityId ?? null,
      tipoSolicitud: dto.tipoSolicitud,
      motivo: dto.motivo,
      monto: dto.monto ?? null,
      tipoContrato: dto.tipoContrato ?? null,
      estado: 'pendiente',
      firmaContrato: 'pendiente',
      facturado: false,
    });

    return this.solicitudRepo.save(solicitud);
  }

  /** Admin responde (aprueba o rechaza) una solicitud */
  async responderSolicitud(
    id: number,
    dto: ResponderSolicitudDto,
    adminUserId: string,
  ): Promise<CrmCerradoraSolicitud> {
    const isAdm = await this.isAdmin(adminUserId);
    if (!isAdm) {
      throw new ForbiddenException('Solo administradores pueden responder solicitudes');
    }

    const solicitud = await this.solicitudRepo.findOne({ where: { id } });
    if (!solicitud) {
      throw new NotFoundException(`Solicitud ${id} no encontrada`);
    }

    const adminInfo = await this.getUserInfo(adminUserId);
    solicitud.estado = dto.estado;
    solicitud.comentarioAdmin = dto.comentarioAdmin ?? null;
    solicitud.adminUsername = adminInfo.username;

    const saved = await this.solicitudRepo.save(solicitud);

    if (saved.estado === 'aprobada') {
      await this.marcarComisionDemoraAprobada(saved);
      this.enviarAMaxiCobranzas(saved, adminInfo.username).catch(err => {
        this.logger.error(`Error al enviar solicitud ${saved.id} a MaxiCobranzas: ${err.message}`, err.stack);
      });
    }

    return saved;
  }

  /**
   * Al aprobar la solicitud, la oportunidad del paciente pasa a comisionable (solo esa fila/cerradora).
   */
  private async marcarComisionDemoraAprobada(
    solicitud: CrmCerradoraSolicitud,
  ): Promise<void> {
    const op = await this.resolveOpportunityForSolicitud(solicitud);
    if (!op) {
      this.logger.warn(
        `Solicitud ${solicitud.id}: no se encontró oportunidad cerradora para marcar comisión aprobada`,
      );
      return;
    }
    op.comisionDemoraAprobada = true;
    await this.opportunityRepo.save(op);
    this.logger.log(
      `Solicitud ${solicitud.id} aprobada → oportunidad ${op.id} comision_demora_aprobada=true`,
    );
  }

  private async resolveOpportunityForSolicitud(
    solicitud: CrmCerradoraSolicitud,
  ): Promise<OpportunitiesClosers | null> {
    if (solicitud.opportunityId) {
      return this.opportunityRepo.findOne({
        where: { id: solicitud.opportunityId, deleted: false },
      });
    }

    const qb = this.opportunityRepo
      .createQueryBuilder('op')
      .leftJoin('user', 'u', 'u.id = op.assignedUserId')
      .addSelect('u.userName', 'assigned_user_name')
      .where('op.deleted = :deleted', { deleted: false });

    if (solicitud.quotationId) {
      qb.andWhere('op.cotizacionId = :cot', { cot: String(solicitud.quotationId) });
    } else if (solicitud.clinicHistoryId) {
      qb.andWhere('op.hCPatient ILIKE :hc', {
        hc: `%${solicitud.clinicHistoryId}%`,
      });
    } else {
      qb.andWhere('LOWER(TRIM(op.name)) = LOWER(TRIM(:name))', {
        name: solicitud.pacienteNombre,
      });
    }

    const { entities, raw } = await qb.getRawAndEntities();
    const username = solicitud.cerradoraUsername?.toLowerCase();
    for (let i = 0; i < entities.length; i++) {
      const assigned = (raw[i]?.assigned_user_name as string | undefined)?.toLowerCase();
      if (!username || assigned === username) {
        return entities[i];
      }
    }
    return entities[0] ?? null;
  }

  /**
   * Envía una solicitud aprobada al módulo Demoras CRM de MaxiCobranzas.
   * Se llama de forma asíncrona (fire-and-forget) para no bloquear la respuesta al admin.
   */
  private async enviarAMaxiCobranzas(
    solicitud: CrmCerradoraSolicitud,
    adminUsername: string,
  ): Promise<void> {
    const baseUrl = (process.env.URL_BACK_SV ?? 'http://localhost:8800/api').replace(/\/$/, '');
    const apiKey = process.env.INTERNAL_CRM_API_KEY ?? '';

    if (!apiKey) {
      this.logger.warn('INTERNAL_CRM_API_KEY no configurada. No se enviará a MaxiCobranzas.');
      return;
    }

    const url = `${baseUrl}/v1/cerradoras/solicitudes`;

    const payload = {
      idSolicitudCrm: solicitud.id,
      paciente: solicitud.pacienteNombre,
      historiaClinica: solicitud.clinicHistoryId ?? 0,
      cotizacionId: solicitud.quotationId ?? 0,
      cerradora: solicitud.cerradoraUsername,
      cerradoraNombre: solicitud.cerradoraNombre,
      tipoDemora: solicitud.tipoSolicitud === 'demora_facturacion' ? 'Demora de Facturación' : 'Demora de Contrato',
      justificacion: solicitud.motivo ?? '',
      monto: solicitud.monto ? Number(solicitud.monto) : 0,
      tipoContrato: solicitud.tipoContrato ?? 'contado',
      aprobadoPor: adminUsername,
      fechaAprobacion: new Date().toISOString(),
    };

    try {
      await axios.post(url, payload, {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 10000,
      });
      this.logger.log(`Solicitud CRM #${solicitud.id} enviada exitosamente a MaxiCobranzas Demoras CRM.`);
    } catch (err: any) {
      const status = err?.response?.status;
      const data = err?.response?.data;
      this.logger.error(
        `Error al enviar solicitud #${solicitud.id} a MaxiCobranzas (HTTP ${status}): ${err.message}`,
        JSON.stringify(data),
      );
    }
  }

  /** Cerradora (o admin) actualiza el estado de firma/facturación */
  async actualizarFirma(
    id: number,
    dto: ActualizarFirmaDto,
    userId: string,
  ): Promise<CrmCerradoraSolicitud> {
    const solicitud = await this.solicitudRepo.findOne({ where: { id } });
    if (!solicitud) {
      throw new NotFoundException(`Solicitud ${id} no encontrada`);
    }

    const admin = await this.isAdmin(userId);
    const userInfo = await this.getUserInfo(userId);

    if (!admin && solicitud.cerradoraUsername !== userInfo.username) {
      throw new ForbiddenException('No tienes permiso para actualizar esta solicitud');
    }

    solicitud.firmaContrato = dto.firmaContrato;
    if (dto.firmaContrato === 'firmado' && !solicitud.fechaContrato) {
      solicitud.fechaContrato = new Date();
    }
    if (dto.facturado !== undefined) {
      solicitud.facturado = dto.facturado;
    }

    return this.solicitudRepo.save(solicitud);
  }

  /** Actualiza firma/facturación a través de la oportunidad (crea solicitud si no existe) */
  async actualizarFirmaPorOportunidad(
    opportunityId: string,
    dto: ActualizarFirmaDto,
    userId: string,
  ): Promise<CrmCerradoraSolicitud> {
    const admin = await this.isAdmin(userId);
    const userInfo = await this.getUserInfo(userId);

    // Buscar si ya existe una solicitud en crm_cerradora_solicitudes
    let solicitud = await this.solicitudRepo.findOne({
      where: [
        ...(dto.quotationId ? [{ quotationId: dto.quotationId }] : []),
        ...(dto.clinicHistoryId ? [{ clinicHistoryId: dto.clinicHistoryId }] : []),
        ...(dto.pacienteNombre ? [{ pacienteNombre: dto.pacienteNombre }] : []),
      ],
      order: { id: 'DESC' },
    });

    if (!solicitud) {
      if (!dto.pacienteNombre) {
        throw new NotFoundException('No se proporcionó el nombre del paciente para registrar el estado.');
      }
      solicitud = this.solicitudRepo.create({
        cerradoraUsername: userInfo.username,
        cerradoraNombre: userInfo.nombre,
        pacienteNombre: dto.pacienteNombre,
        clinicHistoryId: dto.clinicHistoryId ?? null,
        quotationId: dto.quotationId ?? null,
        tipoSolicitud: 'demora_contrato',
        motivo: 'Registro automático de estado',
        estado: 'aprobada',
        firmaContrato: dto.firmaContrato,
        facturado: dto.facturado ?? false,
      });
    } else {
      if (!admin && solicitud.cerradoraUsername !== userInfo.username) {
        throw new ForbiddenException('No tienes permiso para actualizar este paciente');
      }
      solicitud.firmaContrato = dto.firmaContrato;
      if (dto.facturado !== undefined) {
        solicitud.facturado = dto.facturado;
      }
    }

    if (dto.firmaContrato === 'firmado' && !solicitud.fechaContrato) {
      solicitud.fechaContrato = new Date();
    }

    return this.solicitudRepo.save(solicitud);
  }

  /** Registra un nuevo paciente en el panel */
  async registrarPaciente(
    dto: CreateSolicitudDto & { firmaContrato?: 'pendiente' | 'firmado' | 'rechazado'; facturado?: boolean },
    userId: string,
  ): Promise<CrmCerradoraSolicitud> {
    const userInfo = await this.getUserInfo(userId);

    const registro = this.solicitudRepo.create({
      cerradoraUsername: userInfo.username,
      cerradoraNombre: userInfo.nombre,
      pacienteNombre: dto.pacienteNombre,
      clinicHistoryId: dto.clinicHistoryId ?? null,
      quotationId: dto.quotationId ?? null,
      tipoSolicitud: 'demora_contrato',
      motivo: 'Registro inicial de paciente',
      monto: dto.monto ?? null,
      tipoContrato: dto.tipoContrato ?? null,
      estado: 'aprobada',
      firmaContrato: dto.firmaContrato ?? 'pendiente',
      facturado: dto.facturado ?? false,
    });

    const saved = await this.solicitudRepo.save(registro);

    // Also register the patient as an opportunity closer in the general closers queue
    try {
      await this.opportunitiesClosersService.createOpportunityCloser({
        name: dto.pacienteNombre,
        status: 'PENDIENTE',
        hCPatient: dto.clinicHistoryId ? String(dto.clinicHistoryId) : undefined,
        cotizacionId: dto.quotationId ? String(dto.quotationId) : undefined,
        assignedUserId: userId,
        createdAt: new Date(),
      });
    } catch (err) {
      this.logger.error(`Error creating opportunity closer for manual patient registration: ${err.message}`, err.stack);
    }

    return saved;
  }
}
