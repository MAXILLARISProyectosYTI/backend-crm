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
  Put,
  NotFoundException,
  BadRequestException,
  UseGuards,
  UseInterceptors,
  UploadedFiles,
  Query,
} from '@nestjs/common';
import { OpportunityService } from './opportunity.service';
import { CreateOpportunityDto } from './dto/create-opportunity.dto';
import { UpdateOpportunityDto } from './dto/update-opportunity.dto';
import type { UpdateOpportunityProcces } from './dto/update-opportunity.dto';
import { Opportunity } from './opportunity.entity';
import { OpportunityWebSocketService } from './opportunity-websocket.service';
import { ContactService } from 'src/contact/contact.service';
import { UpdateContactDto } from 'src/contact/dto/update-contact.dto';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { OpportunityFilesInterceptor } from 'src/interceptors/simple-file.interceptor';
import { FileUploadService } from 'src/files/file-upload.service';
import { Enum_Stage } from './dto/enums';

@UseGuards(JwtAuthGuard)
@Controller('opportunity')
@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
export class OpportunityController {
  constructor(
    private readonly opportunityService: OpportunityService,
    private readonly websocketService: OpportunityWebSocketService,
    private readonly contactService: ContactService,
    private readonly fileUploadService: FileUploadService,
  ) {}

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
  async findByStage(@Param('stage') stage: Enum_Stage): Promise<Opportunity[]> {
    return await this.opportunityService.findByStage(stage);
  }

  @Get('assigned/:assignedUserId')
  async findByAssignedUser(
    @Param('assignedUserId') assignedUserId: string,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '10',
    @Query('search') search?: string
  ): Promise<{ opportunities: Opportunity[], total: number, page: number, totalPages: number }> {
    const pageNumber = parseInt(page, 10);
    const limitNumber = parseInt(limit, 10);
    
    return await this.opportunityService.findByAssignedUser(assignedUserId, pageNumber, limitNumber, search);
  }

  @Get(':id')
  async findOne(@Param('id') id: string): Promise<Opportunity> {
    return await this.opportunityService.findOneWithDetails(id);
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
  @UseInterceptors(OpportunityFilesInterceptor) 
  async register(
    @Body() body: Omit<CreateOpportunityDto, 'files'>,
    @UploadedFiles() files: Express.Multer.File[]
  ): Promise<Opportunity> {
    
    const createData: CreateOpportunityDto = {
      ...body,
    };

    const opportunity = await this.opportunityService.create(createData);
    
    // Guardar archivos en la base de datos
    if (files && files.length > 0) {
      await this.fileUploadService.saveFilesToDatabase(
        files,
        opportunity.id.toString(),
        'opportunity'
      );
    }

    return opportunity;
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
  @UseInterceptors(OpportunityFilesInterceptor)
  async createOpportunityWithManualAssign(@Body()  body: Omit<CreateOpportunityDto, 'files'>, @UploadedFiles() files: Express.Multer.File[]) {
    const opportunity = await this.opportunityService.createWithManualAssign(body, files);
    
    // Guardar archivos en la base de datos
    if (files && files.length > 0) {
      await this.fileUploadService.saveFilesToDatabase(
        files,
        opportunity.id.toString(),
        'opportunity'
      );
    }

    return opportunity;
  }

  @Put('update-opportunity-procces/:id')
  async updateOpportunityWithProcces(@Param('id') id: string, @Body() body: UpdateOpportunityProcces) {
    return this.opportunityService.updateOpportunityWithFacturas(id, body);
  }

  @Put('data/:id')
  @UseInterceptors(OpportunityFilesInterceptor)
  async changeData(
    @Body() body: Omit<CreateOpportunityDto, 'files'>,
    @Param('id') id: string,
    @UploadedFiles() files: Express.Multer.File[]
  ): Promise<Opportunity> {
            
      const opportunity = await this.opportunityService.getOneWithEntity(id);
      let newOpportunity: Opportunity | null = null;
  
      if(!opportunity){
        throw new NotFoundException(`Oportunidad con ID ${id} no encontrada`);
      }

      const changeDataDto: CreateOpportunityDto = {
        ...body,
      };
  
      const payloadOpportunity: UpdateOpportunityDto = {
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

      // Guardar archivos en la base de datos
      if (files && files.length > 0) {
        await this.fileUploadService.saveFilesToDatabase(
          files,
          id,
          'opportunity'
        );
      }
  
      return newOpportunity;
    }

  @Get('patient-sv/:id')
  async getPatientSV(@Param('id') id: string) {
    return this.opportunityService.getPatientSV(id);
  }

  @Get(':id/images')
  async getOpportunityImages(@Param('id') id: string) {
    return await this.fileUploadService.getImagesByParent(id, 'opportunity');
  }

  @Get(':id/files')
  async getOpportunityFiles(@Param('id') id: string) {
    return await this.fileUploadService.getFilesByParent(id, 'opportunity');
  }

}
