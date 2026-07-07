import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ReferralCashbackService } from './referral-cashback.service';
import {
  ApplyReferralCashbackDto,
  ProcessInvoiceCashbackDto,
  UpdateReferralCashbackConfigDto,
} from './dto/referral-cashback.dto';

@UseGuards(JwtAuthGuard)
@Controller('referral-cashback')
export class ReferralCashbackController {
  constructor(private readonly service: ReferralCashbackService) {}

  @Get('config')
  getConfig() {
    return this.service.getConfig();
  }

  @Patch('config')
  updateConfig(@Body() dto: UpdateReferralCashbackConfigDto) {
    return this.service.updateConfig(dto);
  }

  @Get('balance/:patientId')
  getBalance(@Param('patientId', ParseIntPipe) patientId: number) {
    return this.service.getBalanceByPatient(patientId);
  }

  @Get('ledger/:patientId')
  getLedger(
    @Param('patientId', ParseIntPipe) patientId: number,
    @Query('limit') limit?: string,
  ) {
    const parsed = limit ? parseInt(limit, 10) : 50;
    return this.service.getLedgerByPatient(patientId, Number.isFinite(parsed) ? parsed : 50);
  }

  /** Saldo + movimientos enriquecidos + resumen por referido (1 sola llamada para HC). */
  @Get('dashboard/:patientId')
  getDashboard(
    @Param('patientId', ParseIntPipe) patientId: number,
    @Query('limit') limit?: string,
  ) {
    const parsed = limit ? parseInt(limit, 10) : 30;
    return this.service.getDashboardByPatient(
      patientId,
      Number.isFinite(parsed) ? parsed : 30,
    );
  }

  @Get('eligibility/referrer/:patientId')
  checkReferrerEligibility(@Param('patientId', ParseIntPipe) patientId: number) {
    return this.service.checkReferrerEligibility(patientId);
  }

  /** Llamar tras facturar pago del referido (hook cerradoras / SV). */
  @Post('process-invoice')
  processInvoice(@Body() dto: ProcessInvoiceCashbackDto) {
    return this.service.processInvoicePayment(dto);
  }

  /** Procesa IRB pendientes del paciente referido (mismo criterio que from-sv). */
  @Post('process-patient/:patientId')
  processPatient(@Param('patientId', ParseIntPipe) patientId: number) {
    return this.service.processPendingForPatient(patientId);
  }

  /** Aplicar saldo en cerradoras, sv-front o agenda OI. */
  @Post('apply')
  applyCashback(@Body() dto: ApplyReferralCashbackDto) {
    return this.service.applyCashback(dto);
  }
}
