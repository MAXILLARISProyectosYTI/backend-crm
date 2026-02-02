import { Injectable, NotFoundException, Inject, forwardRef, BadRequestException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, IsNull, Like, MoreThanOrEqual, Not, Repository } from 'typeorm';
import { Opportunity } from './opportunity.entity';
import { CreateOpportunityDto } from './dto/create-opportunity.dto';
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
import { CAMPAIGNS_IDS, TEAMS_IDS } from 'src/globals/ids';
import { CreateClinicHistoryCrmDto } from './dto/clinic-history';
import { MeetingService } from 'src/meeting/meeting.service';
import { SvServices } from 'src/sv-services/sv.services';
import { IdGeneratorService } from 'src/common/services/id-generator.service';
import { ActionHistoryService } from 'src/action-history/action-history.service';
import { UserWithTeam } from 'src/user/dto/user-with-team';
import { DateTime } from 'luxon';
import { hasFields, pickFields } from './utils/hasFields';
import { Meeting } from 'src/meeting/meeting.entity';
import { FilesService } from 'src/files/files.service';
import { UpdateMeetingDto } from 'src/meeting/dto/update.dto';
import { ENUM_TARGET_TYPE } from 'src/action-history/dto/enum-target-type';
import { EnumCodeFlow } from './dto/enumCodeManage';
import { CampaignService } from 'src/campaign/campaign.service';

@Injectable()
export class OpportunityService {

  private readonly URL_FRONT_MANAGER_LEADS = process.env.URL_FRONT_MANAGER_LEADS;
  private readonly URL_FILES = process.env.URL_DOWNLOAD_FILES;
  
  constructor(
    @InjectRepository(Opportunity)
    private readonly opportunityRepository: Repository<Opportunity>,
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
  ) {}

  async create(createOpportunityDto: CreateOpportunityDto, userId: string): Promise<Opportunity> {

    let contact: Contact | null = null;

    try {

      const existSamePhoneNumber = await this.existSamePhoneNumber(createOpportunityDto.phoneNumber);

      if(existSamePhoneNumber){
        throw new ConflictException('Ya existe una oportunidad con este número de teléfono');
      }

      const user = await this.userService.findOne(userId);

      const {tokenSv} = await this.svServices.getTokenSv(user.cUsersv!, user.cContraseaSv!);

      const {complete, dataPayment, dataReservation, is_new, patient} = await this.svServices.getPatientIsNew(createOpportunityDto.phoneNumber, tokenSv);

      if(!is_new){
        throw new ConflictException('El paciente ya existe en el sistema vertical');
      }

      // Creamos el contacto
      const payloadContact: CreateContactDto = {
        firstName: createOpportunityDto.name,
        lastName: createOpportunityDto.name,
        phoneNumber: createOpportunityDto.phoneNumber,
      }

      contact = await this.contactService.create(payloadContact);

      // Verificamos si es hora de asignar
      const isTimeToAssign = timeToAssing();

      let userToAssign: User | null = null

      // Asignamos la oportunidad en caso de que sea hora de asignar
      if (isTimeToAssign) {
        userToAssign = await this.userService.getNextUserToAssign(createOpportunityDto.subCampaignId);
      } 

      const today = DateTime.now().setZone("America/Lima").plus({hours: 5}).toJSDate();

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
      }

      // Asignamos el usuario en caso de que sea hora de asignar
      if (userToAssign) {
        payloadOpportunity.assignedUserId = userToAssign;
      } 

      // Agregamos la observación en caso de que exista
      if(createOpportunityDto.observation){
        payloadOpportunity.cObs = createOpportunityDto.observation;
      }

      const opportunity = this.opportunityRepository.create(payloadOpportunity);
      const savedOpportunity = await this.opportunityRepository.save(opportunity);

      const cConctionSv = `${this.URL_FRONT_MANAGER_LEADS}manager_leads/?usuario=${userToAssign?.id}&uuid-opportunity=${savedOpportunity.id}`;

      const newOpportunity = await this.update(savedOpportunity.id, {cConctionSv: cConctionSv}, userId);

      // Contruimos el payload para la tabla intermediaria entre el CRM y el sistema vertical
      const payloadClinicHistory: CreateClinicHistoryCrmDto = {
        espoId: newOpportunity.id,
      }

      // En caso que el ya exista en la SV y pase como oportunidad nueva, actualizamos la oportunidad con los datos del paciente y agreamos el id del paciente en la tabla intermediaria
      if(patient && !complete){
        payloadClinicHistory.patientId = patient.id;

        const rawPayload: UpdateOpportunityDto = {
          cClinicHistory: patient.history,
          cLastNameFather: patient.attorney,
          cCustomerDocumentType: patient.invoise_type_document,
          cCustomerDocument: patient.invoise_num_document,
          cPatientsname: patient.name,
          cPatientsPaternalLastName: patient.lastNameFather,
          cPatientsMaternalLastName: patient.lastNameMother,
          cPatientDocument: patient.documentNumber,
          cPatientDocumentType: 'DNI',
        };
      
        // Filtrar solo atributos con valor
        const payloadToUpdate = Object.entries(rawPayload)
          .filter(([_, value]) => value !== undefined && value !== null && value !== '')
          .reduce((acc, [key, value]) => ({ ...acc, [key]: value }), {});
      
        await this.update(newOpportunity.id, payloadToUpdate, userId);
      }

      // En caso que el paciente ya exista en la SV y pase como oportunidad nueva, y ademas ya marque como completado, actualizamos la oportunidad con el id del paciente en la tabla intermediaria
      if(complete){

        // Contruimos el payload para actualizar la oportunidad con los datos del paciente
        // Construimos con datos de los pagos por que es lo minimo que debe tener
        const payloadUpdateComplete: UpdateOpportunityDto = {
          cClinicHistory: patient.history,
          cLastNameFather: patient.attorney,
          cCustomerDocumentType: patient.invoise_type_document,
          cCustomerDocument: patient.invoise_num_document,
          cPatientsname: patient.name,
          cPatientsPaternalLastName: patient.lastNameFather,
          cPatientsMaternalLastName: patient.lastNameMother,
          cPatientDocument: patient.documentNumber,
          cPatientDocumentType: 'DNI',
        }

        // Agregamos el id del pago y el id del paciente en la tabla intermediaria
        payloadClinicHistory.id_payment = dataPayment.payment_id;
        payloadClinicHistory.patientId = patient.id;

        // En caso que tenga datos de la reserva, actualizamos la oportunidad con los datos de la reserva
        if(dataReservation){
          payloadUpdateComplete.cAppointment = dataReservation.reservation_appointment;
          payloadUpdateComplete.cDateReservation = dataReservation.reservation_date;
          payloadUpdateComplete.cDoctor = dataReservation.doctor_name;
          payloadUpdateComplete.cEnvironment = dataReservation.environment_name;
          payloadUpdateComplete.cSpecialty = dataReservation.specialty_name;
          payloadUpdateComplete.cTariff = dataReservation.tariff_name;

          // Agregamos el id de la reserva en la tabla intermediaria
          payloadClinicHistory.id_reservation = dataReservation.id;
        }

        await this.update(newOpportunity.id, payloadUpdateComplete, userId);
      }


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
      // Eliminamos el contacto en caso de error
      if(contact){
        await this.contactService.softDelete(contact.id);
      }

      throw new BadRequestException(error.message);
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

      const today = DateTime.now().setZone("America/Lima").plus({hours: 5}).toJSDate();

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
    opportunity.modifiedAt = DateTime.now().setZone("America/Lima").plus({hours: 5}).toJSDate();
    opportunity.cConctionSv = `${this.URL_FRONT_MANAGER_LEADS}manager_leads/?usuario=${assignedUserId}&uuid-opportunity=${opportunityId}`;

    await this.actionHistoryService.addRecord({
      targetId: opportunityId,
      target_type: ENUM_TARGET_TYPE.OPPORTUNITY,
      userId: userId,
      message: 'Oportunidad asignada manualmente',
    });

    return await this.opportunityRepository.save(opportunity);

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

  async createWithManualAssign(createOpportunityDto: CreateOpportunityDto, userId: string): Promise<Opportunity> {
    let contact: Contact | null = null;
      
    try {
      
      const existSamePhoneNumber = await this.existSamePhoneNumber(createOpportunityDto.phoneNumber);

      const user = await this.userService.findOne(userId);

      const {tokenSv} = await this.svServices.getTokenSv(user.cUsersv!, user.cContraseaSv!);

      const { is_new, patient, complete, dataReservation, dataPayment } = await this.svServices.getPatientIsNew(createOpportunityDto.phoneNumber, tokenSv);

      if(!is_new){
        throw new ConflictException('El paciente ya existe en el sistema vertical');
      }

      if(existSamePhoneNumber){
        throw new ConflictException('Ya existe una oportunidad con este número de teléfono');
      }
      // Creamos el contacto
      const payloadContact: CreateContactDto = {
        firstName: createOpportunityDto.name,
        lastName: createOpportunityDto.name,
        phoneNumber: createOpportunityDto.phoneNumber,
      }
      contact = await this.contactService.create(payloadContact);

      // Obtenemos el usuario asignado
      const assignedUser = await this.userService.findOne(createOpportunityDto.assignedUserId!);

      const today = DateTime.now().setZone("America/Lima").plus({hours: 5}).toJSDate();

      const payloadOpportunity: Partial<Opportunity> = {
        id: this.idGeneratorService.generateId(),
        name: `${contact.firstName} REF-`,
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
      }

      // Agregamos la observación en caso de que exista
      if(createOpportunityDto.observation){
        payloadOpportunity.cObs = createOpportunityDto.observation;
      }

      const opportunity = this.opportunityRepository.create(payloadOpportunity);

      const savedOpportunity = await this.opportunityRepository.save(opportunity);
      
      const cConctionSv = `${this.URL_FRONT_MANAGER_LEADS}manager_leads/?usuario=${createOpportunityDto.assignedUserId}&uuid-opportunity=${savedOpportunity.id}`;

      const newOpportunity = await this.update(savedOpportunity.id, {cConctionSv: cConctionSv}, userId);

      // Contruimos el payload para la tabla intermediaria entre el CRM y el sistema vertical
      const payloadClinicHistory: CreateClinicHistoryCrmDto = {
        espoId: newOpportunity.id,
      }

      // En caso que el ya exista en la SV y pase como oportunidad nueva, actualizamos la oportunidad con los datos del paciente y agreamos el id del paciente en la tabla intermediaria
      if(patient && !complete){
        payloadClinicHistory.patientId = patient.id;

        const rawPayload: UpdateOpportunityDto = {
          cClinicHistory: patient.history,
          cLastNameFather: patient.attorney,
          cCustomerDocumentType: patient.invoise_type_document,
          cCustomerDocument: patient.invoise_num_document,
          cPatientsname: patient.name,
          cPatientsPaternalLastName: patient.lastNameFather,
          cPatientsMaternalLastName: patient.lastNameMother,
          cPatientDocument: patient.documentNumber,
          cPatientDocumentType: 'DNI',
        };
      
        // Filtrar solo atributos con valor
        const payloadToUpdate = Object.entries(rawPayload)
          .filter(([_, value]) => value !== undefined && value !== null && value !== '')
          .reduce((acc, [key, value]) => ({ ...acc, [key]: value }), {});
      
        await this.update(newOpportunity.id, payloadToUpdate, userId);
      }

      // En caso que el paciente ya exista en la SV y pase como oportunidad nueva, y ademas ya marque como completado, actualizamos la oportunidad con el id del paciente en la tabla intermediaria
      if(complete){

        // Contruimos el payload para actualizar la oportunidad con los datos del paciente
        // Construimos con datos de los pagos por que es lo minimo que debe tener
        const payloadUpdateComplete: UpdateOpportunityDto = {
          cClinicHistory: patient.history,
          cLastNameFather: patient.attorney,
          cCustomerDocumentType: patient.invoise_type_document,
          cCustomerDocument: patient.invoise_num_document,
          cPatientsname: patient.name,
          cPatientsPaternalLastName: patient.lastNameFather,
          cPatientsMaternalLastName: patient.lastNameMother,
          cPatientDocument: patient.documentNumber,
          cPatientDocumentType: 'DNI',
        }

        // Agregamos el id del pago y el id del paciente en la tabla intermediaria
        payloadClinicHistory.id_payment = dataPayment.payment_id;
        payloadClinicHistory.patientId = patient.id;

        // En caso que tenga datos de la reserva, actualizamos la oportunidad con los datos de la reserva
        if(dataReservation){
          payloadUpdateComplete.cAppointment = dataReservation.reservation_appointment;
          payloadUpdateComplete.cDateReservation = dataReservation.reservation_date;
          payloadUpdateComplete.cDoctor = dataReservation.doctor_name;
          payloadUpdateComplete.cEnvironment = dataReservation.environment_name;
          payloadUpdateComplete.cSpecialty = dataReservation.specialty_name;
          payloadUpdateComplete.cTariff = dataReservation.tariff_name;

          // Agregamos el id de la reserva en la tabla intermediaria
          payloadClinicHistory.id_reservation = dataReservation.reservation_id;
        }

        await this.update(newOpportunity.id, payloadUpdateComplete, userId);
      }

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

  async existSamePhoneNumber(phoneNumber: string): Promise<boolean> {
    const response = await this.opportunityRepository.find({
      where: { 
        cNumeroDeTelefono: ILike(`%${phoneNumber}%`), 
        deleted: false 
      },
    });

    if(response.length > 0){
      return true;
    }

    return false;
  }

  async findAll(): Promise<Opportunity[]> {
    return await this.opportunityRepository.find({
      order: { createdAt: 'DESC' },
    });
  }

  async findOneWithDetails(id: string, userId: string) {
    const startTime = Date.now();
    console.log(`[PERFORMANCE] 🔍 findOneWithDetails iniciado para oportunidad: ${id}`);
    
    const opportunityStart = Date.now();
    const opportunity = await this.opportunityRepository.findOne({
      where: { id },
      relations: ['assignedUserId'],
    });

    if (!opportunity) {
      throw new NotFoundException(`Oportunidad con ID ${id} no encontrada`);
    }
    console.log(`[PERFORMANCE] Oportunidad obtenida: ${Date.now() - opportunityStart}ms`);

    // Paralelizar IO (BD) para bajar la latencia total
    const parallelStart = Date.now();
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
          const userStart = Date.now();
          const userAssigned = await this.userService.findOne(opportunity.assignedUserId.id);
          console.log(`[PERFORMANCE] userService.findOne(assignedUserId) tomó: ${Date.now() - userStart}ms`);
          
          const teamsStart = Date.now();
          const teams = await this.userService.getAllTeamsByUser(userAssigned.id);
          console.log(`[PERFORMANCE] getAllTeamsByUser tomó: ${Date.now() - teamsStart}ms`);
          
          return { userAssigned, teams };
        } catch (error) {
          console.error(`[PERFORMANCE] Error en userAssignedData:`, error);
          throw error;
        }
      })(),
      (async () => {
        const opStart = Date.now();
        const result = await this.userService.findOne(userId);
        console.log(`[PERFORMANCE] userService.findOne(userId) tomó: ${Date.now() - opStart}ms`);
        return result;
      })(),
      (async () => {
        const opStart = Date.now();
        const result = await this.meetingService.findByparentIdLess(opportunity.id);
        console.log(`[PERFORMANCE] meetingService.findByparentIdLess tomó: ${Date.now() - opStart}ms`);
        return result;
      })(),
      (async () => {
        const opStart = Date.now();
        const result = await this.actionHistoryService.getRecordByTargetId(opportunity.id);
        console.log(`[PERFORMANCE] actionHistoryService.getRecordByTargetId tomó: ${Date.now() - opStart}ms`);
        return result;
      })(),
      (async () => {
        const opStart = Date.now();
        const result = await this.filesService.findByParentId(opportunity.id);
        console.log(`[PERFORMANCE] filesService.findByParentId tomó: ${Date.now() - opStart}ms`);
        return result;
      })(),
    ]);

    const parallelTime = Date.now() - parallelStart;
    console.log(`[PERFORMANCE] Operaciones paralelas completadas: ${parallelTime}ms`);

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

    const tokenStart = Date.now();
    const {tokenSv} = await this.svServices.getTokenSv(user.cUsersv!, user.cContraseaSv!);
    console.log(`[PERFORMANCE] Token SV obtenido: ${Date.now() - tokenStart}ms`);

    // SV es externo: no debería tumbar el detalle si está lento/intermitente
    let statusClient = false;
    const statusClientStart = Date.now();
    try {
      statusClient = await this.svServices.getStatusClient(opportunity.id, tokenSv);
      console.log(`[PERFORMANCE] StatusClient obtenido: ${Date.now() - statusClientStart}ms`);
    } catch (e: any) {
      // Dejar trazabilidad sin romper el endpoint
      console.warn(`[PERFORMANCE] ⚠️ getStatusClient falló para ${opportunity.id} después de ${Date.now() - statusClientStart}ms: ${e?.message ?? e}`);
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

    const totalTime = Date.now() - startTime;
    console.log(`[PERFORMANCE] ✅ findOneWithDetails completado en ${totalTime}ms para oportunidad: ${id}`);

    return { ...opportunity, dataMeeting: {...meeting}, userAssigned: userAssigned?.userName, campainName: campainName, subCampaignName: subCampaignName, teams: teams, actionHistory: actionHistoryWithFiles, statusClient: statusClient, files: files };
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
      // Excluir campos que empiezan con _ (campos internos)
      if (key.startsWith('_')) return;
      
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
    
    // Actualizar timestamp de modificación
    updateData.modifiedAt = DateTime.now().setZone("America/Lima").plus({hours: 5}).toJSDate();
    
    // Actualizar la entidad directamente y guardar para asegurar que los cambios se reflejen
    Object.assign(opportunity, updateData);
    const savedOpportunity = await this.opportunityRepository.save(opportunity);
    
    // Obtener la oportunidad actualizada con relaciones
    const updatedOpportunity = await this.getOneWithEntity(id);
    
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
    let users: UserWithTeam[] = []
    
    if(isTeamLeader){
      if(teamsUser.some(team => team.team_id === TEAMS_IDS.TEAM_FIORELLA)){
        team = TEAMS_IDS.TEAM_FIORELLA;
      } else if(teamsUser.some(team => team.team_id === TEAMS_IDS.TEAM_MICHELL)){
        team = TEAMS_IDS.TEAM_MICHELL;
      } else if (teamsUser.some(team => team.team_id === TEAMS_IDS.TEAM_VERONICA)){
        team = TEAMS_IDS.TEAM_VERONICA;
      }

      users = await this.userService.getUserByAllTeams([team]);
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
      } else if (isTeamLeader) {
        // Si es team leader, buscar oportunidades de todos los usuarios de su equipo incluyendo al team leader
        const userIds = users.length > 0 ? users.map(user => user.user_id) : [];
        // Incluir al team leader en la lista de usuarios
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
    opportunity.modifiedAt = DateTime.now().setZone("America/Lima").plus({hours: 5}).toJSDate();
    return await this.opportunityRepository.save(opportunity);
  }

  async getLastOpportunityAssigned(subCampaignId: string): Promise<OpportunityWithUser> {
    const opportunity = await this.opportunityRepository
      .createQueryBuilder('o')
      .select([
        'o.id as opportunity_id',
        'o.name as opportunity_name',
        'o.assignedUserId as assigned_user_id',
        'u.userName as assigned_user_user_name',
      ])
      .leftJoin('user', 'u', 'u.id = o.assignedUserId')
      .where('o.assignedUserId IS NOT NULL')
      .andWhere('o.c_sub_campaign_id = :subCampaignId', { subCampaignId })
      .andWhere('o.deleted = false')
      .andWhere('o.name NOT ILIKE :name', { name: '%REF-%' })
      .orderBy('o.createdAt', 'DESC')
      .getRawOne();

    
    return opportunity;
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

  async updateOpportunityWithFacturas(
    opportunityId: string,
    body: UpdateOpportunityProcces,
    userId: string,
  ) {
  
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
  
    // --- Construir payload ---
    let payload: Record<string, any> = {};
  
    if (onlyAppointment) {
      payload = pickFields(appointmentFields, body);
    } else if (hasMainData && !hasAppointmentData) {
      payload = pickFields(mainFields, body);
    } else if (hasMainData && hasAppointmentData) {
      payload = {
        ...pickFields(mainFields, body),
        ...pickFields(appointmentFields, body),
      };
    } else {
      payload = { ...body };
    }

    // Actualizar la oportunidad con los campos del payload
    let newOpportunity = (await this.update(opportunityId, payload, userId)) as Opportunity;

    await this.actionHistoryService.addRecord({
      targetId: newOpportunity.id,
      target_type: ENUM_TARGET_TYPE.OPPORTUNITY,
      userId,
      message: 'Oportunidad actualizada',
    });
    if (onlyAppointment || hasAppointmentData) {
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

      await this.actionHistoryService.addRecord({
        targetId: meetingCreated.id,
        target_type: ENUM_TARGET_TYPE.MEETING,
        userId,
        message: 'Actividad creada',
      });
    }

    const user = await this.userService.findOne(userId);
    const { tokenSv } = await this.svServices.getTokenSv(user.cUsersv!, user.cContraseaSv!);

    if (body.cFacturas && (body.cFacturas.comprobante_dolares || body.cFacturas.comprobante_soles)) {
      await this.downloadFacturasFromURLs(opportunityId, body.cFacturas);
      
      // Si hay facturas, marcar is_presaved = false (ya no está preguardado, está facturado)
      await this.opportunityRepository.update(
        { id: opportunityId },
        { isPresaved: false }
      );

      // Si hay facturas Y hay historia clínica (paciente creado), marcar como cierre ganado
      // Verificar si el paciente está creado (cClinicHistory en el body o ya en la oportunidad)
      const hasClinicHistory = body.cClinicHistory || newOpportunity.cClinicHistory;
      if (hasClinicHistory && newOpportunity.stage !== Enum_Stage.CIERRE_GANADO) {
        await this.opportunityRepository.update(
          { id: opportunityId },
          { 
            stage: Enum_Stage.CIERRE_GANADO,
            modifiedAt: DateTime.now().setZone("America/Lima").plus({hours: 5}).toJSDate()
          }
        );

        // Notificar por WebSocket si tiene assignedUserId
        const updatedOpportunity = await this.getOneWithEntity(opportunityId);
        if (updatedOpportunity.assignedUserId) {
          await this.websocketService.notifyOpportunityUpdate(updatedOpportunity, newOpportunity.stage);
        }

        // Actualizar newOpportunity para retornar el estado actualizado
        newOpportunity = updatedOpportunity as Opportunity;
      }
    }

    const clinicHistoryCrm = await this.svServices.getPatientSVByEspoId(opportunityId, tokenSv);

    if(clinicHistoryCrm) {
      let payloadUpdateClinicHistoryCrm: Partial<CreateClinicHistoryCrmDto> = {};
  
      if (onlyAppointment) {
        if(!body.reservationId) throw new BadRequestException('El campo reservationId no puede estar vacío');
        payloadUpdateClinicHistoryCrm.id_reservation = body.reservationId;
      } else if (hasMainData && !hasAppointmentData) {
        if(body.cFacturas?.comprobante_soles) {
          const irh = await this.svServices.getIRHByComprobante(body.cFacturas.comprobante_soles, tokenSv);
          payloadUpdateClinicHistoryCrm.id_payment = irh.id;
        } else if (body.cFacturas?.comprobante_dolares) {
          const irh = await this.svServices.getIRHByComprobante(body.cFacturas.comprobante_dolares, tokenSv);
          payloadUpdateClinicHistoryCrm.id_payment = irh.id;
        }
  
        const patient = await this.svServices.getPatientByClinicHistory(body.cClinicHistory!, tokenSv);
        payloadUpdateClinicHistoryCrm.patientId = patient.ch_id;
      } else if (hasMainData && hasAppointmentData) {
        if(!body.reservationId) throw new BadRequestException('El campo reservationId no puede estar vacío');
  
        if(body.cFacturas?.comprobante_soles) {
          const irh = await this.svServices.getIRHByComprobante(body.cFacturas.comprobante_soles, tokenSv);
          payloadUpdateClinicHistoryCrm.id_payment = irh.id;
        } else if (body.cFacturas?.comprobante_dolares) {
          const irh = await this.svServices.getIRHByComprobante(body.cFacturas.comprobante_dolares, tokenSv);
          payloadUpdateClinicHistoryCrm.id_payment = irh.id;
        }
        const patient = await this.svServices.getPatientByClinicHistory(body.cClinicHistory!, tokenSv);
  
        payloadUpdateClinicHistoryCrm.id_reservation = body.reservationId;
        payloadUpdateClinicHistoryCrm.patientId = patient.ch_id;
      }
  
      if (Object.keys(payloadUpdateClinicHistoryCrm).length > 0) {
        await this.svServices.updateClinicHistoryCrm(opportunityId, tokenSv, payloadUpdateClinicHistoryCrm);
      }
    }

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
  
    const validTeams = [
      TEAMS_IDS.TEAM_LEADERS_COMERCIALES,
      TEAMS_IDS.TEAM_OWNER,
      TEAMS_IDS.TEAM_TI,
    ];

    const teams = await this.userService.getAllTeamsByUser(userId);
  
    return validTeams.some(validTeam => teams.some(team => team.team_id === validTeam));
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
    console.log('opportunity', opportunity);
    if (!opportunity) {
      throw new NotFoundException("No se encontró la oportunidad");
    }

    const campaign = await this.campaignService.findOne(opportunity.cSubCampaignId!);
    console.log('campaign', campaign);

    const historyCLinic = opportunity.cClinicHistory;

    const phoneNumber = opportunity.cNumeroDeTelefono;

    if(!phoneNumber) {
      throw new BadRequestException("No se encontró el número de teléfono");
    }

    let cleanedPhone = phoneNumber.replace(/\(\+\d{1,3}\)\s*/g, '');

    const digits = cleanedPhone.replace(/\D/g, '');

    const localNumber = digits.slice(-9);
    console.log('/** *//** *//** *//** *//** *//** *//** *//** *//** *//** *//** *//** *//** *//** *//** */');
    const redirectResponse = await this.svServices.getRedirectByOpportunityId(opportunityId, campaign.name!, localNumber, historyCLinic);
    console.log('redirectResponse', redirectResponse);
    // Si code es 0, significa que el paciente cumplió todo el flujo (cliente + factura + agendamiento)
    // Entonces actualizamos el estado a Cierre Ganado si aún no lo está
    if (redirectResponse.code === 0 && opportunity.stage !== Enum_Stage.CIERRE_GANADO) {
      await this.opportunityRepository.update(
        { id: opportunityId },
        { 
          stage: Enum_Stage.CIERRE_GANADO,
          modifiedAt: DateTime.now().setZone("America/Lima").plus({hours: 5}).toJSDate()
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
