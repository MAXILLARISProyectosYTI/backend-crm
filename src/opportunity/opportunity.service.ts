import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Opportunity } from './opportunity.entity';
import { CreateOpportunityDto } from './dto/create-opportunity.dto';
import { UpdateOpportunityDto } from './dto/update-opportunity.dto';
import { OpportunityWebSocketService } from './opportunity-websocket.service';

@Injectable()
export class OpportunityService {
  constructor(
    @InjectRepository(Opportunity)
    private readonly opportunityRepository: Repository<Opportunity>,
    private readonly websocketService: OpportunityWebSocketService,
  ) {}

  async create(createOpportunityDto: CreateOpportunityDto): Promise<Opportunity> {
    const opportunity = this.opportunityRepository.create(createOpportunityDto);
    const savedOpportunity = await this.opportunityRepository.save(opportunity);
    
    // Notificar por WebSocket si tiene assignedUserId
    if (savedOpportunity.assignedUserId) {
      await this.websocketService.notifyNewOpportunity(savedOpportunity);
    }
    
    return savedOpportunity;
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
}
