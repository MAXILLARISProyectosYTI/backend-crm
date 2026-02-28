import { Injectable, NotFoundException, Inject, forwardRef, BadRequestException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, IsNull, Like, MoreThanOrEqual, Not, Repository } from 'typeorm';
import { Opportunity } from './opportunity.entity';
import { OpportunityServiceOrder } from './opportunity-service-order.entity';
import { FacturacionSubEstado } from './opportunity-service-order.entity';
import { CreateOpportunityDto, DEFAULT_COMPANY } from './dto/create-opportunity.dto';
import { ReprogramingReservationDto, UpdateOpportunityDto, UpdateOpportunityProcces } from './dto/update-opportunity.dto';
import { OpportunityWebSocketService } from './opportunity-websocket.service';
import { ContactService } from 'src/contact/contact.service';
import { CreateContactDto } from 'src/contact/dto/create-contact.dto';
import { timeToAssing } from './utils/timeToAssing'; 
import { OpportunityWithUser } from './dto/opportunity-with-user';
import { User } from 'src/user/user.entity';
import { UserService } from 'src/user/user.service';
import { Enum_Following, Enum_Stage } from './dto/enums';
import { Contact } from 'src/contact/contact.entity';
import { CAMPAIGNS_IDS, ROLES_IDS, TEAMS_IDS } from 'src/globals/ids';
import { CreateClinicHistoryCrmDto } from './dto/clinic-history';
import { MeetingService } from 'src/meeting/meeting.service';
import { SvServices } from 'src/sv-services/sv.services';
import { IdGeneratorService } from 'src/common/services/id-generator.service';
import { ActionHistoryService } from 'src/action-history/action-history.service';
import { UserWithTeam } from 'src/user/dto/user-with-team';
import { hasFields, pickFields } from './utils/hasFields';
import { Meeting } from 'src/meeting/meeting.entity';
import { FilesService } from 'src/files/files.service';
import { UpdateMeetingDto } from 'src/meeting/dto/update.dto';
import { ENUM_TARGET_TYPE } from 'src/action-history/dto/enum-target-type';
import { EnumCodeFlow } from './dto/enumCodeManage';
import { CampaignService } from 'src/campaign/campaign.service';
import {
  PatientIsNewCrmResponse,
  PatientIsNewResponseCode,
} from 'src/sv-services/patient-is-new.types';
import { CreateOpportunityResponse } from './dto/create-opportunity-response.dto';
import { AssignmentQueueStateService } from '../assignment-queue-state/assignment-queue-state.service';
import { CampusItem } from 'src/sv-services/campus.types';

@Injectable()
export class OpportunityService {

  private readonly URL_FRONT_MANAGER_LEADS = process.env.URL_FRONT_MANAGER_LEADS;
  private readonly URL_FILES = process.env.URL_DOWNLOAD_FILES;
  
  constructor(
    @InjectRepository(Opportunity)
    private readonly opportunityRepository: Repository<Opportunity>,
    @InjectRepository(OpportunityServiceOrder)
    private readonly opportunityServiceOrderRepository: Repository<OpportunityServiceOrder>,
    private readonly websocketService: OpportunityWebSocketService,
    private readonly contactService: ContactService,
    @Inject(forwardRef(() => UserService))
    private readonly userService: UserService,
    private readonly meetingService: MeetingService,
    private readonly svServices: SvServices,
    private readonly idGeneratorService: IdGeneratorService,
    private readonly actionHistoryService: ActionHistoryService,
    private readonly filesService: FilesService,
    private readonly campaignService: CampaignService,
    private readonly assignmentQueueStateService: AssignmentQueueStateService,
  ) {}

  /** Códigos que permiten crear oportunidad como paciente nuevo (sin datos previos en SV) */
  private static readonly CODES_PACIENTE_NUEVO: PatientIsNewResponseCode[] = [
    'PACIENTE_NUEVO',
    'PACIENTE_ELIMINADO_SIN_DATOS',
  ];

  /** Códigos que indican paciente existente: se puede crear oportunidad solo si no está asignado */
  private static readonly CODES_PACIENTE_EXISTENTE: PatientIsNewResponseCode[] = [
    'PACIENTE_EXISTE_COMPLETO',
    'PACIENTE_EXISTE_SOLO_RESERVA',
    'PACIENTE_EXISTE_SOLO_PAGO',
    'PACIENTE_EXISTE_MAS_6_MESES',
    'PACIENTE_EXISTE_MENOS_6_MESES',
  ];

  /**
   * Crea una nueva oportunidad (registro de lead).
   * Flujo: validar teléfono → consultar paciente en SV → validar sede/empresa → crear contacto → asignar por cola (por sede) → crear oportunidad → enlazar con SV si aplica.
   */
  async create(createOpportunityDto: CreateOpportunityDto, userId: string): Promise<CreateOpportunityResponse> {
    let contact: Contact | null = null;

    try {
      // —— 1. Validar que no exista ya una oportunidad con el mismo teléfono ——
      const existingByPhone = await this.findOneByPhoneNumber(createOpportunityDto.phoneNumber);
      if (existingByPhone) {
        const assignedUser = existingByPhone.assignedUserId;
        const assignedName = assignedUser?.userName ?? ([assignedUser?.firstName, assignedUser?.lastName].filter(Boolean).join(' ').trim() || 'Sin asignar');
        return {
          status: 'error',
          code: 'TELEFONO_YA_REGISTRADO',
          message: `Ya existe una oportunidad con este número de teléfono. Asignada a: ${assignedName}`,
          data: {},
        };
      }

      // —— 2. Token SV y consultar si el paciente es nuevo o existente en el sistema vertical ——
      const user = await this.userService.findOne(userId);
      const { tokenSv } = await this.svServices.getTokenSv(user.cUsersv!, user.cContraseaSv!);
      const dataSv: PatientIsNewCrmResponse = await this.svServices.getPatientIsNew(
        createOpportunityDto.phoneNumber,
        tokenSv,
      );

      if (dataSv.status === 'error' || dataSv.code === 'ERROR') {
        return {
          status: 'error',
          code: dataSv.code,
          message: dataSv.message,
          data: dataSv.data,
        };
      }

      // —— 3. Determinar si podemos crear: paciente nuevo, eliminado sin datos, o existente (no asignado) ——
      const { code, data: svData } = dataSv;
      const isPacienteNuevo = OpportunityService.CODES_PACIENTE_NUEVO.includes(code);
      const isPacienteExistente = OpportunityService.CODES_PACIENTE_EXISTENTE.includes(code);

      if (isPacienteExistente && svData.is_assigned) {
        return {
          status: 'error',
          code: 'PACIENTE_YA_ASIGNADO',
          message: 'El paciente ya está asignado a otro ejecutivo',
          data: svData,
        };
      }

      if (!isPacienteNuevo && !isPacienteExistente) {
        return {
          status: 'error',
          code: dataSv.code,
          message: dataSv.message ?? 'No se puede crear la oportunidad',
          data: svData,
        };
      }

      // —— 4. Validar sede (campus) y empresa: obtener lista de SV, validar que existan y coincidan ——
      // Form Data envía todos los valores como string; normalizar a number para comparar con la respuesta de SV
      let campusId: number | undefined = Number(createOpportunityDto.campusId);
      if (Number.isNaN(campusId)) campusId = undefined;
      const metadata: { campusId?: number; campusName?: string; companyId?: number; companyCode?: string; companyName?: string } = {};

      const campuses = await this.svServices.getCampuses(tokenSv);
      let campus: CampusItem | undefined = campuses.find((c: CampusItem) => c.id === campusId);
      if (campusId != null && campusId !== 0 && !campus) {
        return {
          status: 'error',
          code: 'CAMPUS_INVALIDO',
          message: 'La sede (campus) indicada no existe',
          data: {},
        };
      }

      // Si no se envió empresa: por defecto la de menor id del campus (ej. Arequipa → LATAM; Lima → Maxillaris)
      let company = createOpportunityDto.company;
      if (campus?.companies?.length) {
        if (!company) {
          const sorted = [...campus.companies].sort((a, b) => a.id - b.id);
          company = { id: sorted[0].id, code: sorted[0].code, name: sorted[0].name };
        } else {
          const companyInCampus = campus.companies.find((co) => co.id === company!.id);
          if (!companyInCampus) {
            return {
              status: 'error',
              code: 'EMPRESA_NO_PERTENECE_A_SEDE',
              message: 'La empresa indicada no pertenece a la sede seleccionada',
              data: {},
            };
          }
          company = { id: companyInCampus.id, code: companyInCampus.code, name: companyInCampus.name };
        }
      } else if (!company) {
        company = DEFAULT_COMPANY;
      }

      if (campus) {
        metadata.campusId = campus.id;
        metadata.campusName = campus.name;
        if (company) {
          const companyInCampus = campus.companies?.find((co) => co.id === company!.id);
          if (companyInCampus) {
            metadata.companyId = companyInCampus.id;
            metadata.companyCode = companyInCampus.code;
            metadata.companyName = companyInCampus.name;
          }
        }
      }

      // —— 5. Crear contacto en el CRM ——
      const payloadContact: CreateContactDto = {
        firstName: createOpportunityDto.name,
        lastName: createOpportunityDto.name,
        phoneNumber: createOpportunityDto.phoneNumber,
      };
      contact = await this.contactService.create(payloadContact);

      // —— 6. Asignar ejecutivo por cola (solo en horario laboral; cola por subcampaña y por sede) ——
      const isTimeToAssign = timeToAssing();
      let userToAssign: User | null = null;
      if (isTimeToAssign) {
        userToAssign = await this.userService.getNextUserToAssign(createOpportunityDto.subCampaignId, campusId);
      }

      // —— 7. Crear oportunidad con datos base, sede, metadata y enlace SV ——
      const today = new Date();
      const payloadOpportunity: Partial<Opportunity> = {
        id: this.idGeneratorService.generateId(),
        name: contact.firstName,
        cNumeroDeTelefono: createOpportunityDto.phoneNumber,
        closeDate: today,
        createdAt: today,
        stage: Enum_Stage.GESTION_INICIAL,
        campaignId: createOpportunityDto.campaignId,
        cSubCampaignId: createOpportunityDto.subCampaignId,
        cCanal: createOpportunityDto.channel,
        contactId: contact.id,
        cSeguimientocliente: Enum_Following.SIN_SEGUIMIENTO,
      };
      if (userToAssign) {
        payloadOpportunity.assignedUserId = userToAssign;
      }
      if (createOpportunityDto.observation) {
        payloadOpportunity.cObs = createOpportunityDto.observation;
      }
      if (campusId != null) {
        payloadOpportunity.cCampusId = campusId;
      }
      if (Object.keys(metadata).length > 0) {
        payloadOpportunity.cMetadata = JSON.stringify(metadata);
      }

      const opportunity = this.opportunityRepository.create(payloadOpportunity);
      const savedOpportunity = await this.opportunityRepository.save(opportunity);
      const cConctionSv = `${this.URL_FRONT_MANAGER_LEADS}manager_leads/?usuario=${userToAssign?.id}&uuid-opportunity=${savedOpportunity.id}`;
      const newOpportunity = await this.update(savedOpportunity.id, { cConctionSv }, userId);

      // Estado estable de cola: registrar asignación (sede + subcampaña) para que users-active sea consistente
      if (userToAssign && campusId != null) {
        await this.assignmentQueueStateService.recordAssignment(
          campusId,
          createOpportunityDto.subCampaignId,
          userToAssign.id,
          savedOpportunity.id,
        );
      }

      // —— 8. Si el paciente ya existía en SV: completar oportunidad con datos del paciente y enlazar en SV ——
      const payloadClinicHistory: CreateClinicHistoryCrmDto = {
        espoId: newOpportunity.id,
      };

      if (isPacienteExistente && svData.patient) {
        const patient = svData.patient;
        const complete = svData.complete;
        const dataReservation = svData.data_reservation;
        const dataPayment = svData.data_payment;
        const clientData = svData.client_data;

        payloadClinicHistory.patientId = patient.id;

        const rawPayload: UpdateOpportunityDto = {
          cClinicHistory: patient.history,
          cCustomerDocumentType: clientData?.document_type ?? 'DNI',
          cCustomerDocument: clientData?.document_number ?? patient.documentNumber,
          cPatientsname: patient.name,
          cPatientsPaternalLastName: patient.lastNameFather,
          cPatientsMaternalLastName: patient.lastNameMother,
          cPatientDocument: patient.documentNumber,
          cPatientDocumentType: 'DNI',
        };
        const payloadToUpdate = Object.entries(rawPayload)
          .filter(([, value]) => value !== undefined && value !== null && value !== '')
          .reduce((acc, [key, value]) => ({ ...acc, [key]: value }), {});
        await this.update(newOpportunity.id, payloadToUpdate as UpdateOpportunityDto, userId);

        if (complete && dataPayment) {
          payloadClinicHistory.id_payment = dataPayment.payment_id;
          if (dataReservation) {
            const payloadUpdateReservation: UpdateOpportunityDto = {
              cAppointment: dataReservation.reservation_appointment,
              cDateReservation: dataReservation.reservation_date,
              cDoctor: dataReservation.doctor_name,
              cEnvironment: dataReservation.environment_name,
              cSpecialty: dataReservation.specialty_name,
              cTariff: dataReservation.tariff_name,
            };
            await this.update(newOpportunity.id, payloadUpdateReservation, userId);
            payloadClinicHistory.id_reservation = dataReservation.reservation_id;
          }
        }
      }

      // —— 9. Registrar el enlace oportunidad–paciente en el sistema vertical ——
      await this.svServices.createClinicHistoryCrm(payloadClinicHistory, tokenSv);

      // —— 10. Notificar por WebSocket si hay ejecutivo asignado ——
      if (newOpportunity.assignedUserId) {
        await this.websocketService.notifyNewOpportunity(newOpportunity);
      }

      // —— 11. Registrar en historial de acciones ——
      await this.actionHistoryService.addRecord({
        targetId: newOpportunity.id,
        target_type: ENUM_TARGET_TYPE.OPPORTUNITY,
        userId,
        message: 'Oportunidad creada',
      });

      return {
        status: 'success',
        code: 'OPORTUNIDAD_CREADA',
        message: 'Oportunidad creada correctamente',
        data: { opportunity: newOpportunity },
      };
    } catch (error: any) {
      if (contact) {
        try {
          await this.contactService.softDelete(contact.id);
        } catch {
          // ignorar si falla el soft delete
        }
      }
      const message = error?.message ?? 'Error al crear la oportunidad';
      if (message === 'NO_USUARIOS_PARA_ASIGNAR') {
        return {
          status: 'error',
          code: 'SIN_USUARIOS_PARA_ASIGNAR',
          message: 'No hay usuarios disponibles para asignar en esta campaña/sede.',
          data: {},
        };
      }
      throw new BadRequestException(message);
    }
  }

  async createWithSamePhoneNumber(opportunityId: string, userId: string){

    try {
      const opportunity = await this.getOneWithEntity(opportunityId);

      if(!opportunity){
        throw new NotFoundException(`Oportunidad con ID ${opportunityId} no encontrada`);
      }      

      const user = await this.userService.findOne(userId);

      // Primero calcular el baseName para buscar correctamente
      const refRegex = / REF-(\d+)$/;
      const baseName = opportunity.name!.replace(refRegex, '').trim();

      // Buscar todas las oportunidades que empiecen con baseName seguido de REF- o sin REF
      const opportunities = await this.opportunityRepository.find({
        where: [
          { name: baseName },
          { name: Like(`${baseName} REF-%`) }
        ],
      });

      let nextRefName: string;

      if (opportunities.length === 1) {
        // Si solo hay una oportunidad, significa que solo existe la original, asignar REF-2
        nextRefName = `${baseName} REF-2`;
      } else {
        // Buscar el REF más alto entre todas las oportunidades encontradas
        let highestRef = 1; // El original sería REF1 (sin mostrar)
        
        opportunities.forEach(opportunity => {
          const match = opportunity.name!.match(refRegex);
          if (match) {
            const refNumber = parseInt(match[1], 10);
            if (refNumber > highestRef) {
              highestRef = refNumber;
            }
          } 
        });
        
        // Asignar el siguiente número REF
        const nextRef = highestRef + 1;
        nextRefName = `${baseName} REF-${nextRef}`;
      }

      const today = new Date();

      const payloadOpportunity: Partial<Opportunity> = {
        id: this.idGeneratorService.generateId(),
        name: nextRefName,
        closeDate: today,
        createdAt: today,
        cNumeroDeTelefono: opportunity.cNumeroDeTelefono,
        stage: Enum_Stage.CIERRE_GANADO,
        campaignId: opportunity.campaignId,
        cSubCampaignId: opportunity.cSubCampaignId,
        cCanal: opportunity.cCanal,
        contactId: opportunity.contactId,
        cSeguimientocliente: Enum_Following.EN_SEGUIMIENTO,
        assignedUserId: opportunity.assignedUserId,
      }
      
      const opportunityCreated = this.opportunityRepository.create(payloadOpportunity);
      const savedOpportunity = await this.opportunityRepository.save(opportunityCreated);

      const cConctionSv = `${this.URL_FRONT_MANAGER_LEADS}manager_leads/?usuario=${opportunity.assignedUserId!.id}&uuid-opportunity=${savedOpportunity.id}`;

      const newOpportunity = await this.update(savedOpportunity.id, {cConctionSv: cConctionSv}, userId);

      const payloadClinicHistory: CreateClinicHistoryCrmDto = {
        espoId: newOpportunity.id,
      }

      const {tokenSv} = await this.svServices.getTokenSv(user.cUsersv!, user.cContraseaSv!);

      await this.svServices.createClinicHistoryCrm(payloadClinicHistory, tokenSv);

      // Notificar por WebSocket si tiene assignedUserId
      if (newOpportunity.assignedUserId) {
        await this.websocketService.notifyNewOpportunity(newOpportunity);
      }

      await this.actionHistoryService.addRecord({
        targetId: newOpportunity.id,
        target_type: ENUM_TARGET_TYPE.OPPORTUNITY,
        userId: userId,
        message: 'Oportunidad creada',
      });

      return newOpportunity;

    } catch (error) {
      throw new BadRequestException(error.message);
    }
  }

  async assingManual(opportunityId: string, assignedUserId: string, userId: string): Promise<Opportunity> {

    const opportunity = await this.getOneWithEntity(opportunityId);

    if(!opportunity){
      throw new NotFoundException(`Oportunidad con ID ${opportunityId} no encontrada`);
    }

    const user = await this.userService.findOne(assignedUserId);

    await this.websocketService.notifyOpportunityUpdate(opportunity, opportunity.stage);

    opportunity.assignedUserId = user;
    opportunity.modifiedAt = new Date();
    opportunity.cConctionSv = `${this.URL_FRONT_MANAGER_LEADS}manager_leads/?usuario=${assignedUserId}&uuid-opportunity=${opportunityId}`;

    await this.actionHistoryService.addRecord({
      targetId: opportunityId,
      target_type: ENUM_TARGET_TYPE.OPPORTUNITY,
      userId: userId,
      message: 'Oportunidad asignada manualmente',
    });

    const saved = await this.opportunityRepository.save(opportunity);

    if (opportunity.cCampusId != null && opportunity.cSubCampaignId) {
      await this.assignmentQueueStateService.recordAssignment(
        opportunity.cCampusId,
        opportunity.cSubCampaignId,
        assignedUserId,
        opportunityId,
      );
    }

    return saved;

  }

  async countOpportunitiesAssignedBySubcampaign(date: string) {
    // Parsear fecha desde formato dd-mm-yyyy
    const [day, month, year] = date.split('-');
    const parsedDate = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
    
    const allOpportunities = await this.opportunityRepository.find({
      where: {assignedUserId: Not(IsNull()), createdAt: MoreThanOrEqual(parsedDate), deleted: false },
    });

    const countOpportunitiesAssigned = {
      'APNEA': 0,
      'OFM': 0,
      'OI': 0
    }

    allOpportunities.forEach(opportunity => {
      if(opportunity.cSubCampaignId === CAMPAIGNS_IDS.APNEA) {
        countOpportunitiesAssigned['APNEA']++;
      } else if(opportunity.cSubCampaignId === CAMPAIGNS_IDS.OFM) {
        countOpportunitiesAssigned['OFM']++;
      } else if(opportunity.cSubCampaignId === CAMPAIGNS_IDS.OI) {
        countOpportunitiesAssigned['OI']++;
      }
    });

    return countOpportunitiesAssigned;
  }

  async createWithManualAssign(createOpportunityDto: CreateOpportunityDto, userId: string): Promise<CreateOpportunityResponse> {
    let contact: Contact | null = null;

    try {
      const existingByPhone = await this.findOneByPhoneNumber(createOpportunityDto.phoneNumber);
      if (existingByPhone) {
        const assignedUser = existingByPhone.assignedUserId;
        const assignedName = assignedUser?.userName ?? ([assignedUser?.firstName, assignedUser?.lastName].filter(Boolean).join(' ').trim() || 'Sin asignar');
        return {
          status: 'error',
          code: 'TELEFONO_YA_REGISTRADO',
          message: `Ya existe una oportunidad con este número de teléfono. Asignada a: ${assignedName}`,
          data: {},
        };
      }

      if (!createOpportunityDto.assignedUserId) {
        return {
          status: 'error',
          code: 'ASIGNADO_REQUERIDO',
          message: 'El ejecutivo a asignar (assignedUserId) es requerido',
          data: {},
        };
      }

      const user = await this.userService.findOne(userId);
      const { tokenSv } = await this.svServices.getTokenSv(user.cUsersv!, user.cContraseaSv!);
      const dataSv = await this.svServices.getPatientIsNew(createOpportunityDto.phoneNumber, tokenSv);

      if (dataSv.status === 'error' || dataSv.code === 'ERROR') {
        return {
          status: 'error',
          code: dataSv.code,
          message: dataSv.message,
          data: dataSv.data,
        };
      }

      const { code, data: svData } = dataSv;
      const isPacienteNuevo = OpportunityService.CODES_PACIENTE_NUEVO.includes(code);
      const isPacienteExistente = OpportunityService.CODES_PACIENTE_EXISTENTE.includes(code);

      if (isPacienteExistente && svData.is_assigned) {
        return {
          status: 'error',
          code: 'PACIENTE_YA_ASIGNADO',
          message: 'El paciente ya está asignado a otro ejecutivo',
          data: svData,
        };
      }
      if (!isPacienteNuevo && !isPacienteExistente) {
        return {
          status: 'error',
          code: dataSv.code,
          message: dataSv.message ?? 'No se puede crear la oportunidad',
          data: svData,
        };
      }

      // Misma validación de sede (campus) y empresa que create()
      let campusId: number | undefined = Number(createOpportunityDto.campusId);
      if (Number.isNaN(campusId)) campusId = undefined;
      const metadata: { campusId?: number; campusName?: string; companyId?: number; companyCode?: string; companyName?: string } = {};

      const campuses = await this.svServices.getCampuses(tokenSv);
      let campus: CampusItem | undefined = campuses.find((c: CampusItem) => c.id === campusId);
      if (campusId != null && campusId !== 0 && !campus) {
        return {
          status: 'error',
          code: 'CAMPUS_INVALIDO',
          message: 'La sede (campus) indicada no existe',
          data: {},
        };
      }

      let company = createOpportunityDto.company;
      if (campus?.companies?.length) {
        if (!company) {
          const sorted = [...campus.companies].sort((a, b) => a.id - b.id);
          company = { id: sorted[0].id, code: sorted[0].code, name: sorted[0].name };
        } else {
          const companyInCampus = campus.companies.find((co) => co.id === company!.id);
          if (!companyInCampus) {
            return {
              status: 'error',
              code: 'EMPRESA_NO_PERTENECE_A_SEDE',
              message: 'La empresa indicada no pertenece a la sede seleccionada',
              data: {},
            };
          }
          company = { id: companyInCampus.id, code: companyInCampus.code, name: companyInCampus.name };
        }
      } else if (!company) {
        company = DEFAULT_COMPANY;
      }

      if (campus) {
        metadata.campusId = campus.id;
        metadata.campusName = campus.name;
        if (company) {
          const companyInCampus = campus.companies?.find((co) => co.id === company!.id);
          if (companyInCampus) {
            metadata.companyId = companyInCampus.id;
            metadata.companyCode = companyInCampus.code;
            metadata.companyName = companyInCampus.name;
          }
        }
      }

      const payloadContact: CreateContactDto = {
        firstName: createOpportunityDto.name,
        lastName: createOpportunityDto.name,
        phoneNumber: createOpportunityDto.phoneNumber,
      };
      contact = await this.contactService.create(payloadContact);

      const assignedUser = await this.userService.findOne(createOpportunityDto.assignedUserId);
      const today = new Date();

      const payloadOpportunity: Partial<Opportunity> = {
        id: this.idGeneratorService.generateId(),
        name: contact.firstName,
        createdAt: today,
        cNumeroDeTelefono: createOpportunityDto.phoneNumber,
        closeDate: today,
        stage: Enum_Stage.GESTION_INICIAL,
        campaignId: createOpportunityDto.campaignId,
        cSubCampaignId: createOpportunityDto.subCampaignId,
        cCanal: createOpportunityDto.channel,
        contactId: contact.id,
        cSeguimientocliente: Enum_Following.SIN_SEGUIMIENTO,
        assignedUserId: assignedUser,
      };
      if (createOpportunityDto.observation) {
        payloadOpportunity.cObs = createOpportunityDto.observation;
      }
      if (campusId != null) {
        payloadOpportunity.cCampusId = campusId;
      }
      if (Object.keys(metadata).length > 0) {
        payloadOpportunity.cMetadata = JSON.stringify(metadata);
      }

      const opportunity = this.opportunityRepository.create(payloadOpportunity);
      const savedOpportunity = await this.opportunityRepository.save(opportunity);
      const cConctionSv = `${this.URL_FRONT_MANAGER_LEADS}manager_leads/?usuario=${createOpportunityDto.assignedUserId}&uuid-opportunity=${savedOpportunity.id}`;
      let newOpportunity = await this.update(savedOpportunity.id, { cConctionSv }, userId);

      // Si la sede de la oportunidad no coincide con la sede del ejecutivo asignado: éxito pero con observación
      if (newOpportunity.cCampusId != null && assignedUser) {
        const userCampusIds = await this.userService.getCampusIdsByUser(assignedUser.id);
        if (userCampusIds.length > 0 && !userCampusIds.includes(newOpportunity.cCampusId)) {
          const obsSede = 'Sede de la oportunidad distinta a la sede del ejecutivo asignado.';
          const newObs = newOpportunity.cObs ? `${newOpportunity.cObs}\n${obsSede}` : obsSede;
          newOpportunity = await this.update(newOpportunity.id, { cObs: newObs }, userId);
        }
      }

      const payloadClinicHistory: CreateClinicHistoryCrmDto = { espoId: newOpportunity.id };
      const { patient, complete, data_reservation: dataReservation, data_payment: dataPayment, client_data: clientData } = dataSv.data;

      if (patient && (isPacienteExistente || !dataSv.data.is_new)) {
        payloadClinicHistory.patientId = patient.id;
        const rawPayload: UpdateOpportunityDto = {
          cClinicHistory: patient.history,
          cCustomerDocumentType: clientData?.document_type ?? 'DNI',
          cCustomerDocument: clientData?.document_number ?? patient.documentNumber,
          cPatientsname: patient.name,
          cPatientsPaternalLastName: patient.lastNameFather,
          cPatientsMaternalLastName: patient.lastNameMother,
          cPatientDocument: patient.documentNumber,
          cPatientDocumentType: 'DNI',
        };
        const payloadToUpdate = Object.entries(rawPayload)
          .filter(([, value]) => value !== undefined && value !== null && value !== '')
          .reduce((acc, [key, value]) => ({ ...acc, [key]: value }), {});
        await this.update(newOpportunity.id, payloadToUpdate as UpdateOpportunityDto, userId);

        if (complete && dataPayment) {
          payloadClinicHistory.id_payment = dataPayment.payment_id;
          if (dataReservation) {
            await this.update(newOpportunity.id, {
              cAppointment: dataReservation.reservation_appointment,
              cDateReservation: dataReservation.reservation_date,
              cDoctor: dataReservation.doctor_name,
              cEnvironment: dataReservation.environment_name,
              cSpecialty: dataReservation.specialty_name,
              cTariff: dataReservation.tariff_name,
            }, userId);
            payloadClinicHistory.id_reservation = dataReservation.reservation_id;
          }
        }
      }

      await this.svServices.createClinicHistoryCrm(payloadClinicHistory, tokenSv);

      if (newOpportunity.assignedUserId) {
        await this.websocketService.notifyNewOpportunity(newOpportunity);
      }

      await this.actionHistoryService.addRecord({
        targetId: newOpportunity.id,
        target_type: ENUM_TARGET_TYPE.OPPORTUNITY,
        userId: userId,
        message: 'Oportunidad creada',
      });

      return {
        status: 'success',
        code: 'OPORTUNIDAD_CREADA',
        message: 'Oportunidad creada correctamente',
        data: { opportunity: newOpportunity },
      };
    } catch (error: any) {
      if (contact) {
        try {
          await this.contactService.softDelete(contact.id);
        } catch {
          // ignorar si falla el soft delete
        }
      }
      const message = error?.message ?? 'Error al crear la oportunidad';
      return {
        status: 'error',
        code: 'ERROR_CREACION',
        message,
        data: {},
      };
    }
  }

  async existSamePhoneNumber(phoneNumber: string): Promise<boolean> {
    const response = await this.opportunityRepository.find({
      where: {
        cNumeroDeTelefono: ILike(`%${phoneNumber}%`),
        deleted: false,
      },
    });
    return response.length > 0;
  }

  /** Devuelve la primera oportunidad con ese teléfono (y usuario asignado) si existe, para mostrar a quién pertenece. */
  async findOneByPhoneNumber(phoneNumber: string): Promise<Opportunity | null> {
    const opportunity = await this.opportunityRepository.findOne({
      where: {
        cNumeroDeTelefono: ILike(`%${phoneNumber}%`),
        deleted: false,
      },
      relations: ['assignedUserId'],
    });
    return opportunity ?? null;
  }

  async findAll(): Promise<Opportunity[]> {
    return await this.opportunityRepository.find({
      order: { createdAt: 'DESC' },
    });
  }

  async findOneWithDetails(id: string, userId: string) {
    const opportunity = await this.opportunityRepository.findOne({
      where: { id },
      relations: ['assignedUserId'],
    });

    if (!opportunity) {
      throw new NotFoundException(`Oportunidad con ID ${id} no encontrada`);
    }

    // Paralelizar IO (BD) para bajar la latencia total
    const [
      userAssignedData,
      user,
      meeting,
      actionHistory,
      files,
    ] = await Promise.all([
      (async () => {
        const opStart = Date.now();
        try {
          if (!opportunity.assignedUserId) {
            return { userAssigned: null as User | null, teams: [] as { team_id: string; team_name: string }[] };
          }
          const userAssigned = await this.userService.findOne(opportunity.assignedUserId.id);
          const teams = await this.userService.getAllTeamsByUser(userAssigned.id);
          return { userAssigned, teams };
        } catch (error) {
          throw error;
        }
      })(),
      (async () => this.userService.findOne(userId))(),
      (async () => this.meetingService.findByparentIdLess(opportunity.id))(),
      (async () => this.actionHistoryService.getRecordByTargetId(opportunity.id))(),
      (async () => this.filesService.findByParentId(opportunity.id))(),
    ]);

    const { userAssigned, teams } = userAssignedData;

    let campainName: string = '';
    let subCampaignName: string = '';

    switch(opportunity.cSubCampaignId){
      case CAMPAIGNS_IDS.APNEA:
        subCampaignName = 'APNEA';
        break;
      case CAMPAIGNS_IDS.OFM:
        subCampaignName = 'OFM';
        break;
      case CAMPAIGNS_IDS.OI:
        subCampaignName = 'OI';
        break;
    }

    switch(opportunity.campaignId){
      case CAMPAIGNS_IDS.APNEA:
        campainName = 'APNEA';
        break;
      case CAMPAIGNS_IDS.OFM:
        campainName = 'OFM';
        break;
      case CAMPAIGNS_IDS.OI:
        campainName = 'OI';
        break;
    }

    const {tokenSv} = await this.svServices.getTokenSv(user.cUsersv!, user.cContraseaSv!);

    // SV es externo: no debería tumbar el detalle si está lento/intermitente
    let statusClient = false;
    try {
      statusClient = await this.svServices.getStatusClient(opportunity.id, tokenSv);
    } catch {
      // Ignorar fallo de SV para no romper el endpoint
    }

    // Asociar archivos con actionHistory basándose en la fecha de creación (dentro de 2 minutos)
    const actionHistoryWithFiles = actionHistory.map((historyItem) => {
      const historyWithFile = { ...historyItem };
      
      // Si el data indica que es una imagen
      if (historyItem.data && (historyItem.data.toLowerCase().includes('imagen:') || historyItem.data.toLowerCase().startsWith('imagen'))) {
        const historyDate = new Date(historyItem.createdAt).getTime();
        
        // Buscar archivo creado cerca de la fecha del actionHistory
        const matchingFile = files.find((file: any) => {
          if (!file.created_at) return false;
          const fileDate = new Date(file.created_at).getTime();
          const timeDiff = Math.abs(historyDate - fileDate);
          // Archivos creados dentro de 2 minutos del actionHistory
          return timeDiff <= 2 * 60 * 1000; // 2 minutos en milisegundos
        });
        
        if (matchingFile) {
          // Agregar información del archivo al actionHistory
          (historyWithFile as any).file = {
            id: matchingFile.id,
            file_name: matchingFile.file_name,
            url: matchingFile.url,
            downloadUrl: matchingFile.downloadUrl,
            created_at: matchingFile.created_at
          };
        }
      }
      
      return historyWithFile;
    });

    return { ...opportunity, dataMeeting: {...meeting}, userAssigned: userAssigned?.userName, campainName: campainName, subCampaignName: subCampaignName, teams: teams, actionHistory: actionHistoryWithFiles, statusClient: statusClient, files: files };
  }

  /** Actualiza solo la sede de atención (campus de atención) de la oportunidad. */
  async updateSedeAtencion(id: string, campusAtencionId: number | null): Promise<Opportunity> {
    await this.getOneWithEntity(id);
    const value = campusAtencionId ?? null;
    await this.opportunityRepository.update(
      { id },
      { cCampusAtencionId: value, modifiedAt: new Date() } as Partial<Opportunity>,
    );
    return this.getOneWithEntity(id);
  }

  async update(id: string, updateOpportunityDto: UpdateOpportunityDto, userId?: string): Promise<Opportunity> {

    const opportunity = await this.getOneWithEntity(id);

    const previousStage = opportunity.stage; // Guardar etapa anterior para comparación

    // Verificar si solo se está actualizando cClientTypification
    // Excluir campos que pueden venir automáticamente o que no son relevantes para la verificación
    const relevantFields = Object.keys(updateOpportunityDto).filter(key => {
      const value = updateOpportunityDto[key as keyof UpdateOpportunityDto];
      // Excluir campos internos (que empiezan con _) y campos automáticos
      return value !== undefined && 
             key !== 'modifiedAt' && 
             key !== 'createdAt' && 
             !key.startsWith('_');
    });
    
    const isOnlyTypificationUpdate = relevantFields.length === 1 && 
                                     relevantFields[0] === 'cClientTypification';

    // Construir el objeto de actualización con solo los campos presentes en el DTO
    // Excluir campos internos que no deben guardarse en la base de datos
    const updateData: Partial<Opportunity> = {};
    Object.keys(updateOpportunityDto).forEach(key => {
      // Excluir campos internos y createdAt (no se debe sobrescribir la fecha de creación)
      if (key.startsWith('_') || key === 'createdAt') return;
      
      const value = updateOpportunityDto[key as keyof UpdateOpportunityDto];
      if (value !== undefined) {
        (updateData as any)[key] = value;
      }
    });
    
    // cSeguimientocliente y stage son independientes - se pueden cambiar por separado
    // El campo cSeguimientocliente (Sin Seguimiento / En seguimiento) se controla con el botón "Reaccionar"
    // El campo stage (Gestion Inicial, Seguimiento, etc.) se controla con el select de etapas
    // Ambos campos pueden actualizarse independientemente sin restricciones entre ellos
    
    // Si se actualiza cSeguimientocliente a "Sin Seguimiento" y el stage actual es "Seguimiento", 
    // revertir a "Gestion Inicial" (solo si no se está actualizando explícitamente el stage)
    if (updateOpportunityDto.cSeguimientocliente === Enum_Following.SIN_SEGUIMIENTO && 
             opportunity.stage === Enum_Stage.SEGUIMIENTO && 
             !updateOpportunityDto.stage) {
      updateData.stage = Enum_Stage.GESTION_INICIAL;
    }
    
    // Actualizar timestamp de modificación (siempre UTC)
    updateData.modifiedAt = new Date();
    
    // Actualizar la entidad directamente y guardar para asegurar que los cambios se reflejen
    Object.assign(opportunity, updateData);
    const savedOpportunity = await this.opportunityRepository.save(opportunity);
    
    // Obtener la oportunidad actualizada con relaciones
    const updatedOpportunity = await this.getOneWithEntity(id);

    // Estado estable de cola: si se cambió el usuario asignado, actualizar estado por sede + subcampaña
    if (updateData.assignedUserId != null && updatedOpportunity.cCampusId != null && updatedOpportunity.cSubCampaignId && updatedOpportunity.assignedUserId?.id) {
      await this.assignmentQueueStateService.recordAssignment(
        updatedOpportunity.cCampusId,
        updatedOpportunity.cSubCampaignId,
        updatedOpportunity.assignedUserId.id,
        updatedOpportunity.id,
      );
    }
    
    // No notificar por WebSocket si solo se actualiza la tipificación
    if (!isOnlyTypificationUpdate) {
      // Notificar por WebSocket si tiene assignedUserId
      if (updatedOpportunity.assignedUserId) {
        await this.websocketService.notifyOpportunityUpdate(updatedOpportunity, previousStage);
      }
    }

    // Registrar en historial con detalles específicos si hay cambios en tipificación
    if (isOnlyTypificationUpdate && userId && updateOpportunityDto._typificationChange) {
      const change = updateOpportunityDto._typificationChange;
      let message = 'Oportunidad actualizada';
            
      // Manejar nota global (category es null)
      if (change.action === 'nota_global_actualizada') {
        message = change.value 
          ? `Actualizó la nota global: "${change.value.substring(0, 50)}${change.value.length > 50 ? '...' : ''}"`
          : 'Actualizó la nota global';
      } else if (change.action === 'nota_global_eliminada') {
        message = 'Eliminó la nota global';
      } 
      // Manejar cambios en categorías (category no es null)
      else if (change.category && change.action && change.value) {
        const categoryLabels: Record<string, string> = {
          'riesgos': 'Riesgos o alertas',
          'capacidadCompra': 'Capacidad de compra',
          'comportamiento': 'Comportamiento del cliente',
          'motivoPerdida': 'Motivo de pérdida'
        };
        
        const categoryLabel = categoryLabels[change.category] || change.category;
        
        if (change.action === 'agregado') {
          message = `Agregó "${change.value}" en ${categoryLabel}`;
        } else if (change.action === 'eliminado') {
          message = `Eliminó "${change.value}" de ${categoryLabel}`;
        }
      }
      
      
      await this.actionHistoryService.addRecord({
        targetId: updatedOpportunity.id,
        target_type: ENUM_TARGET_TYPE.OPPORTUNITY,
        userId: userId,
        message: message,
      });
    } else if (!isOnlyTypificationUpdate && userId) {
      // Registrar actualización normal si no es solo tipificación
      await this.actionHistoryService.addRecord({
        targetId: updatedOpportunity.id,
        target_type: ENUM_TARGET_TYPE.OPPORTUNITY,
        userId: userId,
        message: 'Oportunidad actualizada',
      });
    }
    
    return updatedOpportunity;
  }

  async remove(id: string, userId: string): Promise<void> {
    // Obtener la oportunidad antes de eliminar para notificar
    const opportunity = await this.opportunityRepository.findOne({
      where: { id },
      select: ['assignedUserId'],
    });
    
    const result = await this.opportunityRepository.delete(id);
    
    if (result.affected === 0) {
      throw new NotFoundException(`Oportunidad con ID ${id} no encontrada`);
    }
    
    // Notificar por WebSocket si tenía assignedUserId
    if (opportunity?.assignedUserId) {
      await this.websocketService.notifyOpportunityDeleted(opportunity.assignedUserId.id, id);
    }

    await this.actionHistoryService.addRecord({
      targetId: id,
      target_type: ENUM_TARGET_TYPE.OPPORTUNITY,
      userId: userId,
      message: 'Oportunidad eliminada',
    });
  }

  // Métodos adicionales útiles para el CRM
  async findByAccount(accountId: string): Promise<Opportunity[]> {
    return await this.opportunityRepository.find({
      where: { accountId },
      order: { createdAt: 'DESC' },
    });
  }

  async findByStage(stage: Enum_Stage): Promise<Opportunity[]> {
    return await this.opportunityRepository.find({
      where: { stage },
      order: { createdAt: 'DESC' },
    });
  }

  async findByAssignedUser(
    userRequest: string, 
    page: number = 1, 
    limit: number = 10,
    search?: string,
    userSearch?: string,
    stage?: Enum_Stage,
    isPresaved?: boolean
  ): Promise<{ opportunities: Opportunity[], total: number, page: number, totalPages: number }> {

    const teamsUser = await this.userService.getAllTeamsByUser(userRequest);

    const isAdmin = await this.userService.isAdmin(userRequest);

    const isAssistent = teamsUser.some(team => team.team_id === TEAMS_IDS.ASISTENTES_COMERCIALES);

    const isTIorOwner = teamsUser.some(team => team.team_id === TEAMS_IDS.TEAM_TI || team.team_id === TEAMS_IDS.TEAM_OWNER);
    
    const isTeamLeader = teamsUser.some(team => team.team_id === TEAMS_IDS.TEAM_LEADERS_COMERCIALES);
    let team: string = '';
    let users: UserWithTeam[] = [];

    // Team leader Arequipa: está en TEAM_AREQUIPA y tiene rol Team Leader Comercial
    const userWithRoles = await this.userService.findOne(userRequest);
    const roles = (userWithRoles as { roles?: { roleId?: string }[] }).roles ?? [];
    const hasTeamLeaderRole = roles.some(r => r.roleId === ROLES_IDS.TEAM_LEADER_COMERCIAL);
    const isTeamLeaderArequipa = teamsUser.some(t => t.team_id === TEAMS_IDS.TEAM_AREQUIPA) && hasTeamLeaderRole;
    
    if (isTeamLeader) {
      if (teamsUser.some(t => t.team_id === TEAMS_IDS.TEAM_FIORELLA)) {
        team = TEAMS_IDS.TEAM_FIORELLA;
      } else if (teamsUser.some(t => t.team_id === TEAMS_IDS.TEAM_MICHELL)) {
        team = TEAMS_IDS.TEAM_MICHELL;
      } else if (teamsUser.some(t => t.team_id === TEAMS_IDS.TEAM_VERONICA)) {
        team = TEAMS_IDS.TEAM_VERONICA;
      }
      if (team) {
        users = await this.userService.getUserByAllTeams([team]);
      }
    } else if (isTeamLeaderArequipa) {
      team = TEAMS_IDS.TEAM_AREQUIPA;
      users = await this.userService.getUserByAllTeams([TEAMS_IDS.TEAM_AREQUIPA]);
    }


    const queryBuilder = this.opportunityRepository
      .createQueryBuilder('opportunity')
      .leftJoinAndSelect('opportunity.assignedUserId', 'user')
      .andWhere('opportunity.deleted = :deleted', { deleted: false });

    // Si se proporciona userSearch, tiene prioridad sobre los filtros de permisos
    if (userSearch && userSearch.trim()) {
      queryBuilder.andWhere('opportunity.assigned_user_id = :userSearch', { userSearch: userSearch.trim() });
    } else {
      // Solo aplicar filtros de permisos si no hay userSearch
      if (isTIorOwner || isAdmin || isAssistent) {
        // Si es TI, Owner o Asistente, no aplicar ningún filtro de usuario (ve todas las oportunidades)
        // Solo mantiene el filtro de deleted = false que ya está aplicado
      } else if (isTeamLeader || isTeamLeaderArequipa) {
        // Si es team leader (Fiorella/Veronica/Michel/Arequipa), ver oportunidades de todos los usuarios de su equipo
        const userIds = users.length > 0 ? users.map(u => u.user_id) : [];
        if (!userIds.includes(userRequest)) {
          userIds.push(userRequest);
        }
        if (userIds.length > 0) {
          queryBuilder.andWhere('opportunity.assigned_user_id IN (:...userIds)', { userIds });
        }
      } else {
        // Si no es team leader ni TI/Owner, solo ver sus propias oportunidades
        queryBuilder.andWhere('opportunity.assigned_user_id = :userRequest', { userRequest });
      }
    }

    if (search && search.trim()) {
      // Si hay búsqueda, agregar condiciones OR para búsqueda en múltiples campos
      queryBuilder.andWhere(
        '(opportunity.name ILIKE :search OR ' +
        'opportunity.cNumeroDeTelefono ILIKE :search OR ' +
        'opportunity.cPhoneNumber ILIKE :search OR ' +
        'opportunity.cClinicHistory ILIKE :search OR ' +
        'opportunity.cPatientsname ILIKE :search OR ' +
        'opportunity.cCanal ILIKE :search OR ' +
        'opportunity.cChannel ILIKE :search OR ' +
        'opportunity.cObs ILIKE :search OR ' +
        'user.user_name ILIKE :search OR ' +
        'user.first_name ILIKE :search OR ' +
        'user.last_name ILIKE :search)',
        { search: `%${search.trim()}%` }
      );
    }

    if (stage) {
      queryBuilder.andWhere('opportunity.stage = :stage', { stage });
    }

    // Filtro por oportunidades preguardadas
    if (isPresaved === true) {
      queryBuilder.andWhere('opportunity.isPresaved = :isPresaved', { isPresaved: true });
    }

    // Usar ordenamiento diferente según el tipo de usuario
    let opportunities: Opportunity[];
    let total: number;
    
    if (isAssistent) {
      // Si es asistente, solo ordenar por fecha de creación (sin priorizar "Sin Seguimiento")
      [opportunities, total] = await queryBuilder
        .orderBy('opportunity.createdAt', 'DESC')
        .skip((page - 1) * limit)
        .take(limit)
        .getManyAndCount();
    } else {
      // Para otros usuarios, usar ordenamiento con dos campos: primero por seguimiento (DESC para que "Sin Seguimiento" venga primero), luego por fecha
      [opportunities, total] = await queryBuilder
        .addOrderBy('opportunity.cSeguimientocliente', 'DESC') // "Sin Seguimiento" viene antes que "En seguimiento" al ordenar DESC
        .addOrderBy('opportunity.createdAt', 'DESC')
        .skip((page - 1) * limit)
        .take(limit)
        .getManyAndCount();
    }

    const totalPages = Math.ceil(total / limit);

    return {
      opportunities,
      total,
      page,
      totalPages,
    };
  }

  async findActiveOpportunities(): Promise<Opportunity[]> {
    return await this.opportunityRepository.find({
      where: { deleted: false },
      order: { createdAt: 'DESC' },
    });
  }

  async softDelete(id: string): Promise<Opportunity> {
    const opportunity = await this.getOneWithEntity(id);
    opportunity.deleted = true;
    opportunity.modifiedAt = new Date();
    return await this.opportunityRepository.save(opportunity);
  }

  async getLastOpportunityAssigned(subCampaignId: string, campusId?: number): Promise<OpportunityWithUser> {
    const qb = this.opportunityRepository
      .createQueryBuilder('o')
      .select([
        'o.id as opportunity_id',
        'o.name as opportunity_name',
        'o.assignedUserId as assigned_user_id',
        'u.userName as assigned_user_user_name',
        'o.createdAt as assigned_at',
      ])
      .leftJoin('user', 'u', 'u.id = o.assignedUserId')
      .where('o.assignedUserId IS NOT NULL')
      .andWhere('o.cSubCampaignId = :subCampaignId', { subCampaignId })
      .andWhere('o.deleted = false')
      .andWhere('o.name NOT ILIKE :name', { name: '%REF-%' });

    if (campusId != null) {
      qb.andWhere('o.cCampusId = :campusId', { campusId });
    }

    const opportunity = await qb
      .orderBy('o.createdAt', 'DESC')
      .addOrderBy('o.id', 'DESC')
      .getRawOne();

    return opportunity;
  }

  /** Fecha de la última oportunidad asignada a un usuario en esta cola (sede + subcampaña). */
  async getLastAssignmentDateForUser(
    userId: string,
    subCampaignId: string,
    campusId?: number,
  ): Promise<Date | null> {
    const map = await this.getLastAssignmentDatesByUser(subCampaignId, campusId);
    return map[userId] ?? null;
  }

  /** Última fecha de asignación por usuario en esta cola (una sola consulta). */
  async getLastAssignmentDatesByUser(
    subCampaignId: string,
    campusId?: number,
  ): Promise<Record<string, Date>> {
    const qb = this.opportunityRepository
      .createQueryBuilder('o')
      .select('o.assignedUserId', 'userId')
      .addSelect('MAX(o.createdAt)', 'lastAt')
      .where('o.assignedUserId IS NOT NULL')
      .andWhere('o.cSubCampaignId = :subCampaignId', { subCampaignId })
      .andWhere('o.deleted = false')
      .andWhere('o.name NOT ILIKE :name', { name: '%REF-%' })
      .groupBy('o.assignedUserId');

    if (campusId != null) {
      qb.andWhere('o.cCampusId = :campusId', { campusId });
    }

    const rows = await qb.getRawMany();
    const out: Record<string, Date> = {};
    for (const r of rows) {
      const id = (r as any).userId ?? (r as any).user_id ?? (r as any).assigned_user_id;
      const at = (r as any).lastAt ?? (r as any).last_at;
      if (id && at) out[id] = at instanceof Date ? at : new Date(at);
    }
    return out;
  }

  async getOpportunityByName(name: string): Promise<Opportunity[]> {
    const opportunities = await this.opportunityRepository.find({
      where: { name: Like(`%${name}%`) },
    });

    if(opportunities.length === 0){
      throw new NotFoundException(`No hay oportunidades con nombre ${name}`);
    }

    return opportunities;
  }

  async getOpportunitiesNotAssigned(): Promise<Opportunity[]> {
    return await this.opportunityRepository
      .createQueryBuilder("o")
      .where("o.assigned_user_id IS NULL OR o.assigned_user_id = ''")
      .orderBy("o.created_at", "ASC")
      .getMany();
  }
      
  async getOpportunitiesNotReaction(): Promise<Opportunity[]> {
    return await this.opportunityRepository.find({
      where: { cSeguimientocliente: Enum_Following.SIN_SEGUIMIENTO, assignedUserId: Not(IsNull()), deleted: false, cSubCampaignId: Not(IsNull()), name: Not(Like('%REF-%')) },
      order: { createdAt: 'DESC' },
      relations: ['assignedUserId'],
    });
  }

  async getOneWithEntity(id: string): Promise<Opportunity> {
    const opportunity = await this.opportunityRepository.findOne({
      where: { id },
      relations: ['assignedUserId'],    
    });

    if(!opportunity){
      throw new NotFoundException(`Oportunidad con ID ${id} no encontrada`);
    }

    return opportunity;
  }

  async getPatientSV(opportunityId: string) {
    const opportunity = await this.getOneWithEntity(opportunityId);

    if(!opportunity) {
      throw new NotFoundException("No se encontró la oportunidad");
    }

    const user = await this.userService.findOne(opportunity.assignedUserId!.id);

    if(!opportunity.cClinicHistory) {
      throw new NotFoundException("No se encontró el historial clinica");
    }

    const {tokenSv} = await this.svServices.getTokenSv(user.cUsersv!, user.cContraseaSv!);

    const dataPatient = await this.svServices.getPatientSV(opportunity.cClinicHistory, tokenSv);

    return {
      type: "init_data",
      token: tokenSv,
      id_user: user.id,
      username: user.cUsersv,
      doctorID: null,
      clinicHistory: opportunity.cClinicHistory,
      patientId: dataPatient.id,
    }

  }

  /**
   * Extrae la ruta relativa de una URL después de "Comprobantes/"
   * @param url URL completa del comprobante
   * @returns Ruta relativa que comienza con "Comprobantes/"
   */
  /**
   * Descarga las facturas desde URLs y las guarda en la base de datos
   * Usa las URLs tal cual vienen del frontend, sin buscar o procesar nada adicional
   * @param opportunityId ID de la oportunidad
   * @param cFacturas Objeto con las URLs de las facturas
   * @returns Array con los IDs de los archivos guardados
   */
  private async downloadFacturasFromURLs(
    parentId: string,
    cFacturas: { comprobante_soles: string | null; comprobante_dolares: string | null },
  ): Promise<{ comprobante_soles?: number; comprobante_dolares?: number }> {
    const downloadedFiles: { comprobante_soles?: number; comprobante_dolares?: number } = {};

    try {
      // Descargar comprobante en soles si existe - usar URL tal cual viene del frontend
      if (cFacturas.comprobante_soles) {
        try {
          // Usar la URL directamente del frontend, sin procesar ni buscar nada
          const response = await fetch(cFacturas.comprobante_soles);
          if (!response.ok) {
            console.error(`Error al descargar comprobante_soles: ${response.status} ${response.statusText}`);
            throw new Error(`Error HTTP ${response.status}: ${response.statusText}`);
          }
          const arrayBuffer = await response.arrayBuffer();
          const buffer = Buffer.from(arrayBuffer);
          
          const fileName = `comprobante_soles_${parentId}.pdf`;
          const result = await this.filesService.createFileRecord(
            parentId,
            ENUM_TARGET_TYPE.OPPORTUNITY,
            fileName,
            buffer
          );
          downloadedFiles.comprobante_soles = result.id;
        } catch (error) {
          console.error('Error al descargar comprobante_soles:', error);
          // Continuar con el proceso aunque falle la descarga de un comprobante
        }
      }

      // Descargar comprobante en dólares si existe - usar URL tal cual viene del frontend
      if (cFacturas.comprobante_dolares) {
        try {
          // Usar la URL directamente del frontend, sin procesar ni buscar nada
          const response = await fetch(cFacturas.comprobante_dolares);
          if (!response.ok) {
            console.error(`Error al descargar comprobante_dolares: ${response.status} ${response.statusText}`);
            throw new Error(`Error HTTP ${response.status}: ${response.statusText}`);
          }
          const arrayBuffer = await response.arrayBuffer();
          const buffer = Buffer.from(arrayBuffer);
          
          const fileName = `comprobante_dolares_${parentId}.pdf`;
          const result = await this.filesService.createFileRecord(
            parentId,
            ENUM_TARGET_TYPE.OPPORTUNITY,
            fileName,
            buffer
          );
          downloadedFiles.comprobante_dolares = result.id;
        } catch (error) {
          console.error('Error al descargar comprobante_dolares:', error);
          // Continuar con el proceso aunque falle la descarga de un comprobante
        }
      }

      return downloadedFiles;
    } catch (error) {
      console.error('Error general al descargar facturas:', error);
      // No lanzar el error para que la actualización de oportunidad continúe
      // solo retornar los archivos que se descargaron exitosamente
      return downloadedFiles;
    }
  }

  /**
   * Consulta metódicamente el estado de facturación de las O.S asociadas a la oportunidad.
   * Para cada O.S con facturado=false llama GET invoice-mifact-v3/service-order/:id/invoice-status.
   * Si alguna está facturada: actualiza la fila, descarga las URLs como facturas, marca isPresaved=false y cFacturacionSubEstado=factura_directa.
   * @returns true si se actualizó la oportunidad (se descargaron facturas de alguna O.S)
   */
  private async checkAndUpdateInvoiceStatusForOpportunityServiceOrders(opportunityId: string): Promise<boolean> {
    const pendientes = await this.opportunityServiceOrderRepository.find({
      where: { opportunityId, facturado: false },
      order: { id: 'ASC' },
    });
    if (pendientes.length === 0) return false;

    let opportunityUpdated = false;
    for (const oso of pendientes) {
      const status = await this.svServices.getInvoiceStatusByServiceOrderId(oso.serviceOrderId);
      await this.opportunityServiceOrderRepository.update(
        { id: oso.id },
        { lastCheckedAt: new Date() },
      );
      if (!status?.facturado || !status.urls) continue;

      await this.opportunityServiceOrderRepository.update(
        { id: oso.id },
        {
          facturado: true,
          urlSoles: status.urls.soles ?? undefined,
          urlDolares: status.urls.dolares ?? undefined,
          invoiceResultHeadId: status.invoice_result_head_id ?? undefined,
          lastCheckedAt: new Date(),
        },
      );
      const cFacturas = {
        comprobante_soles: status.urls.soles ?? null,
        comprobante_dolares: status.urls.dolares ?? null,
      };
      await this.downloadFacturasFromURLs(opportunityId, cFacturas);
      await this.opportunityRepository.update(
        { id: opportunityId },
        { isPresaved: false, cFacturacionSubEstado: FacturacionSubEstado.FACTURA_DIRECTA },
      );
      opportunityUpdated = true;
      console.log('[updateOpportunityWithFacturas] O.S facturada y facturas descargadas', { serviceOrderId: oso.serviceOrderId, opportunityId });
      break; // una O.S facturada es suficiente para completar
    }
    return opportunityUpdated;
  }

  /**
   * Consulta estado de facturación para todas las oportunidades con O.S pendientes (para uso del cron).
   * @param opportunityId si se pasa, solo se revisa esta oportunidad
   * @returns cantidad de oportunidades que se actualizaron (se descargaron facturas de alguna O.S)
   */
  async checkInvoiceStatusForPendingServiceOrders(opportunityId?: string): Promise<number> {
    if (opportunityId) {
      const updated = await this.checkAndUpdateInvoiceStatusForOpportunityServiceOrders(opportunityId);
      return updated ? 1 : 0;
    }
    const pendientes = await this.opportunityServiceOrderRepository
      .createQueryBuilder('oso')
      .select('oso.opportunity_id')
      .distinct(true)
      .where('oso.facturado = :facturado', { facturado: false })
      .getRawMany<{ opportunity_id: string }>();
    let count = 0;
    for (const { opportunity_id } of pendientes) {
      const updated = await this.checkAndUpdateInvoiceStatusForOpportunityServiceOrders(opportunity_id);
      if (updated) count++;
    }
    return count;
  }

  async updateOpportunityWithFacturas(
    opportunityId: string,
    body: UpdateOpportunityProcces,
    userId: string,
  ) {
    console.log('[updateOpportunityWithFacturas] Inicio', {
      opportunityId,
      userId,
      bodyKeys: Object.keys(body),
      cFacturas: body.cFacturas ? { ...body.cFacturas } : undefined,
    });

    // --- Configuración de campos ---
    const mainFields = [
      "cLastNameFather",
      "cCustomerDocumentType",
      "cCustomerDocument",
      "cPatientsname",
      "cPatientsPaternalLastName",
      "cPatientsMaternalLastName",
      "cPatientDocument",
      "cPatientDocumentType",
      "cClinicHistory"
    ];
  
    const appointmentFields = [
      "cAppointment",
      "cDoctor",
      "cEnvironment",
      "cSpecialty",
      "cTariff",
      "cDateReservation",
    ];
  
    // --- Detectar casos ---
    const onlyAppointment = hasFields(appointmentFields, body) && !hasFields(mainFields, body);
    const hasMainData = hasFields(mainFields, body);
    const hasAppointmentData = hasFields(appointmentFields, body);

    console.log('[updateOpportunityWithFacturas] Detección de caso', {
      onlyAppointment,
      hasMainData,
      hasAppointmentData,
    });
  
    // --- Construir payload ---
    let payload: Record<string, any> = {};
  
    if (onlyAppointment) {
      payload = pickFields(appointmentFields, body);
      console.log('[updateOpportunityWithFacturas] Caso: solo cita → payload solo appointmentFields', { payload });
    } else if (hasMainData && !hasAppointmentData) {
      payload = pickFields(mainFields, body);
      console.log('[updateOpportunityWithFacturas] Caso: solo datos principales → payload solo mainFields', { payload });
    } else if (hasMainData && hasAppointmentData) {
      payload = {
        ...pickFields(mainFields, body),
        ...pickFields(appointmentFields, body),
      };
      console.log('[updateOpportunityWithFacturas] Caso: datos principales + cita → payload combinado', { payload });
    } else {
      payload = { ...body };
      console.log('[updateOpportunityWithFacturas] Caso: otro → payload completo del body', { payload });
    }

    // Actualizar la oportunidad con los campos del payload
    console.log('[updateOpportunityWithFacturas] Actualizando oportunidad en BD...');
    let newOpportunity = (await this.update(opportunityId, payload, userId)) as Opportunity;
    console.log('[updateOpportunityWithFacturas] Oportunidad actualizada', {
      id: newOpportunity.id,
      name: newOpportunity.name,
      stage: newOpportunity.stage,
    });

    // Consultar metódicamente estado de facturación de O.S asociadas (cada vez que se llama el endpoint)
    const osUpdated = await this.checkAndUpdateInvoiceStatusForOpportunityServiceOrders(opportunityId);
    if (osUpdated) {
      newOpportunity = (await this.getOneWithEntity(opportunityId)) as Opportunity;
      console.log('[updateOpportunityWithFacturas] Oportunidad recargada tras actualización por O.S facturada');
    }

    console.log('[updateOpportunityWithFacturas] Registrando en actionHistory (oportunidad actualizada)...');
    await this.actionHistoryService.addRecord({
      targetId: newOpportunity.id,
      target_type: ENUM_TARGET_TYPE.OPPORTUNITY,
      userId,
      message: 'Oportunidad actualizada',
    });

    if (onlyAppointment || hasAppointmentData) {
      console.log('[updateOpportunityWithFacturas] Creando meeting/reunión por datos de cita...');
      let dateStart = newOpportunity.cDateReservation;
      let dateEnd = newOpportunity.cDateReservation;
      const [startTime, endTime] = newOpportunity.cAppointment!.split("-").map((s) => s.trim());
      dateStart = `${newOpportunity.cDateReservation} ${startTime}:00`;
      dateEnd = `${newOpportunity.cDateReservation} ${endTime}:00`;

      const payload: Partial<Meeting> = {
        id: this.idGeneratorService.generateId(),
        name: newOpportunity.name,
        status: 'Planned',
        description: 'Creacion de reserva',
        parentId: opportunityId,
        parentType: 'Opportunity',
        dateStart: new Date(dateStart),
        dateEnd: new Date(dateEnd),
        assignedUserId: newOpportunity.assignedUserId!.id,
      };

      const meetingCreated = await this.meetingService.create(payload);
      console.log('[updateOpportunityWithFacturas] Meeting creado', {
        meetingId: meetingCreated.id,
        dateStart,
        dateEnd,
      });

      await this.actionHistoryService.addRecord({
        targetId: meetingCreated.id,
        target_type: ENUM_TARGET_TYPE.MEETING,
        userId,
        message: 'Actividad creada',
      });
      console.log('[updateOpportunityWithFacturas] Registrado en actionHistory (actividad creada)');
    }

    console.log('[updateOpportunityWithFacturas] Obteniendo usuario y token SV...');
    const user = await this.userService.findOne(userId);
    const { tokenSv } = await this.svServices.getTokenSv(user.cUsersv!, user.cContraseaSv!);
    console.log('[updateOpportunityWithFacturas] Token SV obtenido');

    if (body.cFacturas && (body.cFacturas.comprobante_dolares || body.cFacturas.comprobante_soles)) {
      console.log('[updateOpportunityWithFacturas] Hay facturas en body → descargando facturas desde URLs...');
      await this.downloadFacturasFromURLs(opportunityId, body.cFacturas);
      console.log('[updateOpportunityWithFacturas] Facturas descargadas');
      
      // Si hay facturas, marcar is_presaved = false (ya no está preguardado, está facturado)
      await this.opportunityRepository.update(
        { id: opportunityId },
        { isPresaved: false }
      );
      console.log('[updateOpportunityWithFacturas] Oportunidad marcada isPresaved=false');

      // Si hay facturas Y hay historia clínica (paciente creado), marcar como cierre ganado
      const hasClinicHistory = body.cClinicHistory || newOpportunity.cClinicHistory;
      console.log('[updateOpportunityWithFacturas] Verificación cierre ganado', {
        hasClinicHistory: !!hasClinicHistory,
        stageActual: newOpportunity.stage,
      });

      if (hasClinicHistory && newOpportunity.stage !== Enum_Stage.CIERRE_GANADO) {
        await this.opportunityRepository.update(
          { id: opportunityId },
          { 
            stage: Enum_Stage.CIERRE_GANADO,
            modifiedAt: new Date(),
            cFacturacionSubEstado: FacturacionSubEstado.FACTURA_DIRECTA,
          }
        );
        console.log('[updateOpportunityWithFacturas] Etapa actualizada a CIERRE_GANADO (factura directa)');

        // Notificar por WebSocket si tiene assignedUserId
        const updatedOpportunity = await this.getOneWithEntity(opportunityId);
        if (updatedOpportunity.assignedUserId) {
          await this.websocketService.notifyOpportunityUpdate(updatedOpportunity, newOpportunity.stage);
          console.log('[updateOpportunityWithFacturas] Notificación WebSocket enviada');
        }

        // Actualizar newOpportunity para retornar el estado actualizado
        newOpportunity = updatedOpportunity as Opportunity;
      }
    }

    // Órdenes de servicio (O.S): guardar asociación, sub-estado "pendiente factura", y consultar invoice-status
    if (body.cOrdenesServicio?.length) {
      console.log('[updateOpportunityWithFacturas] Procesando Órdenes de Servicio', { cOrdenesServicio: body.cOrdenesServicio });
      const metadataByOs = body.cOrdenesServicioMetadata || {};
      for (const serviceOrderId of body.cOrdenesServicio) {
        const existing = await this.opportunityServiceOrderRepository.findOne({
          where: { opportunityId, serviceOrderId },
        });
        if (!existing) {
          const meta = metadataByOs[serviceOrderId];
          await this.opportunityServiceOrderRepository.save({
            opportunityId,
            serviceOrderId,
            metadata: meta ? JSON.stringify(meta) : undefined,
            facturado: false,
          });
          console.log('[updateOpportunityWithFacturas] O.S creada', { serviceOrderId });
        }
      }
      const hasClinicHistoryOs = body.cClinicHistory || newOpportunity.cClinicHistory;
      await this.opportunityRepository.update(
        { id: opportunityId },
        { cFacturacionSubEstado: FacturacionSubEstado.ORDEN_SERVICIO_PENDIENTE_FACTURA },
      );
      if (hasClinicHistoryOs && newOpportunity.stage !== Enum_Stage.CIERRE_GANADO) {
        await this.opportunityRepository.update(
          { id: opportunityId },
          { stage: Enum_Stage.CIERRE_GANADO, modifiedAt: new Date() },
        );
        console.log('[updateOpportunityWithFacturas] Etapa actualizada a CIERRE_GANADO (O.S pendiente factura)');
        const updatedOpp = await this.getOneWithEntity(opportunityId);
        if (updatedOpp.assignedUserId) {
          await this.websocketService.notifyOpportunityUpdate(updatedOpp, newOpportunity.stage);
        }
        newOpportunity = updatedOpp as Opportunity;
      }
      const osUpdatedAfter = await this.checkAndUpdateInvoiceStatusForOpportunityServiceOrders(opportunityId);
      if (osUpdatedAfter) {
        newOpportunity = (await this.getOneWithEntity(opportunityId)) as Opportunity;
        console.log('[updateOpportunityWithFacturas] O.S ya facturada; oportunidad recargada');
      }
    }

    console.log('[updateOpportunityWithFacturas] Consultando clinicHistoryCrm en SV...');
    const clinicHistoryCrm = await this.svServices.getPatientSVByEspoId(opportunityId, tokenSv);
    console.log('[updateOpportunityWithFacturas] clinicHistoryCrm', { existe: !!clinicHistoryCrm });

    if(clinicHistoryCrm) {
      let payloadUpdateClinicHistoryCrm: Partial<CreateClinicHistoryCrmDto> = {};
  
      if (onlyAppointment) {
        if(!body.reservationId) throw new BadRequestException('El campo reservationId no puede estar vacío');
        payloadUpdateClinicHistoryCrm.id_reservation = body.reservationId;
        console.log('[updateOpportunityWithFacturas] Actualización CRM: solo cita → id_reservation', body.reservationId);
      } else if (hasMainData && !hasAppointmentData) {
        if(body.cFacturas?.comprobante_soles) {
          const irh = await this.svServices.getIRHByComprobante(body.cFacturas.comprobante_soles, tokenSv);
          payloadUpdateClinicHistoryCrm.id_payment = irh.id;
          console.log('[updateOpportunityWithFacturas] IRH por comprobante_soles', { id: irh.id });
        } else if (body.cFacturas?.comprobante_dolares) {
          const irh = await this.svServices.getIRHByComprobante(body.cFacturas.comprobante_dolares, tokenSv);
          payloadUpdateClinicHistoryCrm.id_payment = irh.id;
          console.log('[updateOpportunityWithFacturas] IRH por comprobante_dolares', { id: irh.id });
        }
  
        const patient = await this.svServices.getPatientByClinicHistory(body.cClinicHistory!, tokenSv);
        payloadUpdateClinicHistoryCrm.patientId = patient.ch_id;
        console.log('[updateOpportunityWithFacturas] Paciente por historia clínica (solo main)', { patientId: patient.ch_id });
      } else if (hasMainData && hasAppointmentData) {
        if(!body.reservationId) throw new BadRequestException('El campo reservationId no puede estar vacío');
  
        if(body.cFacturas?.comprobante_soles) {
          const irh = await this.svServices.getIRHByComprobante(body.cFacturas.comprobante_soles, tokenSv);
          payloadUpdateClinicHistoryCrm.id_payment = irh.id;
          console.log('[updateOpportunityWithFacturas] IRH por comprobante_soles (main+cita)', { id: irh.id });
        } else if (body.cFacturas?.comprobante_dolares) {
          const irh = await this.svServices.getIRHByComprobante(body.cFacturas.comprobante_dolares, tokenSv);
          payloadUpdateClinicHistoryCrm.id_payment = irh.id;
          console.log('[updateOpportunityWithFacturas] IRH por comprobante_dolares (main+cita)', { id: irh.id });
        }
        const patient = await this.svServices.getPatientByClinicHistory(body.cClinicHistory!, tokenSv);
  
        payloadUpdateClinicHistoryCrm.id_reservation = body.reservationId;
        payloadUpdateClinicHistoryCrm.patientId = patient.ch_id;
        console.log('[updateOpportunityWithFacturas] Actualización CRM: main+cita', {
          id_reservation: body.reservationId,
          patientId: patient.ch_id,
        });
      }
  
      if (Object.keys(payloadUpdateClinicHistoryCrm).length > 0) {
        console.log('[updateOpportunityWithFacturas] Actualizando clinicHistoryCrm en SV', payloadUpdateClinicHistoryCrm);
        await this.svServices.updateClinicHistoryCrm(opportunityId, tokenSv, payloadUpdateClinicHistoryCrm);
        console.log('[updateOpportunityWithFacturas] clinicHistoryCrm actualizado en SV');
      } else {
        console.log('[updateOpportunityWithFacturas] Sin campos para actualizar en clinicHistoryCrm, se omite');
      }
    }

    console.log('[updateOpportunityWithFacturas] Fin exitoso', { opportunityId });
    return {
      success: true,
      message: "Opportunity updated successfully",
      opportunity: newOpportunity,
    };
  }

  async countOpBySubcampaign(date: string): Promise<any> {
    const opportunities = await this.opportunityRepository.find({
      where: { deleted: false, cSubCampaignId: Not(IsNull()), createdAt: MoreThanOrEqual(new Date(date)) },
    });

    let OF = 0;
    let APNEA = 0;
    let OI = 0;

    for(const opportunity of opportunities) {
      if(opportunity.cSubCampaignId === CAMPAIGNS_IDS.OFM) {
        OF++;
      } else if(opportunity.cSubCampaignId === CAMPAIGNS_IDS.APNEA) {
        APNEA++;
      } else if(opportunity.cSubCampaignId === CAMPAIGNS_IDS.OI) {
        OI++;
      }
    }

    return {
      'OF': OF,
      'APNEA': APNEA,
      'OI': OI,
    };
  }



  async changeURLOI(opportunityId: string) {
    const opportunity = await this.opportunityRepository.findOne({
      where: { id: opportunityId, deleted: false, assignedUserId: Not(IsNull()) },
      relations: ['assignedUserId'],
    });

    if(!opportunity) {
      throw new  NotFoundException(`Oportunidad con ID ${opportunityId} no encontrada`);
    }

    if(opportunity.cSubCampaignId === CAMPAIGNS_IDS.OI) {
      const cConctionSv = `${this.URL_FRONT_MANAGER_LEADS}manager_leads/treatment_plan/?usuario=${opportunity.assignedUserId!.id}&uuid-opportunity=${opportunity.id}`;

      opportunity.cConctionSv = cConctionSv;
      await this.opportunityRepository.save(opportunity);
    }

    return {
      message: opportunity.campaignId === CAMPAIGNS_IDS.OI ? "URL cambiada correctamente" : "URL no cambiada",
      opportunity,
    };
  }

  async reprograminReservation(opportunityId: string, dataReservation: ReprogramingReservationDto, userId: string) {

    try {

      const user = await this.userService.findOne(userId);

      const {tokenSv} = await this.svServices.getTokenSv(user.cUsersv!, user.cContraseaSv!);

      const clinicHistoryCrm = await this.svServices.getPatientSVByEspoId(opportunityId, tokenSv);

      if(clinicHistoryCrm) {
        await this.svServices.updateClinicHistoryCrm(opportunityId, tokenSv, {
          id_reservation: dataReservation.newReservationId,
        });
      }

      const payload: UpdateOpportunityDto = {
        cAppointment: dataReservation.cAppointment,
        cDateReservation: dataReservation.cDateReservation,
        cDoctor: dataReservation.cDoctor,
        cEnvironment: dataReservation.cEnvironment,
        cSpecialty: dataReservation.cSpecialty,
        cTariff: dataReservation.cTariff,
      }

      const opportunityEspo = await this.update(opportunityId, payload, userId);

      await this.actionHistoryService.addRecord({
        targetId: opportunityEspo.id,
        target_type: ENUM_TARGET_TYPE.OPPORTUNITY,
        userId: userId,
        message: 'Oportunidad actualizada',
      });

      const meeting = await this.meetingService.getByParentName(opportunityEspo.name!);
        
      if(!meeting) {
        throw new NotFoundException("No se encontró la actividad");
      }

      let dateStart = opportunityEspo.cDateReservation;
      let dateEnd = opportunityEspo.cDateReservation;

      const [startTime, endTime] = opportunityEspo.cAppointment!
        .split("-")
        .map((s) => s.trim());
      dateStart = `${opportunityEspo.cDateReservation} ${startTime}:00`;
      dateEnd = `${opportunityEspo.cDateReservation} ${endTime}:00`;

      const payloadUpdateMetting: UpdateMeetingDto = {
        dateStart: new Date(dateStart),
        dateEnd: new Date(dateEnd),
        description: "Reprogramación de reserva",
      }
      
      const updateActivity = await this.meetingService.updateByParentName(opportunityEspo.name!, payloadUpdateMetting);

      await this.actionHistoryService.addRecord({
        targetId: updateActivity.id,
        target_type: ENUM_TARGET_TYPE.MEETING,
        userId: userId,
        message: 'Actividad actualizada',
      });

      return {
        message: "Reserva reprogramada exitosamente",
        newMeeting: updateActivity,
        newOpportunity: opportunityEspo,
      }
      
    } catch (error) {
      console.error('Error en reprogramingReservation:', error);
      throw new Error('Error al reprogramar la reserva');
    }
  }

  async isForRefer(userId: string) {
    const teams = await this.userService.getAllTeamsByUser(userId);

    // Equipos que por sí solos indican team leader (globales)
    const validTeamsGlobal = [
      TEAMS_IDS.TEAM_LEADERS_COMERCIALES,
      TEAMS_IDS.TEAM_OWNER,
      TEAMS_IDS.TEAM_TI,
    ];
    if (validTeamsGlobal.some(t => teams.some(team => team.team_id === t)))
      return true;

    // Equipo Arequipa: solo es "for refer" si tiene rol Team Leader Comercial (no todos los del equipo)
    const isInArequipa = teams.some(team => team.team_id === TEAMS_IDS.TEAM_AREQUIPA);
    if (isInArequipa) {
      const user = await this.userService.findOne(userId);
      const roles = (user as { roles?: { roleId?: string }[] }).roles ?? [];
      const hasTeamLeaderRole = roles.some(
        r => r.roleId === ROLES_IDS.TEAM_LEADER_COMERCIAL,
      );
      return hasTeamLeaderRole;
    }

    return false;
  }

  async getOpportunitiesByPhoneNumber(phoneNumber: string): Promise<Opportunity> {
    const opportunity = await this.opportunityRepository.findOne({
      where: { cNumeroDeTelefono: ILike(`%${phoneNumber}%`), deleted: false },
    });

    if(!opportunity) {
      throw new NotFoundException(`Oportunidad con número de teléfono ${phoneNumber} no encontrada`);
    }

    return opportunity;
  }

  async getOpportunityByClinicHistory(clinicHistory: string) {
    const opportunities = await this.opportunityRepository.find({
      where: { cClinicHistory: clinicHistory, deleted: false },
    });

    if(!opportunities) {
      return [];
    }

    return opportunities;
  }

  async redirectToManager(_usuario: string, opportunityId: string) {
    const opportunity = await this.opportunityRepository.findOne({
      where: { id: opportunityId, deleted: false },
    });
    if (!opportunity) {
      throw new NotFoundException("No se encontró la oportunidad");
    }

    const campaign = await this.campaignService.findOne(opportunity.cSubCampaignId!);

    const historyCLinic = opportunity.cClinicHistory;

    const phoneNumber = opportunity.cNumeroDeTelefono;

    if(!phoneNumber) {
      throw new BadRequestException("No se encontró el número de teléfono");
    }

    let cleanedPhone = phoneNumber.replace(/\(\+\d{1,3}\)\s*/g, '');

    const digits = cleanedPhone.replace(/\D/g, '');

    const localNumber = digits.slice(-9);
    const redirectResponse = await this.svServices.getRedirectByOpportunityId(opportunityId, campaign.name!, localNumber, historyCLinic);
    // Si code es 0, significa que el paciente cumplió todo el flujo (cliente + factura + agendamiento)
    // Entonces actualizamos el estado a Cierre Ganado si aún no lo está
    if (redirectResponse.code === 0 && opportunity.stage !== Enum_Stage.CIERRE_GANADO) {
      await this.opportunityRepository.update(
        { id: opportunityId },
        { 
          stage: Enum_Stage.CIERRE_GANADO,
          modifiedAt: new Date()
        }
      );

      // Notificar por WebSocket si tiene assignedUserId
      const updatedOpportunity = await this.getOneWithEntity(opportunityId);
      if (updatedOpportunity.assignedUserId) {
        await this.websocketService.notifyOpportunityUpdate(updatedOpportunity, opportunity.stage);
      }
    }

    return redirectResponse;
  }


}
