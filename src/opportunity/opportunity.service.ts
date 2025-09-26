import { Injectable, NotFoundException, Inject, forwardRef, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Not, Repository } from 'typeorm';
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
import { Enum_Following } from './dto/enums';
import { Contact } from 'src/contact/contact.entity';

@Injectable()
export class OpportunityService {

  private readonly URL_FRONT_MANAGER_LEADS = process.env.URL_FRONT_MANAGER_LEADS;

  constructor(
    @InjectRepository(Opportunity)
    private readonly opportunityRepository: Repository<Opportunity>,
    private readonly websocketService: OpportunityWebSocketService,
    private readonly contactService: ContactService,
    @Inject(forwardRef(() => UserService))
    private readonly userService: UserService,
  ) {}

  async create(createOpportunityDto: CreateOpportunityDto): Promise<Opportunity> {

    let contact: Contact | null = null;

    try {
      // Creamos el contacto
      const payloadContact: CreateContactDto = {
        name: createOpportunityDto.name,
        lastName: createOpportunityDto.name,
        firstName: createOpportunityDto.name,
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
        name: contact.firstName + ' ' + contact.lastName,
        cNumeroDeTelefono: createOpportunityDto.phoneNumber,
        closeDate: new Date(today),
        stage: "Gestion Inicial",
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

      // Notificar por WebSocket si tiene assignedUserId
      if (savedOpportunity.assignedUserId) {
        await this.websocketService.notifyNewOpportunity(savedOpportunity);
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

  async findAll(): Promise<Opportunity[]> {
    return await this.opportunityRepository.find({
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string): Promise<Opportunity> {
    const opportunity = await this.opportunityRepository.findOne({
      where: { id },
    });

    if (!opportunity) {
      throw new NotFoundException(`Oportunidad con ID ${id} no encontrada`);
    }

    return opportunity;
  }

  async update(id: string, updateOpportunityDto: UpdateOpportunityDto): Promise<Opportunity> {
    const opportunity = await this.findOne(id);
    const previousStage = opportunity.stage; // Guardar etapa anterior para comparación
    
    // Actualizar campos con los nuevos valores
    Object.assign(opportunity, updateOpportunityDto);
    
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

  async findByStage(stage: string): Promise<Opportunity[]> {
    return await this.opportunityRepository.find({
      where: { stage },
      order: { createdAt: 'DESC' },
    });
  }

  async findByAssignedUser(assignedUserId: string): Promise<Opportunity[]> {
    return await this.opportunityRepository.find({
      where: { assignedUserId },
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

  async getLastOpportunityAssigned(): Promise<OpportunityWithUser> {
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
      .andWhere('o.deleted = false')
      .andWhere('o.name NOT ILIKE :name', { name: '%REF%' })
      .orderBy('o.createdAt', 'DESC')
      .getRawOne();

    if (!opportunity) {
      throw new NotFoundException('No hay oportunidades asignadas');
    }
    
    return opportunity;

  }
}
