import { Injectable, NotFoundException, Inject, forwardRef, BadRequestException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, IsNull, Like, MoreThanOrEqual, Not, Repository } from 'typeorm';
import { Opportunity } from './opportunity.entity';
import { CreateOpportunityDto } from './dto/create-opportunity.dto';
import { UpdateOpportunityDto } from './dto/update-opportunity.dto';
import { OpportunityWebSocketService } from './opportunity-websocket.service';
import { ContactService } from 'src/contact/contact.service';
import { CreateContactDto } from 'src/contact/dto/create-contact.dto';
import { timeToAssing } from './utils/timeToAssing';
import { OpportunityWithUser } from './dto/opportunity-with-user';
import { User } from 'src/user/user.entity';
import { UserService } from 'src/user/user.service';
import { Enum_Following, Enum_Stage } from './dto/enums';
import { Contact } from 'src/contact/contact.entity';
import { CAMPAIGNS_IDS } from 'src/globals/ids';
import axios from 'axios';
import { CreateClinicHistoryCrmDto } from './dto/clinic-history';
import { MeetingService } from 'src/meeting/meeting.service';
import { SvServices } from 'src/sv-services/sv.services';
import { IdGeneratorService } from 'src/common/services/id-generator.service';

@Injectable()
export class OpportunityService {

  private readonly URL_FRONT_MANAGER_LEADS = process.env.URL_FRONT_MANAGER_LEADS;
  // private readonly URL_BACK_SV = process.env.URL_BACK_SV;
  
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
  ) {}

  async create(createOpportunityDto: CreateOpportunityDto, files: Express.Multer.File[]): Promise<Opportunity> {

    let contact: Contact | null = null;

    try {

      const existSamePhoneNumber = await this.existSamePhoneNumber(createOpportunityDto.phoneNumber);

      if(existSamePhoneNumber){
        throw new ConflictException('Ya existe una oportunidad con este número de teléfono');
      }

      const {complete, dataPayment, dataReservation, is_new, patient} = await this.svServices.getPatientIsNew(createOpportunityDto.phoneNumber);

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

      const today = new Date().toISOString().split("T")[0];

      const payloadOpportunity: Partial<Opportunity> = {
        id: this.idGeneratorService.generateId(),
        name: contact.firstName + ' ' + contact.lastName,
        cNumeroDeTelefono: createOpportunityDto.phoneNumber,
        closeDate: new Date(today),
        stage: Enum_Stage.GESTION_INICIAL,
        cCampaign: createOpportunityDto.campaignId,
        cSubCamping: createOpportunityDto.subCampaignId,
        cCanal: createOpportunityDto.channel,
        contactId: contact.id,
        cSeguimientocliente: Enum_Following.SIN_SEGUIMIENTO,
      }

      // Asignamos el usuario en caso de que sea hora de asignar
      if (userToAssign) {
        payloadOpportunity.assignedUserId = userToAssign.id;
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

      await this.svServices.createClinicHistoryCrm(payloadClinicHistory);      

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
      const opportunity = await this.findOne(opportunityId);

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

      const today = new Date().toISOString().split("T")[0];

      const payloadOpportunity: Partial<Opportunity> = {
        id: this.idGeneratorService.generateId(),
        name: nextRefName,
        closeDate: new Date(today),
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

      const cConctionSv = `${this.URL_FRONT_MANAGER_LEADS}manager_leads/?usuario=${opportunity.assignedUserId}&uuid-opportunity=${savedOpportunity.id}`;

      const newOpportunity = await this.update(savedOpportunity.id, {cConctionSv: cConctionSv});

      const payloadClinicHistory: CreateClinicHistoryCrmDto = {
        espoId: newOpportunity.id,
      }

      await this.svServices.createClinicHistoryCrm(payloadClinicHistory);

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

    const opportunity = await this.findOne(opportunityId);

    if(!opportunity){
      throw new NotFoundException(`Oportunidad con ID ${opportunityId} no encontrada`);
    }

    await this.websocketService.notifyOpportunityUpdate(opportunity, opportunity.stage);

    opportunity.assignedUserId = assignedUserId;
    opportunity.modifiedAt = new Date();
    opportunity.cConctionSv = `${this.URL_FRONT_MANAGER_LEADS}manager_leads/?usuario=${assignedUserId}&uuid-opportunity=${opportunityId}`;
    return await this.opportunityRepository.save(opportunity);

  }

  async countOpportunitiesAssignedBySubcampaign(date: string) {
    const allOpportunities = await this.opportunityRepository.find({
      where: {assignedUserId: Not(IsNull()), createdAt: MoreThanOrEqual(new Date(date)), deleted: false },
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
  }

  async createWithManualAssign(createOpportunityDto: CreateOpportunityDto): Promise<Opportunity> {
    let contact: Contact | null = null;

    try {
      
      const existSamePhoneNumber = await this.existSamePhoneNumber(createOpportunityDto.phoneNumber);

      const { is_new, patient, complete, dataReservation, dataPayment } = await this.svServices.getPatientIsNew(createOpportunityDto.phoneNumber);

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

      const today = new Date().toISOString().split("T")[0];

      const payloadOpportunity: Partial<Opportunity> = {
        id: this.idGeneratorService.generateId(),
        name: contact.firstName + ' ' + contact.lastName,
        cNumeroDeTelefono: createOpportunityDto.phoneNumber,
        closeDate: new Date(today),
        stage: Enum_Stage.GESTION_INICIAL,
        cCampaign: createOpportunityDto.campaignId,
        cSubCamping: createOpportunityDto.subCampaignId,
        cCanal: createOpportunityDto.channel,
        contactId: contact.id,
        cSeguimientocliente: Enum_Following.SIN_SEGUIMIENTO,
        assignedUserId: createOpportunityDto.assignedUserId,
      }

      // Agregamos la observación en caso de que exista
      if(createOpportunityDto.observation){
        payloadOpportunity.cObs = createOpportunityDto.observation;
      }

      const opportunity = this.opportunityRepository.create(payloadOpportunity);

      const savedOpportunity = await this.opportunityRepository.save(opportunity);

      const cConctionSv = `${this.URL_FRONT_MANAGER_LEADS}manager_leads/?usuario=${createOpportunityDto.assignedUserId}&uuid-opportunity=${savedOpportunity.id}`;

      const newOpportunity = await this.update(savedOpportunity.id, {cConctionSv: cConctionSv});

      console.log('SAVED OPPORTUNITY', newOpportunity);

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

      await this.svServices.createClinicHistoryCrm(payloadClinicHistory);

      console.log('SALIO DE LA TABLA INTERMEDIA');

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

  async findOne(id: string) {
    const opportunity = await this.opportunityRepository.findOne({
      where: { id },
    });

    if (!opportunity) {
      throw new NotFoundException(`Oportunidad con ID ${id} no encontrada`);
    }

    const userAssigned = await this.userService.findOne(opportunity.assignedUserId!);

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

    return { ...opportunity, dataMeeting: {...meeting}, userAssigned: userAssigned.userName, campainName: campainName, subCampaignName: subCampaignName };
  }

  async update(id: string, updateOpportunityDto: UpdateOpportunityDto): Promise<Opportunity> {
    const opportunity = await this.findOne(id);
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
    
    // Notificar por WebSocket si tiene assignedUserId
    if (updatedOpportunity.assignedUserId) {
      await this.websocketService.notifyOpportunityUpdate(updatedOpportunity, previousStage);
    }
    
    return updatedOpportunity;
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
      await this.websocketService.notifyOpportunityDeleted(opportunity.assignedUserId, id);
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

  async findByAssignedUser(assignedUserId: string): Promise<Opportunity[]> {
    return await this.opportunityRepository.find({
      where: { assignedUserId, deleted: false },
      order: { createdAt: 'DESC' },
    });
  }

  async findActiveOpportunities(): Promise<Opportunity[]> {
    return await this.opportunityRepository.find({
      where: { deleted: false },
      order: { createdAt: 'DESC' },
    });
  }

  async softDelete(id: string): Promise<Opportunity> {
    const opportunity = await this.findOne(id);
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
      .andWhere('o.cSubCampaignId = :subCampaignId', { subCampaignId })
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

}
