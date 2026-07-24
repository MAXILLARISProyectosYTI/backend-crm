import { Global, MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { CrmAgendaTransactionSvService } from './crm-agenda-transaction-sv.service';
import { CrmAgendaTransactionController } from './crm-agenda-transaction.controller';
import { CrmAgendaCorrelationMiddleware } from './crm-agenda-correlation.middleware';

@Global()
@Module({
  controllers: [CrmAgendaTransactionController],
  providers: [CrmAgendaTransactionSvService, CrmAgendaCorrelationMiddleware],
  exports: [CrmAgendaTransactionSvService, CrmAgendaCorrelationMiddleware],
})
export class CrmAgendaTransactionModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(CrmAgendaCorrelationMiddleware).forRoutes('*');
  }
}
