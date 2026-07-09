import {
  Body,
  Controller,
  Headers,
  InternalServerErrorException,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { Public } from '../auth/decorators/public.decorator';
import { OpportunitiesClosersCronsService } from './opportunity-closers-crons.service';

interface QuotationCreatedFromSvDto {
  quotationId: number;
  history: string;
  name: string;
}

/** Bridge SV → CRM: cotización creada en SV, encolar en cerradoras al instante. */
@Controller('opportunities-closers')
export class OpportunitiesClosersFromSvController {
  constructor(
    private readonly cronsService: OpportunitiesClosersCronsService,
  ) {}

  private assertInternalApiKey(apiKey: string | undefined) {
    const expected = [
      process.env.INTERNAL_API_KEY,
      process.env.INTERNAL_CRM_API_KEY,
    ].filter(Boolean);
    if (!expected.length) {
      throw new InternalServerErrorException(
        'INTERNAL_API_KEY no configurada en backend-crm',
      );
    }
    if (!apiKey || !expected.includes(apiKey)) {
      throw new UnauthorizedException('Clave interna inválida');
    }
  }

  @Public()
  @Post('quotation-created-from-sv')
  async quotationCreatedFromSv(
    @Headers('x-internal-api-key') apiKeyHeader: string,
    @Body() dto: QuotationCreatedFromSvDto,
  ) {
    this.assertInternalApiKey(apiKeyHeader);
    return this.cronsService.notifyQuotationCreated(dto);
  }
}
