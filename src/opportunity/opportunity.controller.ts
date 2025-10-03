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
  Req,
} from '@nestjs/common';
import { OpportunityService } from './opportunity.service';
import { CreateOpportunityDto } from './dto/create-opportunity.dto';
import { UpdateOpportunityDto } from './dto/update-opportunity.dto';
import { ReprogramingReservationDto } from './dto/update-opportunity.dto';
import type { UpdateOpportunityProcces } from './dto/update-opportunity.dto';
import { Opportunity } from './opportunity.entity';
import { OpportunityWebSocketService } from './opportunity-websocket.service';
import { ContactService } from 'src/contact/contact.service';
import { UpdateContactDto } from 'src/contact/dto/update-contact.dto';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { Public } from 'src/auth/decorators/public.decorator';
import { OpportunityFilesInterceptor } from 'src/interceptors/simple-file.interceptor';
import { Enum_Stage } from './dto/enums';
import { FilesService } from 'src/files/files.service';
import { FileUploadService } from 'src/files/file-upload.service';
import { FileType, DirectoryType } from 'src/files/dto/files.dto';
import { OpportunityCronsService } from './opportunity-crons.service';

@UseGuards(JwtAuthGuard)
@Controller('opportunity')
@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
export class OpportunityController {
  constructor(
    private readonly opportunityService: OpportunityService,
    private readonly websocketService: OpportunityWebSocketService,
    private readonly contactService: ContactService,
    private readonly fileUploadService: FileUploadService,
    private readonly opportunityCronsService: OpportunityCronsService,
  ) {}
  
  @Get('consumer')
  async consumer() {
    return this.opportunityCronsService.assignUnassignedOpportunitiesDaily();
  }

  
  @Post('create-opportunity-with-same-phone-number/:opportunityId')
  async createOpportunityWithSamePhoneNumber(
    @Param('opportunityId') opportunityId: string,
    @Req() req: Request & { user: { userId: string; userName: string } }
  ) {
    return this.opportunityService.createWithSamePhoneNumber(opportunityId, req.user.userId);
  }

  @Put('data/:id')
  @UseInterceptors(OpportunityFilesInterceptor)
  async changeData(
    @Body() body: Omit<CreateOpportunityDto, 'files'>,
    @Param('id') id: string,
    @UploadedFiles() files: Express.Multer.File[],
    @Req() req: Request & { user: { userId: string; userName: string } }

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
        campaignId: changeDataDto.campaignId || opportunity.campaignId,
        cSubCampaignId: changeDataDto.subCampaignId || opportunity.cSubCampaignId,
        cCanal: changeDataDto.channel || opportunity.cCanal,
        cObs: changeDataDto.observation || opportunity.cObs,
      }
  
      try {
        newOpportunity = await this.opportunityService.update(id, payloadOpportunity, req.user.userId);
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
        await this.fileUploadService.uploadFiles(
          files,
          id,
          'opportunities',
          FileType.ALL,
          DirectoryType.OPPORTUNITIES
        );
      }
  
      return newOpportunity;
    }

    
  @Put('reassign-opportunity-manual/:opportunityId')
  async reassignOpportunityManual(
    @Param('opportunityId') opportunityId: string, 
    @Body() body: { newUserId: string },
    @Req() req: Request & { user: { userId: string; userName: string } }
  ) {
    const userId = req.user.userId;
    return this.opportunityService.assingManual(opportunityId, body.newUserId, userId);
  }

  @Put('change-url-oi/:opportunityId')
  async changeURLOI(@Param('opportunityId') opportunityId: string) {
    return this.opportunityService.changeURLOI(opportunityId);
  }

  
  @Put('reprograming-reservation/:opportunityId')
  async reprograminReservation(
    @Param('opportunityId') opportunityId: string, 
    @Body() body: ReprogramingReservationDto,
    @Req() req: Request & { user: { userId: string; userName: string } }
  ) {
    const userId = req.user.userId;
    return this.opportunityService.reprograminReservation(opportunityId, body, userId);
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
  async findOne(
    @Param('id') id: string,
    @Req() req: Request & { user: { userId: string; userName: string } }
  ): Promise<Opportunity> {
    const userId = req.user.userId;
    return await this.opportunityService.findOneWithDetails(id, userId);
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() updateOpportunityDto: UpdateOpportunityDto,
    @Req() req: Request & { user: { userId: string; userName: string } }
  ): Promise<Opportunity> {
    const userId = req.user.userId;
    return await this.opportunityService.update(id, updateOpportunityDto, userId);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string, @Req() req: Request & { user: { userId: string; userName: string } }): Promise<void> {
    const userId = req.user.userId;
    return await this.opportunityService.remove(id, userId);
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
    @UploadedFiles() files: Express.Multer.File[],
    @Req() req: Request & { user: { userId: string; userName: string } }

  ): Promise<Opportunity> {
    
    const createData: CreateOpportunityDto = {
      ...body,
    };

    const opportunity = await this.opportunityService.create(createData, req.user.userId);
    
    // Guardar archivos en la base de datos
    if (files && files.length > 0) {
      await this.fileUploadService.uploadFiles(
        files,
        opportunity.id.toString(),
        'opportunities',
        FileType.ALL,
        DirectoryType.OPPORTUNITIES
      );
    }

    return opportunity;
  }

  @Get('count-opportunities-assigned/:date')
  async countOpportunitiesAssigned(@Param('date') date: string) {
    return this.opportunityService.countOpportunitiesAssignedBySubcampaign(date);
  }

  @Post('create-opportunity-with-manual-assign')
  @UseInterceptors(OpportunityFilesInterceptor)
  async createOpportunityWithManualAssign(
    @Body()  body: Omit<CreateOpportunityDto, 'files'>, 
    @UploadedFiles() files: Express.Multer.File[],
    @Req() req: Request & { user: { userId: string; userName: string } }
  ) {
    const userId = req.user.userId;
    const opportunity = await this.opportunityService.createWithManualAssign(body, userId);
    
    // Guardar archivos en la base de datos
    if (files && files.length > 0) {
      await this.fileUploadService.uploadFiles(
        files,
        opportunity.id.toString(),
        'opportunities',
        FileType.ALL,
        DirectoryType.OPPORTUNITIES
      );
    }

    return opportunity;
  }

  @Put('update-opportunity-procces/:id')
  async updateOpportunityWithProcces(
    @Param('id') id: string, 
    @Body() body: UpdateOpportunityProcces,
    @Req() req: Request & { user: { userId: string; userName: string } }
  ) {
    const userId = req.user.userId;
    return this.opportunityService.updateOpportunityWithFacturas(id, body, userId);
  }

  @Get('patient-sv/:id')
  async getPatientSV(@Param('id') id: string) {
    return this.opportunityService.getPatientSV(id);
  }

  @Public()
  @Get('with-entity/:id')
  async getOneWithEntity(@Param('id') id: string) {
    return this.opportunityService.getOneWithEntity(id);
  }

  @Get('is-for-refer/:userId')
  async isForRefer(@Param('userId') userId: string) {
    return this.opportunityService.isForRefer(userId);
  }

  @Public()
  @Get('get-by-phone-number/:phoneNumber')
  async getByPhoneNumber(@Param('phoneNumber') phoneNumber: string) {
    return this.opportunityService.getOpportunitiesByPhoneNumber(phoneNumber);
  }
}
