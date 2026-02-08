import { Body, Controller, Get, Param, Post, Query, UseGuards, UsePipes, ValidationPipe } from '@nestjs/common';
import { OpportunitiesClosersService } from './opportunities-closers.service';
import { OpportunitiesClosers } from './opportunities-closers.entity';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import type { DetalleCotizacionDto } from './dto/detail-quotations.dto';

@UseGuards(JwtAuthGuard)
@Controller('opportunities-closers')
@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
export class OpportunitiesClosersController {
  constructor(private readonly opportunitiesClosersService: OpportunitiesClosersService) {}

  @Get('all')
  async findAll(
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '10',
    @Query('search') search?: string
  ): Promise<{ opportunities: (OpportunitiesClosers & { assignedUserName?: string; sedeAtencion?: string | null })[], total: number, page: number, totalPages: number }> {
    const pageNumber = parseInt(page, 10);
    const limitNumber = parseInt(limit, 10);
    
    return await this.opportunitiesClosersService.findAll(pageNumber, limitNumber, search);
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
}
