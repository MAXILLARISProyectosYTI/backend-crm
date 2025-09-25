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
} from '@nestjs/common';
import { OpportunityService } from './opportunity.service';
import { CreateOpportunityDto } from './dto/create-opportunity.dto';
import { UpdateOpportunityDto } from './dto/update-opportunity.dto';
import { Opportunity } from './opportunity.entity';
import { OpportunityWebSocketService } from './opportunity-websocket.service';

@Controller('opportunity')
@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
export class OpportunityController {
  constructor(
    private readonly opportunityService: OpportunityService,
    private readonly websocketService: OpportunityWebSocketService,
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
}
