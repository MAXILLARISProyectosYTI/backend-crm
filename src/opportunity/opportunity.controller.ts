import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UsePipes,
  ValidationPipe,
  HttpCode,
  HttpStatus,
  Query,
  Put,
  NotFoundException,
  BadRequestException,
  UseGuards,
} from '@nestjs/common';
import { OpportunityService } from './opportunity.service';
import { CreateOpportunityDto } from './dto/create-opportunity.dto';
import { UpdateOpportunityDto } from './dto/update-opportunity.dto';
import { Opportunity } from './opportunity.entity';
import { OpportunityWebSocketService } from './opportunity-websocket.service';
import { ContactService } from 'src/contact/contact.service';
import { UpdateContactDto } from 'src/contact/dto/update-contact.dto';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('opportunities')
@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
export class OpportunityController {
  constructor(
    private readonly opportunityService: OpportunityService,
    private readonly websocketService: OpportunityWebSocketService,
    private readonly contactService: ContactService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() createOpportunityDto: CreateOpportunityDto): Promise<Opportunity> {
    return await this.opportunityService.create(createOpportunityDto);
  }

  @Get()
  async findAll(): Promise<Opportunity[]> {
    return await this.opportunityService.findAll();
  }

  
  @Get('active')
  async findActive(): Promise<Opportunity[]> {
    return await this.opportunityService.findActiveOpportunities();
  }

  @Get('account/:accountId')
  async findByAccount(@Param('accountId') accountId: string): Promise<Opportunity[]> {
    return await this.opportunityService.findByAccount(accountId);
  }

  @Get('stage/:stage')
  async findByStage(@Param('stage') stage: string): Promise<Opportunity[]> {
    return await this.opportunityService.findByStage(stage);
  }

  @Get('assigned/:assignedUserId')
  async findByAssignedUser(@Param('assignedUserId') assignedUserId: string): Promise<Opportunity[]> {
    return await this.opportunityService.findByAssignedUser(assignedUserId);
  }

  @Get(':id')
  async findOne(@Param('id') id: string): Promise<Opportunity> {
    return await this.opportunityService.findOne(id);
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() updateOpportunityDto: UpdateOpportunityDto,
  ): Promise<Opportunity> {
    return await this.opportunityService.update(id, updateOpportunityDto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string): Promise<void> {
    return await this.opportunityService.remove(id);
  }

  @Patch(':id/soft-delete')
  async softDelete(@Param('id') id: string): Promise<Opportunity> {
    return await this.opportunityService.softDelete(id);
  }

  @Get('websocket/stats')
  async getWebSocketStats() {
    return this.websocketService.getConnectionStats();
  }

  @Post('register')
  async register(@Body() createOpportunityDto: CreateOpportunityDto): Promise<Opportunity> {
    return await this.opportunityService.create(createOpportunityDto);
  }

  @Get('pagination')
  async getPagination(@Query('page') page: number, @Query('limit') limit: number): Promise<Opportunity[]> {
    return await this.opportunityService.getPagination(Number(page), Number(limit));
  }

  @Get('count-opportunities-assigned/:date')
  async countOpportunitiesAssigned(@Param('date') date: string) {
    return this.opportunityService.countOpportunitiesAssignedBySubcampaign(date);
  }

  @Post('create-opportunity-with-same-phone-number/:opportunityId')
  async createOpportunityWithSamePhoneNumber(@Param('opportunityId') opportunityId: string) {
    return this.opportunityService.createWithSamePhoneNumber(opportunityId);
  }

  @Post('create-opportunity-with-manual-assign')
  async createOpportunityWithManualAssign(@Body() body: CreateOpportunityDto) {
    return this.opportunityService.createWithManualAssign(body);
  }

  @Put('data/:id')
  async changeData(@Body() changeDataDto: CreateOpportunityDto, @Param('id') id: string): Promise<Opportunity> {
      
      const opportunity = await this.opportunityService.findOne(id);
      let newOpportunity: Opportunity | null = null;
  
      if(!opportunity){
        throw new NotFoundException(`Oportunidad con ID ${id} no encontrada`);
      }
  
      const payloadOpportunity: Partial<Opportunity> = {
        name: changeDataDto.name || opportunity.name,
        cNumeroDeTelefono: changeDataDto.phoneNumber || opportunity.cNumeroDeTelefono,
        cCampaign: changeDataDto.campaignId || opportunity.cCampaign,
        cSubCampaignId: changeDataDto.subCampaignId || opportunity.cSubCampaignId,
        cCanal: changeDataDto.channel || opportunity.cCanal,
        cObs: changeDataDto.observation || opportunity.cObs,
      }
  
      try {
        newOpportunity = await this.opportunityService.update(id, payloadOpportunity);
      } catch (error) {
        throw new BadRequestException('Ocurrio un error al actualizar la oportunidad');
      }
  
      const payloadContact: UpdateContactDto = {
        firstName: changeDataDto.name || opportunity.name || '',
        lastName: changeDataDto.name || opportunity.name || '',
      }
  
      try {
        await this.contactService.update(opportunity.contactId!, payloadContact);
      } catch (error) {
        throw new BadRequestException('Ocurrio un error al actualizar el contacto');
      }
  
      return newOpportunity;
    }

}
