import {
  Body,
  Controller,
  Get,
  Headers,
  InternalServerErrorException,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UnauthorizedException,
} from '@nestjs/common';
import { Public } from '../auth/decorators/public.decorator';
import { ReferralCashbackService } from './referral-cashback.service';
import { ApplyReferralCashbackDto } from './dto/referral-cashback.dto';

/** Bridge SV / cerradoras → CRM: cashback por referidos sin JWT de usuario. */
@Controller('referral-cashback')
export class ReferralCashbackFromSvController {
  constructor(private readonly service: ReferralCashbackService) {}

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
  @Get('balance-from-sv/:patientId')
  async getBalanceFromSv(
    @Headers('x-internal-api-key') apiKeyHeader: string,
    @Headers('authorization') authorization: string,
    @Param('patientId', ParseIntPipe) patientId: number,
  ) {
    const bearer = authorization?.startsWith('Bearer ')
      ? authorization.slice(7)
      : undefined;
    this.assertInternalApiKey(apiKeyHeader || bearer);
    return this.service.getBalanceByPatient(patientId);
  }

  @Public()
  @Get('dashboard-from-sv/:patientId')
  async getDashboardFromSv(
    @Headers('x-internal-api-key') apiKeyHeader: string,
    @Headers('authorization') authorization: string,
    @Param('patientId', ParseIntPipe) patientId: number,
    @Query('limit') limit?: string,
  ) {
    const bearer = authorization?.startsWith('Bearer ')
      ? authorization.slice(7)
      : undefined;
    this.assertInternalApiKey(apiKeyHeader || bearer);
    const parsed = limit ? parseInt(limit, 10) : 30;
    return this.service.getDashboardByPatient(
      patientId,
      Number.isFinite(parsed) ? parsed : 30,
    );
  }

  @Public()
  @Get('ledger-from-sv/:patientId')
  async getLedgerFromSv(
    @Headers('x-internal-api-key') apiKeyHeader: string,
    @Headers('authorization') authorization: string,
    @Param('patientId', ParseIntPipe) patientId: number,
    @Query('limit') limit?: string,
  ) {
    const bearer = authorization?.startsWith('Bearer ')
      ? authorization.slice(7)
      : undefined;
    this.assertInternalApiKey(apiKeyHeader || bearer);
    const parsed = limit ? parseInt(limit, 10) : 50;
    return this.service.getLedgerByPatient(
      patientId,
      Number.isFinite(parsed) ? parsed : 50,
    );
  }

  @Public()
  @Post('apply-from-sv')
  async applyFromSv(
    @Headers('x-internal-api-key') apiKeyHeader: string,
    @Headers('authorization') authorization: string,
    @Body() dto: ApplyReferralCashbackDto,
  ) {
    const bearer = authorization?.startsWith('Bearer ')
      ? authorization.slice(7)
      : undefined;
    this.assertInternalApiKey(apiKeyHeader || bearer);
    return this.service.applyCashback(dto);
  }

  /** Tras facturar contrato OFM del referido (contado 100% o cuotas moldes+inicial/cierre). */
  @Public()
  @Post('process-patient-from-sv/:patientId')
  async processPatientFromSv(
    @Headers('x-internal-api-key') apiKeyHeader: string,
    @Headers('authorization') authorization: string,
    @Param('patientId', ParseIntPipe) patientId: number,
  ) {
    const bearer = authorization?.startsWith('Bearer ')
      ? authorization.slice(7)
      : undefined;
    this.assertInternalApiKey(apiKeyHeader || bearer);
    return this.service.processPendingForPatient(patientId);
  }
}
