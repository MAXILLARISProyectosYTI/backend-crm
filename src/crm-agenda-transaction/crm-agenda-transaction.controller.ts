import { Controller, Get, Param } from '@nestjs/common';
import { CrmAgendaTransactionSvService } from './crm-agenda-transaction-sv.service';

@Controller('crm-agenda-transaction')
export class CrmAgendaTransactionController {
  constructor(private readonly transactionService: CrmAgendaTransactionSvService) {}

  @Get('status/:correlationId')
  getStatus(@Param('correlationId') correlationId: string) {
    return this.transactionService.getStatusByCorrelationId(correlationId);
  }
}
