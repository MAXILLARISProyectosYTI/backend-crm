import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { AsyncLocalStorage } from 'async_hooks';
import { CRM_AGENDA_HEADERS } from './crm-agenda-transaction.constants';
import { CrmAgendaTransactionSvService } from './crm-agenda-transaction-sv.service';

export interface CrmAgendaRequestContext {
  correlationId: string;
  idempotencyKey?: string;
  transactionStep?: string;
}

export const crmAgendaContextStorage = new AsyncLocalStorage<CrmAgendaRequestContext>();

@Injectable()
export class CrmAgendaCorrelationMiddleware implements NestMiddleware {
  constructor(private readonly transactionService: CrmAgendaTransactionSvService) {}

  use(req: Request, res: Response, next: NextFunction): void {
    const correlationId = this.transactionService.resolveCorrelationId(
      req.header(CRM_AGENDA_HEADERS.CORRELATION_ID),
    );
    const idempotencyKey = req.header(CRM_AGENDA_HEADERS.IDEMPOTENCY_KEY) ?? undefined;
    const transactionStep = req.header(CRM_AGENDA_HEADERS.TRANSACTION_STEP) ?? undefined;

    res.setHeader(CRM_AGENDA_HEADERS.CORRELATION_ID, correlationId);

    crmAgendaContextStorage.run(
      { correlationId, idempotencyKey, transactionStep },
      () => next(),
    );
  }
}

export function getCrmAgendaContext(): CrmAgendaRequestContext | undefined {
  return crmAgendaContextStorage.getStore();
}

export function buildOutboundCrmAgendaHeaders(
  extra?: Record<string, string>,
): Record<string, string> {
  const ctx = getCrmAgendaContext();
  const headers: Record<string, string> = { ...(extra ?? {}) };
  if (ctx?.correlationId) headers[CRM_AGENDA_HEADERS.CORRELATION_ID] = ctx.correlationId;
  if (ctx?.idempotencyKey) headers[CRM_AGENDA_HEADERS.IDEMPOTENCY_KEY] = ctx.idempotencyKey;
  if (ctx?.transactionStep) headers[CRM_AGENDA_HEADERS.TRANSACTION_STEP] = ctx.transactionStep;
  return headers;
}
