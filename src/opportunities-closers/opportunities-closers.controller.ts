import { Body, ConflictException, Controller, Get, NotFoundException, Param, Post, Query, Req, UseGuards, UsePipes, ValidationPipe } from '@nestjs/common';
import { Request } from 'express';
import { OpportunitiesClosersService } from './opportunities-closers.service';
import { OpportunitiesClosers } from './opportunities-closers.entity';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import type { DetalleCotizacionDto } from './dto/detail-quotations.dto';
import { OpportunityService } from 'src/opportunity/opportunity.service';
import { OpportunitiesClosersCronsService } from './opportunity-closers-crons.service';

@UseGuards(JwtAuthGuard)
@Controller('opportunities-closers')
@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
export class OpportunitiesClosersController {
  constructor(
    private readonly opportunitiesClosersService: OpportunitiesClosersService,
    private readonly opportunityService: OpportunityService,
    private readonly opportunitiesClosersCronsService: OpportunitiesClosersCronsService,
  ) {}

  @Get('all')
  async findAll(
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '10',
    @Query('search') search?: string,
    @Req() req?: Request & { user?: { userId: string } },
  ): Promise<{ opportunities: (OpportunitiesClosers & { assignedUserName?: string; sedeAtencion?: string | null })[], total: number, page: number, totalPages: number }> {
    const pageNumber = parseInt(page, 10);
    const limitNumber = parseInt(limit, 10);
    const assignedToUserId = req?.user?.userId;
    return await this.opportunitiesClosersService.findAll(pageNumber, limitNumber, search, assignedToUserId);
  }

  @Post('upload-quotation')
  uploadQuotation(@Body() body: {file: string, opportunityId: string}) {
    return this.opportunitiesClosersService.uploadFile(body);
  }

  @Post('upload-facts')
  uploadFileDocument(@Body() body: {contractId: number, opportunityId: string, userId: string}) {
    return this.opportunitiesClosersService.uploadFacts(body.contractId, body.opportunityId, body.userId);
  }

  @Post('lost-opportunity')
  lostOpportunity(@Body() body: {opportunityId: string, userId: string, reason: string, subReason: string}) {
    return this.opportunitiesClosersService.lostOpportunity(body.opportunityId, body.userId, body.reason, body.subReason);
  }

  @Post('detail-quotations/:opportunityCloserId')
  uploadDetailQuotations(@Body() body: DetalleCotizacionDto, @Param('opportunityCloserId') opportunityCloserId: string) {
    return this.opportunitiesClosersService.detailQuotations(body, opportunityCloserId);
  }

  @Get('by-id/:id')
  getById(@Param('id') id: string) {
    return this.opportunitiesClosersService.getOneWithDetails(id);
  }

  /**
   * Agregar a la cola desde un resultado de búsqueda en SV (cuando no había resultados en CRM).
   * Body: quotationId, name, history. Crea la oportunidad cerradora si existe oportunidad en CRM con esa historia clínica.
   */
  @Post('add-from-sv')
  async addFromSv(
    @Body() body: { quotationId: number; name: string; history: string },
  ) {
    const exists = await this.opportunitiesClosersService.existsOpportunityCloserByQuotationId(String(body.quotationId));
    if (exists) {
      throw new ConflictException('Esta cotización ya está en la cola de cerradoras');
    }
    const oportunidades = await this.opportunityService.getOpportunityByClinicHistory(body.history);
    if (!oportunidades?.length) {
      throw new NotFoundException('No hay oportunidad en el CRM con esa historia clínica. Debe existir la oportunidad para agregarla a la cola.');
    }
    const first = oportunidades[0];
    const quotationId = typeof body.quotationId === 'number' ? body.quotationId : parseInt(String(body.quotationId), 10) || 0;
    return this.opportunitiesClosersCronsService.addOpportunityToQueue({
      name: body.name,
      history: body.history,
      opportunityId: first.id,
      quotationId,
      campusAtencionId: first.cCampusAtencionId ?? undefined,
    });
  }
}
