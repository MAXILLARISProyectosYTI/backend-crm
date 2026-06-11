import { HttpException, Inject, Injectable, Logger, NotFoundException, forwardRef, OnApplicationBootstrap } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull, Not, DataSource, In, Brackets } from 'typeorm';
import { ContractPresave } from 'src/opportunity/contract-presave.entity';
import { parsePresaveHasRegisteredPayments, isCloserTerminalStatus } from '../crm-cerradoras/utils/closer-commission.util';
import { Client } from 'pg';
import { OpportunitiesClosers } from './opportunities-closers.entity';
import { UpdateOpCloserDto, UpdateQueueOpClosersDto } from './dto/update-op-closer.dto';
import { DateTime } from 'luxon';
import { statesCRM, StatesCRM } from './dto/enum-types.enum';
import { SUB_CAMPAIGN_NAMES } from 'src/globals/ids';
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
import {
  getDocusealProductionCutover,
  resolveContractChannel,
  type ContractChannel,
  type ContractTypeFilter,
} from '../crm-cerradoras/utils/contract-channel.util';
import {
  buildPacientesPanelWhere,
  PACIENTE_PANEL_KEY_SQL,
  type PacientesPanelFilters,
} from '../crm-cerradoras/utils/pacientes-panel.query';

@Injectable()
export class OpportunitiesClosersService implements OnApplicationBootstrap {
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
    @InjectRepository(ContractPresave)
    private readonly contractPresaveRepository: Repository<ContractPresave>,
    private readonly svServices: SvServices,
    private readonly userService: UserService,
    private readonly filesService: FilesService,
    private readonly actionHistoryService: ActionHistoryService,
    private readonly idGeneratorService: IdGeneratorService,
    private readonly opportunityService: OpportunityService,
    @Inject(forwardRef(() => OpportunitiesClosersCronsService))
    private readonly opportunitiesClosersCronsService: OpportunitiesClosersCronsService,
    private readonly dataSource: DataSource,
  ) {}

  async onApplicationBootstrap() {
    try {
      this.logger.log('Running sync for manual patient registrations...');
      const missing = await this.dataSource.query(`
        SELECT s.id, s.paciente_nombre, s.clinic_history_id, s.quotation_id, s.cerradora_username, u.id as user_id, s.created_at
        FROM crm_cerradora_solicitudes s
        LEFT JOIN "user" u ON s.cerradora_username = u.user_name
        WHERE NOT EXISTS (
          SELECT 1 FROM c_oportunidad_cerradora op
          WHERE (op.cotizacion_id = CAST(s.quotation_id AS varchar) AND s.quotation_id IS NOT NULL)
             OR (LOWER(op.name) = LOWER(s.paciente_nombre))
        )
      `);

      this.logger.log(`Found ${missing.length} missing opportunity closers from manual registrations.`);
      for (const row of missing) {
        await this.createOpportunityCloser({
          name: row.paciente_nombre,
          status: 'PENDIENTE',
          hCPatient: row.clinic_history_id ? String(row.clinic_history_id) : undefined,
          cotizacionId: row.quotation_id ? String(row.quotation_id) : undefined,
          assignedUserId: row.user_id || undefined,
          createdAt: row.created_at ? new Date(row.created_at) : new Date(),
        });
      }
      this.logger.log('Manual patient registration sync completed.');
    } catch (err) {
      this.logger.error(`Error during manual registration sync: ${err.message}`, err.stack);
    }
  }

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
    dateFrom?: string,
    dateTo?: string,
    todayOnly?: boolean,
    filterAssignedUserId?: string,
    options?: { forPacientesPanel?: boolean; contractType?: ContractTypeFilter; ids?: string[] },
  ): Promise<{ opportunities: (OpportunitiesClosers & { assignedUserName?: string; sedeAtencion?: string | null; tipoTratamiento?: string | null; fechaCotizacion?: string | null; fechaEvaluacion?: Date | string | null; isPresaved?: boolean; hasContractPresave?: boolean; hasRegisteredPayment?: boolean; fechaLimiteCierre?: Date | null; firmaContrato?: 'pendiente' | 'firmado' | 'rechazado'; facturado?: boolean; solicitudesPendientes?: number; ultimaSolicitudId?: number | null; tipoContrato?: string | null; fechaContrato?: Date | null; monto?: number | null; hasDigitalContract?: boolean; contractChannel?: ContractChannel; comisionDemoraAprobada?: boolean })[], total: number, page: number, totalPages: number }> {
    const forPacientesPanel = options?.forPacientesPanel === true;
    const contractType = options?.contractType ?? 'todos';
    const effectiveLimit = forPacientesPanel ? Math.min(limit, 5000) : limit;
    const docusealCutover = getDocusealProductionCutover();

    const buildQuery = () => {
      const qb = this.opportunitiesClosersRepository
        .createQueryBuilder('op')
        .leftJoin('user', 'u', 'u.id = op.assignedUserId')
        .addSelect('u.userName', 'assigned_user_name')
        .addSelect('op.has_digital_contract', 'has_digital_contract')
        .where('op.deleted = :deleted', { deleted: false });
      qb
        .leftJoin('opportunity', 'opp', 'opp.id = op.opportunity_id')
        .addSelect('opp.is_presaved', 'is_presaved');
      if (!forPacientesPanel) {
        qb
          .addSelect('opp.c_sub_campaign_id', 'c_sub_campaign_id')
          .addSelect('opp.c_fecha_de_reservacion', 'c_fecha_de_reservacion');
      }
      if (options?.ids?.length) {
        qb.andWhere('op.id IN (:...panelIds)', { panelIds: options.ids });
      }
      if (filterAssignedUserId) {
        qb.andWhere('op.assignedUserId = :filterAssignedUserId', { filterAssignedUserId });
      }
      // Mis Pacientes: el contrato suele venir de SV (historia clínica), no de contractId en CRM.
      // Ahí el filtro físico/digital se aplica después de enriquecer (contractChannel).
      if (!forPacientesPanel && contractType !== 'todos') {
        const hasContractSql =
          "(op.contractId IS NOT NULL AND op.contractId <> '')";
        if (contractType === 'digital') {
          qb.andWhere(hasContractSql);
          qb.andWhere('op.createdAt >= :docusealCutover', { docusealCutover });
        } else if (contractType === 'fisico') {
          qb.andWhere(hasContractSql);
          qb.andWhere('op.createdAt < :docusealCutover', { docusealCutover });
        }
      }
      if (search?.trim()) {
        const words = search.trim().split(/\s+/).filter(Boolean);
        words.forEach((word, idx) => {
          const paramStart = `wordStart${idx}`;
          const paramSpace = `wordSpace${idx}`;
          // Quitar tildes del término buscado
          const normalizedWord = word.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
          // Coincidir solo si la palabra está al inicio del nombre o después de un espacio
          qb.andWhere(
            `(op.name ILIKE :${paramStart} OR op.name ILIKE :${paramSpace} OR op.hCPatient ILIKE :${paramStart} OR op.hCPatient ILIKE :${paramSpace})`,
            {
              [paramStart]: `${normalizedWord}%`,
              [paramSpace]: `% ${normalizedWord}%`,
            },
          );
        });
      }
      // Filtro "Hoy": cierre ganado marcado hoy (inicia plazo 24 h) o cuyo plazo vence hoy
      if (todayOnly) {
        const todayStart = DateTime.now().setZone('America/Lima').startOf('day').toJSDate();
        const todayEnd = DateTime.now().setZone('America/Lima').endOf('day').toJSDate();
        qb.andWhere('LOWER(TRIM(op.status)) IN (:...winStatuses)', {
          winStatuses: ['ganado', 'cierre ganado', 'win'],
        });
        qb.andWhere('op.dateEnd IS NOT NULL');
        qb.andWhere(
          new Brackets((sub) => {
            sub
              .where('op.dateEnd BETWEEN :todayStart AND :todayEnd', { todayStart, todayEnd })
              .orWhere("(op.dateEnd + INTERVAL '24 hours') BETWEEN :todayStart AND :todayEnd", {
                todayStart,
                todayEnd,
              });
          }),
        );
      } else {
        if (dateFrom) {
          qb.andWhere('op.createdAt >= :dateFrom', { dateFrom: new Date(`${dateFrom}T00:00:00`) });
        }
        if (dateTo) {
          qb.andWhere('op.createdAt <= :dateTo', { dateTo: new Date(`${dateTo}T23:59:59`) });
        }
      }
      return qb;
    };

    let total = await buildQuery().getCount();
    let entities: OpportunitiesClosers[];
    let raw: any[];

    if (search?.trim() && total === 0 && assignedToUserId) {
      try {
        this.logger.log(`[findAll] Info que llega: search="${search?.trim()}", page=${page}, limit=${limit}, assignedToUserId=${assignedToUserId}`);
        const token = await this.svServices.getTokenSvAdmin();
        const resultsFromSv = await this.svServices.getQuotationSearch(token.tokenSv, search.trim());
        this.logger.log(`[findAll] Respuesta SV (raw): cantidad=${resultsFromSv.length}, items=${JSON.stringify(resultsFromSv.map((r) => ({ id: r.id, name: r.name, history: r.history })))}`);
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
          const exists = await this.existsOpportunityCloserByQuotationId(String(item.id));
          if (exists) {
            skippedExists++;
            this.logger.log(`[findAll] Omitido (ya en cola): cotizacionId=${item.id}, history=${item.history}`);
            continue;
          }
          const oportunidades = await this.opportunityService.getOpportunityByClinicHistory(item.history);
          const opportunityId = oportunidades?.length ? oportunidades[0].id : undefined;
          this.logger.log(`[findAll] Asignación: cotizacionId=${item.id}, asignado a userId=${assignedToUserId}, opportunityId=${opportunityId ?? 'sin oportunidad en CRM'}, name=${item.name}, history=${item.history}`);
          const payload = {
            assignedUserId: assignedToUserId,
            name: item.name,
            status: statesCRM.PENDIENTE,
            hCPatient: item.history,
            ...(opportunityId && { opportunityId }),
            cotizacionId: String(quotationId),
          };
          this.logger.log(`[findAll] Guardado (payload): ${JSON.stringify(payload)}`);
          const create = await this.createOpportunityCloser(payload);
          this.logger.log(`[findAll] Guardado (resultado create): id=${create.id}, cotizacionId=${create.cotizacionId}, assignedUserId=${create.assignedUserId}`);
          const url = `${this.URL_FRONT_MANAGER_LEADS}manager_leads/price?uuid-opportunity=${create.id}&cotizacion=${create.cotizacionId}&usuario=${create.assignedUserId}`;
          await this.update(create.id, { status: statesCRM.EN_PROGRESO, url }, assignedToUserId);
          inserted++;
        }
        total = await buildQuery().getCount();
        this.logger.log(`[findAll] Resumen: insertados=${inserted}, omitidos_ya_en_cola=${skippedExists}, omitidos_cotizacion_id_inválido=${skippedBadQuotationId}, total después de insertar: ${total}`);
      } catch (err) {
        this.logger.warn(`[findAll] Error al obtener SV o insertar: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    const effectivePage = total > 0 && (page - 1) * effectiveLimit >= total ? 1 : page;
    if (effectivePage !== page) {
      this.logger.log(`[findAll] Página ${page} quedaría vacía (total=${total}); se devuelve página 1 para mostrar los registros insertados`);
    }
    const queryBuilder = buildQuery();
    const result = await queryBuilder
      .orderBy('op.createdAt', 'DESC')
      .skip((effectivePage - 1) * effectiveLimit)
      .take(effectiveLimit)
      .getRawAndEntities();
    entities = result.entities;
    raw = result.raw;

    const defaultSede = 'Lima';
    const sedeByHistory = new Map<string, string>();
    const uniqueHistories = [...new Set(entities.map((e) => e.hCPatient).filter((h): h is string => !!h?.trim()))];

    // Lookup batch: sede (SV) + subcampaña/tratamiento por historia clínica (CRM) + tratamiento por cotización (SV)
    let subCampaignByHistory = new Map<string, string>();
    let treatmentByCotizacion: Record<number, { tipo: 'OI' | 'OFM' | 'APNEA'; fecha: string | null }> = {};

    let tokenSv: string | undefined;
    try {
      const token = await this.svServices.getTokenSvAdmin();
      tokenSv = token.tokenSv;
    } catch {
      // Sin token no se consulta SV
    }

    if (uniqueHistories.length > 0 && !forPacientesPanel) {
      // Buscar tratamiento en CRM (fallback 1: por oportunidad vinculada)
      try {
        subCampaignByHistory = await this.opportunityService.getSubCampaignIdsByClinicHistories(uniqueHistories);
      } catch (err) {
        this.logger.warn(`[findAll] Error subcampañas por historia: ${err instanceof Error ? err.message : String(err)}`);
      }

      if (tokenSv) {
        // Sede en SV (una llamada por historia — ya existía)
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
            this.logger.log(`[findAll] Sede por historia: ${history} -> sin dato en SV, default "${defaultSede}"`);
          }
        });
      }
    }

    // Fallback 2 (definitivo): consultar SV por cotizacionId para todos los registros con cotizacionId
    // (para obtener tipo de tratamiento Y fecha de cotización)
    if (tokenSv && !forPacientesPanel) {
      const quotationIds = entities
        .filter((e) => !!e.cotizacionId)
        .map((e) => Number(e.cotizacionId))
        .filter((id) => !isNaN(id));

      if (quotationIds.length > 0) {
        try {
          treatmentByCotizacion = await this.svServices.getTreatmentTypesByQuotationIds(tokenSv, quotationIds);
          this.logger.log(`[findAll] Tratamientos por cotización SV: ${Object.keys(treatmentByCotizacion).length} resultados para ${quotationIds.length} cotizaciones`);
        } catch (err) {
          this.logger.warn(`[findAll] Error tratamientos por cotización: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    }

    // --- QUERY SOLICITUDES & SV CONTRACT STATE FOR THE OPPORTUNITIES ON THE PAGE ---
    let solicitudes: any[] = [];
    let svContracts: any[] = [];

    if (entities.length > 0) {
      const quotationIds = entities.map(e => Number(e.cotizacionId)).filter(id => id && !isNaN(id));
      const patientNames = entities.map(e => e.name).filter(Boolean);
      const contractIds = entities.map(e => e.contractId).filter(id => id && /^\d+$/.test(id)).map(Number);
      const histories = entities.map(e => e.hCPatient).filter(Boolean);

      // Query crm_cerradora_solicitudes
      if (quotationIds.length > 0 || patientNames.length > 0) {
        try {
          solicitudes = await this.dataSource.query(`
            SELECT id, quotation_id as "quotationId", paciente_nombre as "pacienteNombre", clinic_history_id as "clinicHistoryId", firma_contrato as "firmaContrato", facturado, estado, monto, tipo_contrato as "tipoContrato", fecha_contrato as "fechaContrato", created_at as "createdAt"
            FROM crm_cerradora_solicitudes
            WHERE quotation_id = ANY($1::int[]) OR paciente_nombre = ANY($2::varchar[])
            ORDER BY id DESC
          `, [
            quotationIds.length > 0 ? quotationIds : [-1],
            patientNames.length > 0 ? patientNames : ['']
          ]);
        } catch (err) {
          this.logger.error(`Error querying crm_cerradora_solicitudes: ${err.message}`, err.stack);
        }
      }

      // Query SV contracts
      if (contractIds.length > 0 || histories.length > 0) {
        const svClient = new Client({
          host: process.env.SV_DB_HOST || '161.132.211.235',
          port: parseInt(process.env.SV_DB_PORT || '5501', 10),
          user: process.env.SV_DB_USERNAME || 'desarrollador_dev_maxillaris',
          database: process.env.SV_DB_DATABASE || 'sv_dev',
          password: process.env.SV_DB_PASSWORD || 'hq75TCdbiJzhfr7lXt3w',
        });

        try {
          await svClient.connect();
          const svRes = await svClient.query(`
            SELECT c.id as contract_id, c.idquotation as quotation_id, ch.history as clinic_history, c.signature, c.signaturefinger, c.amount, c.num, c.date
            FROM contract c
            INNER JOIN clinic_history ch ON c.idclinichistory = ch.id
            WHERE (c.id = ANY($1::int[]) OR ch.history = ANY($2::varchar[])) AND c.state = 1
          `, [
            contractIds.length > 0 ? contractIds : [-1],
            histories.length > 0 ? histories : ['']
          ]);
          svContracts = svRes.rows;
        } catch (err) {
          this.logger.error(`Error querying SV contracts: ${err.message}`, err.stack);
        } finally {
          try {
            await svClient.end();
          } catch {
            // ignore
          }
        }
      }
    }

    const svContractsById = new Map<number, any>();
    const svContractsByHistory = new Map<string, any>();
    for (const row of svContracts) {
      if (row.contract_id) svContractsById.set(row.contract_id, row);
      if (row.clinic_history) svContractsByHistory.set(row.clinic_history, row);
    }

    const presaveByQuotationId = new Map<
      number,
      { hasPresave: boolean; hasRegisteredPayment: boolean }
    >();
    const pageQuotationIds = [
      ...new Set(
        entities
          .map((e) => Number(e.cotizacionId))
          .filter((id) => id && !isNaN(id)),
      ),
    ];
    if (pageQuotationIds.length > 0) {
      const presaves = await this.contractPresaveRepository.find({
        where: { quotationId: In(pageQuotationIds) },
        select: ['quotationId', 'registeredPayments'],
      });
      for (const p of presaves) {
        presaveByQuotationId.set(p.quotationId, {
          hasPresave: true,
          hasRegisteredPayment: parsePresaveHasRegisteredPayments(
            p.registeredPayments,
          ),
        });
      }
    }

    let opportunities = entities.map((entity, index) => {
      const sedeAtencion = (entity.hCPatient && sedeByHistory.get(entity.hCPatient)) ?? defaultSede;

      // Fecha de cotización desde SV (siempre disponible si hay cotizacionId)
      let fechaCotizacion: string | null = null;
      if (entity.cotizacionId) {
        const svData = treatmentByCotizacion[Number(entity.cotizacionId)];
        if (svData?.fecha) fechaCotizacion = svData.fecha;
      }

      // Prioridad 1: tipo de tratamiento desde SV por cotizacionId (más específico y exacto)
      let tipoTratamiento: string | null = null;
      if (entity.cotizacionId) {
        const svData = treatmentByCotizacion[Number(entity.cotizacionId)];
        if (svData?.tipo) tipoTratamiento = svData.tipo;
      }

      // Prioridad 2: JOIN directo por opportunityId (c_sub_campaign_id del JOIN)
      const rawSubCampaignId: string | null = raw[index]?.c_sub_campaign_id ?? null;
      if (!tipoTratamiento) {
        tipoTratamiento = rawSubCampaignId ? (SUB_CAMPAIGN_NAMES[rawSubCampaignId] ?? null) : null;
      }

      // Prioridad 3: oportunidad CRM por historia clínica
      if (!tipoTratamiento && entity.hCPatient && subCampaignByHistory.has(entity.hCPatient)) {
        const id = subCampaignByHistory.get(entity.hCPatient)!;
        tipoTratamiento = SUB_CAMPAIGN_NAMES[id] ?? null;
      }

      let fechaLimiteCierre: Date | null = null;
      if (entity.dateEnd && (entity.status?.toLowerCase() === 'ganado' || entity.status?.toLowerCase() === 'cierre ganado' || entity.status?.toLowerCase() === 'win')) {
        const d = new Date(entity.dateEnd);
        d.setHours(d.getHours() + 24);
        fechaLimiteCierre = d;
      }

      // --- CALCULATE SIGNATURE AND BILLING STATUS ---
      let isSigned = false;
      let contractId = entity.contractId;
      let amount: number | null = null;
      let tipoContrato: string | null = null;
      let fechaContrato: Date | null = null;

      // Find SV contract details
      let svContract: any = null;
      if (entity.hCPatient && svContractsByHistory.has(entity.hCPatient)) {
        svContract = svContractsByHistory.get(entity.hCPatient);
      } else if (entity.contractId && /^\d+$/.test(entity.contractId)) {
        const cId = parseInt(entity.contractId, 10);
        if (svContractsById.has(cId)) {
          svContract = svContractsById.get(cId);
        }
      }

      if (svContract) {
        contractId = svContract.contract_id ? String(svContract.contract_id) : contractId;
        isSigned = (svContract.signature && svContract.signature.trim() !== '') ||
                   (svContract.signaturefinger && svContract.signaturefinger.trim() !== '');
        amount = svContract.amount ? Number(svContract.amount) : null;
        tipoContrato = svContract.num || null;
        fechaContrato = svContract.date ? new Date(svContract.date) : null;
      } else if (entity.contractId && /^\d+$/.test(entity.contractId)) {
        const cId = parseInt(entity.contractId, 10);
        const matched = svContractsById.get(cId);
        if (matched) {
          isSigned = (matched.signature && matched.signature.trim() !== '') ||
                     (matched.signaturefinger && matched.signaturefinger.trim() !== '');
        }
      }

      let firmaContrato: 'pendiente' | 'firmado' | 'rechazado' = isSigned ? 'firmado' : 'pendiente';
      let facturado: boolean = (entity.facturaId || svContract) ? true : false;
      let solicitudesPendientes = 0;
      let ultimaSolicitudId: number | null = null;

      // Filter and process solicitudes for this opportunity
      const cotNum = entity.cotizacionId ? Number(entity.cotizacionId) : null;
      const patientNameNormalized = (entity.name || '').toLowerCase().trim();

      const matchedSolicitudes = solicitudes.filter(s => {
        if (cotNum && s.quotationId === cotNum) return true;
        if (patientNameNormalized && (s.pacienteNombre || '').toLowerCase().trim() === patientNameNormalized) return true;
        return false;
      });

      // Sort matched solicitudes by id ascending to apply oldest to newest, so the newest overrides the values
      matchedSolicitudes.sort((a, b) => a.id - b.id);

      for (const s of matchedSolicitudes) {
        firmaContrato = s.firmaContrato ?? firmaContrato;
        facturado = s.facturado ?? facturado;
        amount = s.monto ? Number(s.monto) : amount;
        tipoContrato = s.tipoContrato ?? tipoContrato;
        fechaContrato = s.fechaContrato ? new Date(s.fechaContrato) : fechaContrato;
        if (s.estado === 'pendiente') {
          solicitudesPendientes += 1;
        }
        if (!ultimaSolicitudId || s.id > ultimaSolicitudId) {
          ultimaSolicitudId = s.id;
        }
      }

      const hasDigitalFlag =
        entity.hasDigitalContract === true ||
        raw[index]?.has_digital_contract === true ||
        raw[index]?.has_digital_contract === 1;
      const { channel, hasDigitalContract } = resolveContractChannel({
        createdAt: entity.createdAt,
        contractDate: fechaContrato,
        hasDigitalContractFlag: hasDigitalFlag,
        contractId: contractId ?? entity.contractId,
        hasSvContract: !!svContract,
      });

      const cotIdNum = entity.cotizacionId ? Number(entity.cotizacionId) : NaN;
      const presaveMeta =
        !isNaN(cotIdNum) && presaveByQuotationId.has(cotIdNum)
          ? presaveByQuotationId.get(cotIdNum)!
          : { hasPresave: false, hasRegisteredPayment: false };

      return {
        ...entity,
        contractId: contractId ?? entity.contractId,
        assignedUserName: raw[index]?.assigned_user_name || null,
        sedeAtencion,
        tipoTratamiento,
        fechaCotizacion,
        fechaEvaluacion: raw[index]?.c_fecha_de_reservacion || null,
        isPresaved: raw[index]?.is_presaved === true || raw[index]?.is_presaved === 1 || false,
        hasContractPresave: presaveMeta.hasPresave,
        hasRegisteredPayment: presaveMeta.hasRegisteredPayment,
        fechaLimiteCierre,
        firmaContrato,
        facturado,
        solicitudesPendientes,
        ultimaSolicitudId,
        monto: amount,
        tipoContrato,
        fechaContrato,
        hasDigitalContract,
        contractChannel: channel,
        comisionDemoraAprobada: entity.comisionDemoraAprobada === true,
      };
    });

    if (contractType !== 'todos') {
      opportunities = opportunities.filter((o) => o.contractChannel === contractType);
      total = opportunities.length;
    }

    const totalPages = Math.max(1, Math.ceil(total / effectiveLimit));
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
  
      let fechaEvaluacion: Date | null = null;
      if (opportunity.opportunityId) {
        try {
          const opp = await this.opportunityService.findOne(opportunity.opportunityId);
          if (opp && opp.cFechaDeReservacion) {
            fechaEvaluacion = opp.cFechaDeReservacion;
          }
        } catch (err) {
          this.logger.warn(`Error al recuperar fecha de evaluación para la oportunidad ${opportunity.opportunityId}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }

      return { ...opportunity, userAssigned: userAssigned?.userName || null, teams: teams || [], actionHistory: actionHistory || null, files: files || null, fechaEvaluacion };
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
    const oldStatus = opportunity.status;
    const newStatus = updateOpCloserDto.status;
    const isCurrentlyTerminal = isCloserTerminalStatus(oldStatus);
    const willBeTerminal =
      newStatus !== undefined ? isCloserTerminalStatus(newStatus) : isCurrentlyTerminal;

    if (newStatus !== undefined && newStatus !== oldStatus) {
      // 1. Audit log
      const statusLabels: Record<string, string> = {
        [statesCRM.PENDIENTE]: 'Pendiente',
        [statesCRM.EN_PROGRESO]: 'En progreso',
        [statesCRM.GANADO]: 'Cierre ganado',
        [statesCRM.PERDIDO]: 'Cierre perdido',
      };
      const oldLabel = statusLabels[oldStatus || ''] || oldStatus || 'Desconocido';
      const newLabel = statusLabels[newStatus] || newStatus;
      
      try {
        await this.actionHistoryService.addRecord({
          targetId: id,
          target_type: ENUM_TARGET_TYPE.OPPORTUNITY_CLOSER,
          userId: userId || opportunity.assignedUserId || 'system',
          message: `Estado cambiado de "${oldLabel}" a "${newLabel}"`,
        });
      } catch (err) {
        this.logger.warn(`Error al registrar en ActionHistory: ${err instanceof Error ? err.message : String(err)}`);
      }

      // 2. Clear reasonLost/subReasonLost if leaving lost state
      if (newStatus !== statesCRM.PERDIDO) {
        opportunity.reasonLost = '';
        opportunity.subReasonLost = '';
      }

      // 3. Update SV queue
      try {
        await this.updateQueueAssignmentClosers(id, {
          status_asignamento: newStatus as StatesCRM,
        });
      } catch (err) {
        this.logger.warn(`Error al actualizar cola SV: ${err instanceof Error ? err.message : String(err)}`);
      }

      // 4. Establecer fecha de cierre al pasar a estado ganado
      if (newStatus === statesCRM.GANADO && oldStatus !== statesCRM.GANADO) {
        opportunity.dateEnd = new Date();
        opportunity.dateEndDate = new Date();
        this.logger.log(`[update] Oportunidad ${id} cambia a ganado. Se establece dateEnd al momento de la acción.`);
      }

      // 5. Fijar usuario asignado al cerrar (ganado o perdido) para comisiones
      if (
        (newStatus === statesCRM.GANADO || newStatus === statesCRM.PERDIDO) &&
        userId
      ) {
        opportunity.assignedUserId = userId;
        this.logger.log(
          `[update] Oportunidad ${id} cierre ${newStatus}: assignedUserId fijado a ${userId}`,
        );
      }
    }

    // Actualizar solo los campos que están presentes en el DTO (no undefined)
    Object.keys(updateOpCloserDto).forEach(key => {
      if (key === 'assignedUserId' && (isCurrentlyTerminal || willBeTerminal)) {
        return;
      }
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

  /** Totales reales para Mis Pacientes (pacientes únicos vs filas de cotización). */
  async getPacientesPanelStats(
    filters: PacientesPanelFilters,
  ): Promise<{ totalPacientes: number; totalOportunidades: number }> {
    const { whereSql, params } = buildPacientesPanelWhere(filters);
    const [row] = await this.dataSource.query(
      `
      SELECT
        COUNT(DISTINCT ${PACIENTE_PANEL_KEY_SQL})::int AS pacientes,
        COUNT(*)::int AS oportunidades
      FROM c_oportunidad_cerradora op
      LEFT JOIN opportunity opp ON opp.id = op.opportunity_id
      WHERE ${whereSql}
      `,
      params,
    );
    return {
      totalPacientes: Number(row?.pacientes ?? 0),
      totalOportunidades: Number(row?.oportunidades ?? 0),
    };
  }

  /** Una oportunidad representativa por paciente (misma regla que dedupe en memoria). */
  async getPacientesPanelRepresentativeIds(
    filters: PacientesPanelFilters,
    page: number,
    limit: number,
  ): Promise<string[]> {
    const { whereSql, params } = buildPacientesPanelWhere(filters);
    const limitIdx = params.length + 1;
    const offsetIdx = params.length + 2;
    const rows = await this.dataSource.query(
      `
      SELECT sub.id
      FROM (
        SELECT DISTINCT ON (${PACIENTE_PANEL_KEY_SQL})
          op.id,
          op.created_at
        FROM c_oportunidad_cerradora op
        LEFT JOIN opportunity opp ON opp.id = op.opportunity_id
        WHERE ${whereSql}
        ORDER BY ${PACIENTE_PANEL_KEY_SQL},
          (CASE WHEN COALESCE(opp.is_presaved, false) OR NULLIF(TRIM(op.factura_id), '') IS NOT NULL THEN 0 ELSE 1 END),
          (CASE WHEN COALESCE(op.comision_demora_aprobada, false) THEN 0 ELSE 1 END),
          op.created_at DESC
      ) sub
      ORDER BY sub.created_at DESC
      LIMIT $${limitIdx} OFFSET $${offsetIdx}
      `,
      [...params, limit, (page - 1) * limit],
    );
    return rows.map((r: { id: string }) => r.id);
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

  async assignToCurrentUser(id: string, userId: string): Promise<OpportunitiesClosers> {
    const opportunity = await this.getOneWithEntity(id);

    if (isCloserTerminalStatus(opportunity.status)) {
      this.logger.log(
        `[assignToCurrentUser] Oportunidad ${id} en estado terminal (${opportunity.status}); assignedUserId no se modifica.`,
      );
      return opportunity;
    }

    opportunity.assignedUserId = userId;
    opportunity.modifiedById = userId;
    opportunity.modifiedAt = new Date();

    if (opportunity.cotizacionId) {
      opportunity.url = `${this.URL_FRONT_MANAGER_LEADS}manager_leads/price?uuid-opportunity=${opportunity.id}&cotizacion=${opportunity.cotizacionId}&usuario=${userId}`;
    }

    return await this.opportunitiesClosersRepository.save(opportunity);
  }
}
