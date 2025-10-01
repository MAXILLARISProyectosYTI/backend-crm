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
import { addHours, hasFields, pickFields } from './utils/hasFields';
import { Meeting } from 'src/meeting/meeting.entity';
import { FilesService } from 'src/files/files.service';

@Injectable()
export class OpportunityService {

  private readonly URL_FRONT_MANAGER_LEADS = process.env.URL_FRONT_MANAGER_LEADS;
  private readonly URL_FILES = process.env.URL_FILES;
  
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
  ) {}

  async create(createOpportunityDto: CreateOpportunityDto, userId: string): Promise<Opportunity> {

    let contact: Contact | null = null;

    try {

      const existSamePhoneNumber = await this.existSamePhoneNumber(createOpportunityDto.phoneNumber);

      if(existSamePhoneNumber){
        throw new ConflictException('Ya existe una oportunidad con este número de teléfono');
      }

      const user = await this.userService.findOne(userId);

      const tokenSv = await this.svServices.getTokenSv(user.cUsersv!, user.cContraseaSv!);

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
        userToAssign = await this.userService.getNextUserToAssign(createOpportunityDto.campaignId);
      } 

      const today = DateTime.now().setZone("America/Lima").toJSDate();

      const payloadOpportunity: Partial<Opportunity> = {
        id: this.idGeneratorService.generateId(),
        name: contact.firstName,
        cNumeroDeTelefono: createOpportunityDto.phoneNumber,
        closeDate: today,
        createdAt: today,
        stage: Enum_Stage.GESTION_INICIAL,
        cCampaign: createOpportunityDto.campaignId,
        cSubCamping: createOpportunityDto.subCampaignId,
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

      const newOpportunity = await this.update(savedOpportunity.id, {cConctionSv: cConctionSv});

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
      
        await this.update(newOpportunity.id, payloadToUpdate);
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
        payloadClinicHistory.id_payment = dataPayment.id;
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

        await this.update(newOpportunity.id, payloadUpdateComplete);
      }


      await this.svServices.createClinicHistoryCrm(payloadClinicHistory, tokenSv);   
      
      // await this.svServices.uploadFiles(newOpportunity.id, 'os',  files, tokenSv);

      // Notificar por WebSocket si tiene assignedUserId
      if (newOpportunity.assignedUserId) {
        await this.websocketService.notifyNewOpportunity(newOpportunity);
      }

      return newOpportunity;

    } catch (error) {
      // Eliminamos el contacto en caso de error
      if(contact){
        await this.contactService.softDelete(contact.id);
      }

      throw new BadRequestException(error.message);
    }
  }

  async createWithSamePhoneNumber(opportunityId: string){
    try {
      const opportunity = await this.getOneWithEntity(opportunityId);

      if(!opportunity){
        throw new NotFoundException(`Oportunidad con ID ${opportunityId} no encontrada`);
      }      

      const opportunities = await this.getOpportunityByName(opportunity.name || '');

      const refRegex = / REF(\d+)$/;
      const baseName = opportunity.name!.replace(refRegex, '');

      let nextRefName: string;

      if (opportunities.length === 1) {
        // Si solo hay una oportunidad, significa que solo existe la original, asignar REF2
        nextRefName = `${baseName} REF2`;
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
        nextRefName = `${baseName} REF${nextRef}`;
      }

      const today = DateTime.now().setZone("America/Lima").toJSDate();

      const payloadOpportunity: Partial<Opportunity> = {
        id: this.idGeneratorService.generateId(),
        name: nextRefName,
        closeDate: today,
        createdAt: today,
        cNumeroDeTelefono: opportunity.cNumeroDeTelefono,
        stage: Enum_Stage.CIERRE_GANADO,
        cCampaign: opportunity.cCampaign,
        cSubCampaignId: opportunity.cSubCampaignId,
        cCanal: opportunity.cCanal,
        contactId: opportunity.contactId,
        cSeguimientocliente: Enum_Following.EN_SEGUIMIENTO,
        assignedUserId: opportunity.assignedUserId,
      }
      
      const opportunityCreated = this.opportunityRepository.create(payloadOpportunity);
      const savedOpportunity = await this.opportunityRepository.save(opportunityCreated);

      const cConctionSv = `${this.URL_FRONT_MANAGER_LEADS}manager_leads/?usuario=${opportunity.assignedUserId!.id}&uuid-opportunity=${savedOpportunity.id}`;

      const newOpportunity = await this.update(savedOpportunity.id, {cConctionSv: cConctionSv});

      const payloadClinicHistory: CreateClinicHistoryCrmDto = {
        espoId: newOpportunity.id,
      }

      const tokenSv = await this.svServices.getTokenSv(opportunity.assignedUserId!.cUsersv!, opportunity.assignedUserId!.cContraseaSv!);

      await this.svServices.createClinicHistoryCrm(payloadClinicHistory, tokenSv);

      // Notificar por WebSocket si tiene assignedUserId
      if (newOpportunity.assignedUserId) {
        await this.websocketService.notifyNewOpportunity(newOpportunity);
      }

      return newOpportunity;

    } catch (error) {
      throw new BadRequestException(error.message);
    }
  }

  async assingManual(opportunityId: string, assignedUserId: string): Promise<Opportunity> {

    const opportunity = await this.getOneWithEntity(opportunityId);

    if(!opportunity){
      throw new NotFoundException(`Oportunidad con ID ${opportunityId} no encontrada`);
    }

    const user = await this.userService.findOne(assignedUserId);

    await this.websocketService.notifyOpportunityUpdate(opportunity, opportunity.stage);

    opportunity.assignedUserId = user;
    opportunity.modifiedAt = new Date();
    opportunity.cConctionSv = `${this.URL_FRONT_MANAGER_LEADS}manager_leads/?usuario=${assignedUserId}&uuid-opportunity=${opportunityId}`;
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

      const tokenSv = await this.svServices.getTokenSv(user.cUsersv!, user.cContraseaSv!);

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

      const today = DateTime.now().setZone("America/Lima").toJSDate();

      const payloadOpportunity: Partial<Opportunity> = {
        id: this.idGeneratorService.generateId(),
        name: contact.firstName,
        createdAt: today,
        cNumeroDeTelefono: createOpportunityDto.phoneNumber,
        closeDate: today,
        stage: Enum_Stage.GESTION_INICIAL,
        cCampaign: createOpportunityDto.campaignId,
        cSubCamping: createOpportunityDto.subCampaignId,
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

      const newOpportunity = await this.update(savedOpportunity.id, {cConctionSv: cConctionSv});

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
      
        await this.update(newOpportunity.id, payloadToUpdate);
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
        payloadClinicHistory.id_payment = dataPayment.id;
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

        await this.update(newOpportunity.id, payloadUpdateComplete);
      }

      await this.svServices.createClinicHistoryCrm(payloadClinicHistory, tokenSv);

      // Notificar por WebSocket si tiene assignedUserId
      if (newOpportunity.assignedUserId) {
        await this.websocketService.notifyNewOpportunity(newOpportunity);
      }

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
    const opportunity = await this.opportunityRepository.findOne({
      where: { id },
      relations: ['assignedUserId'],
    });

    if (!opportunity) {
      throw new NotFoundException(`Oportunidad con ID ${id} no encontrada`);
    }

    const userAssigned = await this.userService.findOne(opportunity.assignedUserId!.id);
    const user = await this.userService.findOne(userId);

    const meeting = await this.meetingService.findOneByparentIdLess(opportunity.id);

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

    const teams = await this.userService.getAllTeamsByUser(userAssigned.id);

    const actionHistory = await this.actionHistoryService.getRecordByTargetId(opportunity.id);

    const tokenSv = await this.svServices.getTokenSv(user.cUsersv!, user.cContraseaSv!);

    const statusClient = await this.svServices.getStatusClient(opportunity.id, tokenSv);

    const files = await this.filesService.findByParentId(opportunity.id);

    return { ...opportunity, dataMeeting: {...meeting}, userAssigned: userAssigned.userName, campainName: campainName, subCampaignName: subCampaignName, teams: teams, actionHistory: actionHistory, statusClient: statusClient, files: files };
  }

  async update(id: string, updateOpportunityDto: UpdateOpportunityDto): Promise<Opportunity> {

    const opportunity = await this.getOneWithEntity(id);

    const previousStage = opportunity.stage; // Guardar etapa anterior para comparación

    // Actualizar solo los campos que están presentes en el DTO (no undefined)
    Object.keys(updateOpportunityDto).forEach(key => {
      const value = updateOpportunityDto[key as keyof UpdateOpportunityDto];
      if (value !== undefined) {
        (opportunity as any)[key] = value;
      }
    });
    
    // Actualizar timestamp de modificación
    opportunity.modifiedAt = new Date();
    
    const updatedOpportunity = await this.opportunityRepository.save(opportunity);

    const newOpportunity = await this.getOneWithEntity(updatedOpportunity.id);
    
    // Notificar por WebSocket si tiene assignedUserId
    if (newOpportunity.assignedUserId) {
      await this.websocketService.notifyOpportunityUpdate(newOpportunity, previousStage);
    }
    
    return newOpportunity;
  }

  async remove(id: string): Promise<void> {
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
    assignedUserId: string, 
    page: number = 1, 
    limit: number = 10,
    search?: string
  ): Promise<{ opportunities: Opportunity[], total: number, page: number, totalPages: number }> {

    const teamsUser = await this.userService.getAllTeamsByUser(assignedUserId);

    const isAdmin = await this.userService.isAdmin(assignedUserId);

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

    if (isTIorOwner || isAdmin) {
      // Si es TI o Owner, no aplicar ningún filtro de usuario (ve todas las oportunidades)
      // Solo mantiene el filtro de deleted = false que ya está aplicado
    } else if (isTeamLeader && users.length > 0) {
      // Si es team leader, buscar oportunidades de todos los usuarios de su equipo
      const userIds = users.map(user => user.user_id);
      queryBuilder.andWhere('opportunity.assignedUserId IN (:...userIds)', { userIds });
    } else {
      // Si no es team leader ni TI/Owner, solo ver sus propias oportunidades
      queryBuilder.andWhere('opportunity.assignedUserId = :assignedUserId', { assignedUserId });
    }

    if (search && search.trim()) {
      // Si hay búsqueda, agregar condiciones OR para búsqueda
      queryBuilder.andWhere(
        '(opportunity.name ILIKE :search OR opportunity.cNumeroDeTelefono ILIKE :search OR opportunity.cClinicHistory ILIKE :search OR user.user_name ILIKE :search)',
        { search: `%${search.trim()}%` }
      );
    }

    // Usar ordenamiento con dos campos: primero por seguimiento (DESC para que "Sin Seguimiento" venga primero), luego por fecha
    const [opportunities, total] = await queryBuilder
      .addOrderBy('opportunity.cSeguimientocliente', 'DESC') // "Sin Seguimiento" viene antes que "En seguimiento" al ordenar DESC
      .addOrderBy('opportunity.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

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
      .andWhere('o.c_sub_camping = :subCampaignId', { subCampaignId })
      .andWhere('o.deleted = false')
      .andWhere('o.name NOT ILIKE :name', { name: '%REF%' })
      .orderBy('o.createdAt', 'DESC')
      .getRawOne();

    if (!opportunity) {
      throw new NotFoundException('No hay oportunidades asignadas');
    }
    
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
    return await this.opportunityRepository.find({
      where: { assignedUserId: IsNull() },
      order: { createdAt: 'DESC' },
    });
  }

  async getOpportunitiesNotReaction(): Promise<Opportunity[]> {
    return await this.opportunityRepository.find({
      where: { cSeguimientocliente: Enum_Following.SIN_SEGUIMIENTO, assignedUserId: Not(IsNull()), deleted: false, cSubCampaignId: Not(IsNull()) },
      order: { createdAt: 'DESC' },
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

    const tokenSv = await this.svServices.getTokenSv(user.cUsersv!, user.cContraseaSv!);

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
  private extractComprobantePath(url: string): string {
    const comprobantesIndex = url.indexOf('Comprobantes/');
    if (comprobantesIndex === -1) {
      throw new Error(`No se encontró "Comprobantes/" en la URL: ${url}`);
    }
    return url.substring(comprobantesIndex);
  }

  /**
   * Descarga las facturas desde URLs y las guarda en la base de datos
   * @param opportunityId ID de la oportunidad
   * @param cFacturas Objeto con las URLs de las facturas
   * @returns Array con los IDs de los archivos guardados
   */
  private async downloadFacturasFromURLs(
    opportunityId: string,
    cFacturas: { comprobante_soles: string | null; comprobante_dolares: string | null },
  ): Promise<{ comprobante_soles?: number; comprobante_dolares?: number }> {
    const downloadedFiles: { comprobante_soles?: number; comprobante_dolares?: number } = {};

    try {
      // Descargar comprobante en soles si existe
      if (cFacturas.comprobante_soles) {
        const comprobantePath = this.extractComprobantePath(cFacturas.comprobante_soles);
        const newUrl = `${this.URL_FILES}/${comprobantePath}`; 
        
        const response = await fetch(newUrl);
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        
        const fileName = `comprobante_soles_${opportunityId}.pdf`;
        const result = await this.filesService.createFileRecord(
          opportunityId,
          'opportunities',
          fileName,
          buffer
        );
        downloadedFiles.comprobante_soles = result.id;
      }

      // Descargar comprobante en dólares si existe
      if (cFacturas.comprobante_dolares) {
        const comprobantePath = this.extractComprobantePath(cFacturas.comprobante_dolares);
        const newUrl = `${this.URL_FILES}/${comprobantePath}`; 
        
        const response = await fetch(newUrl);
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        
        const fileName = `comprobante_dolares_${opportunityId}.pdf`;
        const result = await this.filesService.createFileRecord(
          opportunityId,
          'opportunities',
          fileName,
          buffer
        );
        downloadedFiles.comprobante_dolares = result.id;
      }

      return downloadedFiles;
    } catch (error) {
      console.error('Error al descargar facturas:', error);
      throw error;
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
      "cLastNameMother",
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
    const onlyAppointment =
      hasFields(appointmentFields, body) && !hasFields(mainFields, body);
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
      payload = { ...body }; // Fallback
    }

    const newOpportunity = (await this.update(
      opportunityId,
      payload,       
    )) as Opportunity;

    if (onlyAppointment || hasAppointmentData) {
      let dateStart = newOpportunity.cDateReservation;
      let dateEnd = newOpportunity.cDateReservation;
      let duration = 60;
      const [startTime, endTime] = newOpportunity.cAppointment!
        .split("-")
        .map((s) => s.trim());
      dateStart = `${newOpportunity.cDateReservation} ${startTime}:00`;
      dateEnd = `${newOpportunity.cDateReservation} ${endTime}:00`;
      // Calcular duración en minutos
      const [startHour, startMinute] = startTime.split(":").map(Number);
      const [endHour, endMinute] = endTime.split(":").map(Number);
      duration = endHour * 60 + endMinute - (startHour * 60 + startMinute);

      dateStart = addHours(dateStart, 5);
      dateEnd = addHours(dateEnd, 5);

      const payload: Partial<Meeting> = {
        id: this.idGeneratorService.generateId(),
        name: 'Creacion de reserva',
        status: 'Planned',
        description: 'Creacion de reserva',
        parentId: opportunityId,
        parentType: 'Opportunity',
        dateStart: new Date(dateStart),
        dateEnd: new Date(dateEnd),
        assignedUserId: newOpportunity.assignedUserId!.id,
      };

      await this.meetingService.create(payload);

    }

    if(body.cFacturas && (body.cFacturas.comprobante_dolares || body.cFacturas.comprobante_soles)) {
      await this.downloadFacturasFromURLs(opportunityId, body.cFacturas);
    }

    const user = await this.userService.findOne(userId);
    const tokenSv = await this.svServices.getTokenSv(user.cUsersv!, user.cContraseaSv!);

    const clinicHistoryCrm = await this.svServices.getPatientSVByEspoId(opportunityId, tokenSv);  

    if(clinicHistoryCrm) {
      let payloadUpdateClinicHistoryCrm: Partial<CreateClinicHistoryCrmDto> = {};
  
      if (onlyAppointment) {
  
        if(!body.reservationId) {
          throw new BadRequestException('El campo reservationId no puede estar vacío');
        }
        // Solo datos de cita
        payloadUpdateClinicHistoryCrm.id_reservation = body.reservationId;
  
      } else if (hasMainData && !hasAppointmentData) {
        // Solo datos principales


        if(body.cFacturas && body.cFacturas.comprobante_soles) {
          const irh = await this.svServices.getIRHByComprobante(body.cFacturas.comprobante_soles, tokenSv);
          payloadUpdateClinicHistoryCrm.id_payment = irh.id;
        } else if(body.cFacturas && body.cFacturas.comprobante_dolares) {
          const irh = await this.svServices.getIRHByComprobante(body.cFacturas.comprobante_dolares, tokenSv);
          payloadUpdateClinicHistoryCrm.id_payment = irh.id;
        }
  
        const patient = await this.svServices.getPatientByClinicHistory(body.cClinicHistory!, tokenSv);
  
        payloadUpdateClinicHistoryCrm.patientId = patient.ch_id;
  
      } else if (hasMainData && hasAppointmentData) {
        if(!body.reservationId) {
          throw new BadRequestException('El campo reservationId no puede estar vacío');
        }
        // Ambos tipos de datos
        if(body.cFacturas && body.cFacturas.comprobante_soles) {
          const irh = await this.svServices.getIRHByComprobante(body.cFacturas.comprobante_soles, tokenSv);
          payloadUpdateClinicHistoryCrm.id_payment = irh.id;
        } else if(body.cFacturas && body.cFacturas.comprobante_dolares) {
          const irh = await this.svServices.getIRHByComprobante(body.cFacturas.comprobante_dolares, tokenSv);
          payloadUpdateClinicHistoryCrm.id_payment = irh.id;
        }
        const patient = await this.svServices.getPatientByClinicHistory(body.cClinicHistory!, tokenSv);
  
        payloadUpdateClinicHistoryCrm.id_reservation = body.reservationId;
        payloadUpdateClinicHistoryCrm.patientId = patient.ch_id;
      }
  
      // Solo actualizar si hay campos en el payload
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

  async reassignOpportunitiesManual(opportunityId: string, newUserId: string) {
    const opportunity = await this.opportunityRepository.findOne({
      where: { id: opportunityId, deleted: false, assignedUserId: Not(IsNull()) },
    });

    if(!opportunity) {
      throw new NotFoundException(`Oportunidad con ID ${opportunityId} no encontrada`);
    }

    const nextUserAssigned = await this.userService.findOne(newUserId);

    if(!nextUserAssigned) {
      throw new NotFoundException(`No se pudo obtener el siguiente usuario a asignar`);
    }

    opportunity.assignedUserId = nextUserAssigned;
    opportunity.cConctionSv = `${this.URL_FRONT_MANAGER_LEADS}manager_leads/?usuario=${newUserId}&uuid-opportunity=${opportunityId}`;
    return await this.opportunityRepository.save(opportunity);
  }

  async changeURLOI(opportunityId: string) {
    const opportunity = await this.opportunityRepository.findOne({
      where: { id: opportunityId, deleted: false, assignedUserId: Not(IsNull()) },
    });

    if(!opportunity) {
      throw new NotFoundException(`Oportunidad con ID ${opportunityId} no encontrada`);
    }

    if(opportunity.cSubCampaignId === CAMPAIGNS_IDS.OI) {
      const cConctionSv = `${this.URL_FRONT_MANAGER_LEADS}manager_leads/treatment_plan/?usuario=${opportunity.assignedUserId}&uuid-opportunity=${opportunity.id}`;

      opportunity.cConctionSv = cConctionSv;
      await this.opportunityRepository.save(opportunity);
    }

    return {
      message: opportunity.campaignId === CAMPAIGNS_IDS.OI ? "URL cambiada correctamente" : "URL no cambiada",
      opportunity,
    };
  }
}
