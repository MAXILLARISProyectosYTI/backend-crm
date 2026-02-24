import { HttpException, Inject, Injectable, Logger, NotFoundException, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull, Not } from 'typeorm';
import { OpportunitiesClosers } from './opportunities-closers.entity';
import { UpdateOpCloserDto, UpdateQueueOpClosersDto } from './dto/update-op-closer.dto';
import { DateTime } from 'luxon';
import { statesCRM } from './dto/enum-types.enum';
import { SvServices } from 'src/sv-services/sv.services';
import { UserService } from 'src/user/user.service';
import { DetalleCotizacionDto } from './dto/detail-quotations.dto';
import { ENUM_TARGET_TYPE } from 'src/action-history/dto/enum-target-type';
import { FilesService } from 'src/files/files.service';
import { User } from 'src/user/user.entity';
import { ActionHistoryService } from 'src/action-history/action-history.service';
import { IdGeneratorService } from 'src/common/services/id-generator.service';
import { OpportunityService } from 'src/opportunity/opportunity.service';
import { OpportunitiesClosersCronsService } from './opportunity-closers-crons.service';

@Injectable()
export class OpportunitiesClosersService {
  private readonly logger = new Logger(OpportunitiesClosersService.name);
  private readonly URL_DOWNLOAD_FILES = process.env.URL_DOWNLOAD_FILES;
  /** Base URL para manager_leads; nunca localhost. Por defecto https://crm.maxillaris.pe/ */
  private readonly URL_FRONT_MANAGER_LEADS = this.normalizeManagerLeadsBase(process.env.URL_FRONT_MANAGER_LEADS);

  private normalizeManagerLeadsBase(envUrl?: string): string {
    const base = (envUrl || 'https://crm.maxillaris.pe/').trim();
    if (base.includes('localhost')) return 'https://crm.maxillaris.pe/';
    return base.endsWith('/') ? base : `${base}/`;
  }

  constructor(
    @InjectRepository(OpportunitiesClosers)
    private readonly opportunitiesClosersRepository: Repository<OpportunitiesClosers>,
    private readonly svServices: SvServices,
    private readonly userService: UserService,
    private readonly filesService: FilesService,
    private readonly actionHistoryService: ActionHistoryService,
    private readonly idGeneratorService: IdGeneratorService,
    private readonly opportunityService: OpportunityService,
    @Inject(forwardRef(() => OpportunitiesClosersCronsService))
    private readonly opportunitiesClosersCronsService: OpportunitiesClosersCronsService,
  ) {}

  async createOpportunityCloser(payload: Partial<OpportunitiesClosers>) {
    const opportunity = this.opportunitiesClosersRepository.create({
      id: payload.id ?? this.idGeneratorService.generateId(),
      ...payload,
      createdAt: payload.createdAt ?? new Date(),
    });

    return await this.opportunitiesClosersRepository.save(opportunity);
  }

  async findAll(
    page: number = 1,
    limit: number = 10,
    search?: string,
    assignedToUserId?: string,
  ): Promise<{ opportunities: (OpportunitiesClosers & { assignedUserName?: string; sedeAtencion?: string | null })[], total: number, page: number, totalPages: number }> {
    // Historias del cliente cuando hay search: vienen del endpoint externo; usamos para filtrar "todas las cotizaciones del cliente"
    let clientHistories: string[] = [];

    // 1) Si existe search: primero endpoint externo → traer cotizaciones del paciente → sincronizar con nuestra BD
    if (search?.trim()) {
      try {
        this.logger.log(`[findAll] search presente: consultando SV search="${search.trim()}", assignedToUserId=${assignedToUserId}`);
        const token = await this.svServices.getTokenSvAdmin();
        const resultsFromSv = await this.svServices.getQuotationSearch(token.tokenSv, search.trim());
        this.logger.log(`[findAll] Respuesta SV: cantidad=${resultsFromSv.length}, items=${JSON.stringify(resultsFromSv.map((r) => ({ id: r.id, name: r.name, history: r.history })))}`);

        const byQuotationId = new Map<string, typeof resultsFromSv[0]>();
        for (const item of resultsFromSv) {
          const key = String(item.id);
          if (!byQuotationId.has(key)) byQuotationId.set(key, item);
        }
        this.logger.log(`[findAll] Después de dedup por cotizacion_id: cantidad=${byQuotationId.size}`);

        let inserted = 0;
        let skippedExists = 0;
        let skippedBadQuotationId = 0;
        for (const item of byQuotationId.values()) {
          const quotationId = typeof item.id === 'number' ? item.id : parseInt(String(item.id), 10);
          if (Number.isNaN(quotationId)) {
            skippedBadQuotationId++;
            this.logger.log(`[findAll] Omitido cotizacion_id inválido: item.id=${item.id}`);
            continue;
          }
          const cotizacionIdStr = String(item.id);
          const exists = await this.existsOpportunityCloserByQuotationId(cotizacionIdStr);
          if (exists) {
            skippedExists++;
            this.logger.log(`[findAll] Ya registrado (solo mostramos): cotizacionId=${item.id}, history=${item.history}`);
            continue;
          }
          // No existe → insertar y asignar
          const oportunidades = await this.opportunityService.getOpportunityByClinicHistory(item.history);
          const opportunityId = oportunidades?.length ? oportunidades[0].id : undefined;
          this.logger.log(`[findAll] Insertando: cotizacionId=${item.id}, asignado a userId=${assignedToUserId}, opportunityId=${opportunityId ?? 'sin oportunidad en CRM'}, name=${item.name}, history=${item.history}`);
          const payload = {
            assignedUserId: assignedToUserId,
            name: item.name,
            status: statesCRM.PENDIENTE,
            hCPatient: item.history,
            ...(opportunityId && { opportunityId }),
            cotizacionId: cotizacionIdStr,
          };
          const create = await this.createOpportunityCloser(payload);
          const url = `${this.URL_FRONT_MANAGER_LEADS}manager_leads/price?uuid-opportunity=${create.id}&cotizacion=${create.cotizacionId}&usuario=${create.assignedUserId}`;
          await this.update(create.id, { status: statesCRM.EN_PROGRESO, url }, assignedToUserId);
          inserted++;
        }
        clientHistories = [...new Set(resultsFromSv.map((r) => r.history).filter((h): h is string => !!h?.trim()))];
        this.logger.log(`[findAll] Sincronización: insertados=${inserted}, ya_existentes=${skippedExists}, omitidos_id_inválido=${skippedBadQuotationId}, historias_cliente=${clientHistories.length}`);
      } catch (err) {
        this.logger.warn(`[findAll] Error al consultar SV o insertar: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    // 2) Construir query: si tenemos historias del cliente (por search), listar todas las cotizaciones de ese cliente; si no, filtro opcional por texto
    const buildQuery = (historiesFromClient: string[]) => {
      const qb = this.opportunitiesClosersRepository
        .createQueryBuilder('op')
        .leftJoin('user', 'u', 'u.id = op.assignedUserId')
        .addSelect('u.userName', 'assigned_user_name')
        .where('op.deleted = :deleted', { deleted: false });
      if (historiesFromClient.length > 0) {
        qb.andWhere('op.hCPatient IN (:...clientHistories)', { clientHistories: historiesFromClient });
      } else if (search?.trim()) {
        qb.andWhere('(op.name ILIKE :search OR op.hCPatient ILIKE :search)', { search: `%${search.trim()}%` });
      }
      return qb;
    };

    const queryForList = buildQuery(clientHistories);
    let total = await queryForList.getCount();
    let entities: OpportunitiesClosers[];
    let raw: any[];

    const effectivePage = total > 0 && (page - 1) * limit >= total ? 1 : page;
    if (effectivePage !== page) {
      this.logger.log(`[findAll] Página ${page} quedaría vacía (total=${total}); se devuelve página ${effectivePage}`);
    }
    const result = await queryForList
      .orderBy('op.createdAt', 'DESC')
      .skip((effectivePage - 1) * limit)
      .take(limit)
      .getRawAndEntities();
    entities = result.entities;
    raw = result.raw;

    const defaultSede = 'Lima';
    const sedeByHistory = new Map<string, string>();
    const uniqueHistories = [...new Set(entities.map((e) => e.hCPatient).filter((h): h is string => !!h?.trim()))];
    if (uniqueHistories.length > 0) {
      let tokenSv: string | undefined;
      try {
        const token = await this.svServices.getTokenSvAdmin();
        tokenSv = token.tokenSv;
      } catch {
        // Sin token no se consulta SV; todas usarán defaultSede
      }
      if (tokenSv) {
        const results = await Promise.allSettled(
          uniqueHistories.map((history) => this.svServices.getSedeByClinicHistory(history, tokenSv)),
        );
        results.forEach((result, i) => {
          const history = uniqueHistories[i];
          const name = result.status === 'fulfilled' ? (result.value?.campusName ?? null) : null;
          if (name) {
            sedeByHistory.set(history, name);
            this.logger.log(`[findAll] Sede por historia: ${history} -> ${name}`);
          } else {
            this.logger.log(`[findAll] Sede por historia: ${history} -> sin dato en SV, se usará default "${defaultSede}"`);
          }
        });
      }
    }

    const opportunities = entities.map((entity, index) => {
      const sedeAtencion = (entity.hCPatient && sedeByHistory.get(entity.hCPatient)) ?? defaultSede;
      return {
        ...entity,
        assignedUserName: raw[index]?.assigned_user_name || null,
        sedeAtencion,
      };
    });

    const totalPages = Math.ceil(total / limit);
    const response = { opportunities, total, page: effectivePage, totalPages };
    this.logger.log(`[findAll] Resultado final: total=${total}, page=${effectivePage}, totalPages=${totalPages}, opportunities.length=${opportunities.length}, ids=${opportunities.slice(0, 5).map((o) => o.id).join(', ')}${opportunities.length > 5 ? '...' : ''}`);
    return response;
  }

  async getOneWithDetails(id: string) {
    const opportunity = await this.opportunitiesClosersRepository.findOne({
      where: { id },
    });

    if (!opportunity) {
      throw new NotFoundException(`Oportunidad cerradora con ID ${id} no encontrada`);
    }
  
      let userAssigned: User | null = null;
      let teams: { team_id: string; team_name: string }[] = [];
  
      if(opportunity.assignedUserId){
        userAssigned = await this.userService.findOne(opportunity.assignedUserId);
        teams = await this.userService.getAllTeamsByUser(userAssigned.id);
      }
  
      const actionHistory = await this.actionHistoryService.getRecordByTargetId(opportunity.id);
  
  
      const files = await this.filesService.findByParentId(opportunity.id);
  
      return { ...opportunity, userAssigned: userAssigned?.userName || null, teams: teams || [], actionHistory: actionHistory || null, files: files || null };
    }

  async getOneWithEntity(id: string): Promise<OpportunitiesClosers> {
    const opportunity = await this.opportunitiesClosersRepository.findOne({
      where: { id },
    });

    if (!opportunity) {
      throw new NotFoundException(`Oportunidad cerradora con ID ${id} no encontrada`);
    }

    return opportunity;
  }

  async update(
    id: string, 
    updateOpCloserDto: UpdateOpCloserDto, 
    userId?: string
  ): Promise<OpportunitiesClosers> {
    const opportunity = await this.getOneWithEntity(id);

    // Actualizar solo los campos que están presentes en el DTO (no undefined)
    Object.keys(updateOpCloserDto).forEach(key => {
      const value = updateOpCloserDto[key as keyof UpdateOpCloserDto];
      if (value !== undefined) {
        // Convertir strings de fecha a Date si es necesario
        if ((key === 'dateStart' || key === 'dateEnd' || key === 'streamUpdatedAt') && typeof value === 'string') {
          (opportunity as any)[key] = new Date(value);
        } else if ((key === 'dateStartDate' || key === 'dateEndDate') && typeof value === 'string') {
          (opportunity as any)[key] = new Date(value);
        } else {
          (opportunity as any)[key] = value;
        }
      }
    });

    // Actualizar timestamp de modificación
    opportunity.modifiedAt = new Date();

    // Actualizar modifiedById si se proporciona userId
    if (userId) {
      opportunity.modifiedById = userId;
    }

    const updatedOpportunity = await this.opportunitiesClosersRepository.save(opportunity);

    return updatedOpportunity;
  }

  /**
   * Asigna la oportunidad cerradora al usuario indicado y actualiza la URL con el nuevo usuario asignado.
   */
  async assignToCurrentUser(opportunityCloserId: string, userId: string): Promise<OpportunitiesClosers> {
    const opportunity = await this.getOneWithEntity(opportunityCloserId);
    const url = `${this.URL_FRONT_MANAGER_LEADS}manager_leads/price?uuid-opportunity=${opportunity.id}&cotizacion=${opportunity.cotizacionId}&usuario=${userId}`;
    return this.update(opportunityCloserId, { assignedUserId: userId, url }, userId);
  }

  async lostOpportunity(opportunityCloserId: string, userId: string, reason: string, subReason: string) {
    await this.update(opportunityCloserId, {
      status: statesCRM.PERDIDO,
      reasonLost: reason,
      subReasonLost: subReason,
      modifiedById: userId,
    }, userId)

    await this.updateQueueAssignmentClosers(opportunityCloserId, {
      status_asignamento: statesCRM.PERDIDO,
    });

    return {message: 'Oportunidad perdida actualizada correctamente'};
  }
  
  async updateQueueAssignmentClosers(opportunityCloserId: string, payload: UpdateQueueOpClosersDto) {

    const { tokenSv } = await this.getTokenByOpCloser(opportunityCloserId);


    if (!tokenSv) {
      throw new NotFoundException(`No se encontró el token SV para la oportunidad cerradora ${opportunityCloserId}`);
    }
    return await this.svServices.updateQueueAssignmentClosers(opportunityCloserId, payload, tokenSv);
  }


  async getTokenByOpCloser(opportunityCloserId: string) {
    const dataOpportunityCloser = await this.getOneWithEntity(opportunityCloserId);
    if (!dataOpportunityCloser) {
      throw new NotFoundException(`Oportunidad cerradora con ID ${opportunityCloserId} no encontrada`);
    }
    const user = await this.userService.findOne(dataOpportunityCloser.assignedUserId!);
    if (!user) {
      throw new NotFoundException(`Usuario con ID ${dataOpportunityCloser.assignedUserId} no encontrado`);
    }
    if (!user.cUsersv || !user.cContraseaSv) {
      throw new NotFoundException(`El usuario ${user.id} no tiene credenciales SV configuradas`);
    }
    const { tokenSv } = await this.svServices.getTokenSv(user.cUsersv, user.cContraseaSv);
    return {
      tokenSv: tokenSv.tokenSv,
      userId: user.id,
      userName: user.userName,
    };
  }

  async detailQuotations(body: DetalleCotizacionDto, opportunityCloserId: string): Promise<OpportunitiesClosers> {
    const { cantidadDePlanes, planes, link, planSeleccionado } = body;

    // Encabezado principal
    let texto = `╔═══════════════════════════════════════════════════════════════╗\n`;
    texto += `║                    DETALLE DE COTIZACIONES                    ║\n`;
    texto += `╚═══════════════════════════════════════════════════════════════╝\n\n`;
    
    texto += `📊 CANTIDAD DE PLANES: ${cantidadDePlanes}\n`;

    planes.forEach((plan, idx) => {
      const planKey = Object.keys(plan)[0];
      const planData = plan[planKey];
      const esSeleccionado = (idx + 1) === planSeleccionado;
      const indicadorSeleccion = esSeleccionado ? '⭐ SELECCIONADO ⭐' : '';
      
      // Separador del plan
      texto += `${'═'.repeat(65)}\n`;
      texto += `📋 PLAN ${idx + 1} ${indicadorSeleccion}\n`;
      texto += `${'═'.repeat(65)}\n`;
      
      // Información del contrato
      texto += `💰 INFORMACIÓN FINANCIERA:\n`;
      texto += `   ├─ Monto de Cotización: $${planData.configuracionDelContrato.montoDeCotizacion?.toLocaleString() || 'N/A'}\n`;
      texto += `   ├─ Descuento: ${planData.configuracionDelContrato.descuento || '0%'}\n`;
      texto += `   └─ Monto del Contrato: $${planData.configuracionDelContrato.montoDelContrato?.toLocaleString() || 'N/A'}\n\n`;
      
      // Información de fechas y pago
      texto += `📅 INFORMACIÓN DEL CONTRATO:\n`;
      texto += `   ├─ Fecha del Contrato: ${planData.configuracionDelContrato.fechaDelContrato || 'No especificada'}\n`;
      texto += `   └─ Método de Pago: ${planData.configuracionDelContrato.metodoDePago || 'No especificado'}\n\n`;
      
      // Detalles financieros
      const detalles = planData.configuracionDelContrato.detallesFinancieros;
      if (detalles) {
        texto += `💳 DETALLES FINANCIEROS:\n`;
        texto += `   ├─ Fecha de Detalle: ${detalles.fechaDeDetalle || 'No especificada'}\n`;
        texto += `   ├─ Cuota de Molde: $${detalles.montoDeCuotaDeMolde?.toLocaleString() || 'N/A'}\n`;
        texto += `   └─ Pagos Únicos: ${detalles.cantidadDePagosUnicos || '0'}\n\n`;
      }
      
      // Beneficios
      const beneficios = planData.configuracionDelContrato.beneficiosDelPlan;
      texto += `🎁 BENEFICIOS DEL PLAN:\n`;
      if (beneficios && beneficios.length > 0) {
        beneficios.forEach((beneficio, index) => {
          const connector = index === beneficios.length - 1 ? '└─' : '├─';
          texto += `   ${connector} ${beneficio}\n`;
        });
      } else {
        texto += `   └─ No se especificaron beneficios\n`;
      }
      texto += `\n`;
      
      // Recomendación
      const esRecomendado = planData.configuracionDelContrato.esRecomendado;
      const iconoRecomendacion = esRecomendado ? '✅' : '❌';
      texto += `${iconoRecomendacion} RECOMENDACIÓN: ${esRecomendado ? 'Plan Recomendado' : 'No Recomendado'}\n\n`;
    });

    // Pie de página
    texto += `${'═'.repeat(65)}\n`;
    texto += `📝 Resumen generado el ${new Date().toLocaleString('es-ES')}\n`;
    texto += `${'═'.repeat(65)}`;

    await this.update(opportunityCloserId, {
      quotationsDetails: texto,
    }, opportunityCloserId);

    return await this.getOneWithEntity(opportunityCloserId);
  }

  async uploadFile(body: {file: string, opportunityId: string}) {
    const { file, opportunityId } = body;
    const opportunity = await this.getOneWithEntity(opportunityId);
    if (!opportunity) {
      throw new NotFoundException(`Oportunidad cerradora con ID ${opportunityId} no encontrada`);
    }

    const buffer = await this.downloadFile(file);
    await this.filesService.createFileRecord(
      opportunityId,
      ENUM_TARGET_TYPE.OPPORTUNITY_CLOSER,
      file.split('/').pop() || 'quotation.pdf',
      buffer
    );

    return opportunity;
  }

  async uploadFacts(contractId: number, opportunityId: string, userId: string) {

    const { tokenSv } = await this.getTokenByOpCloser(opportunityId);
    if (!tokenSv) {
      throw new NotFoundException(`No se encontró el token SV para la oportunidad cerradora ${opportunityId}`);
    }
    const vouchers = await this.svServices.getFactsByContractId(contractId, tokenSv);
    if (!vouchers) {
      throw new NotFoundException(`No se encontraron las facturas del contrato ${contractId}`);
    }

    for (const voucher of vouchers) {
      if(voucher.url_invoice_soles) {
        const buffer = await this.downloadFile(voucher.url_invoice_soles);
        await this.filesService.createFileRecord(
          opportunityId,
          ENUM_TARGET_TYPE.OPPORTUNITY_CLOSER,
          voucher.url_invoice_soles.split('/').pop() || 'factura_soles.pdf',
          buffer
        );
      }

      if(voucher.url_invoice_dolares) {
        const buffer = await this.downloadFile(voucher.url_invoice_dolares);
        await this.filesService.createFileRecord(
          opportunityId,
          ENUM_TARGET_TYPE.OPPORTUNITY_CLOSER,
          voucher.url_invoice_dolares.split('/').pop() || 'factura_dolares.pdf',
          buffer
        );
      }
    }

    const payload: UpdateOpCloserDto = {
      status: statesCRM.GANADO,
      reasonLost: '',
      subReasonLost: ''
    }

    // Actualización final: estado GANADO + facturas
    const response = await this.update(opportunityId, payload, userId)


    await this.userService.updateUserCloserToBusy(userId, false);

    await this.svServices.updateQueueAssignmentClosers(opportunityId, {
      status_asignamento: statesCRM.GANADO,
    }, tokenSv);

    return {message: 'Facturas subidas correctamente', response}
  }

  async downloadFile(fileUrl: string): Promise<Buffer> {
    const source = fileUrl.trim();
    const hasProtocol = /^https?:\/\//i.test(source);

    let downloadUrl = source;

    if (!hasProtocol) {
      if (!this.URL_DOWNLOAD_FILES) {
        throw new HttpException('Variable de entorno URL_DOWNLOAD_FILES no configurada', 500);
      }

      downloadUrl = `${this.URL_DOWNLOAD_FILES.replace(/\/$/, '')}/${source.replace(/^\/+/, '')}`;
    }

    const response = await fetch(downloadUrl);
    if (!response.ok) {
      throw new HttpException(`No se pudo descargar el archivo (${response.status})`, response.status);
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    return buffer;
  }

  async existsOpportunityCloserByQuotationId(quotationId: string) {
    const opportunity = await this.opportunitiesClosersRepository.findOne({
      where: { cotizacionId: quotationId },
    });
    return opportunity ? true : false;
  }

  async getLastOpportunity(){
    const opportunity = await this.opportunitiesClosersRepository.findOne({
      order: {
        createdAt: 'DESC',
      },
    });
    return opportunity;
  }

  async getLastAssignedOpportunity() {
    return await this.opportunitiesClosersRepository.findOne({
      where: {
        assignedUserId: Not(IsNull()),
      },
      order: {
        createdAt: 'DESC',
      },
    });
  }
}
