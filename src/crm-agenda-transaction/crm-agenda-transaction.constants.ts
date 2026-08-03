export const CRM_AGENDA_HEADERS = {
  CORRELATION_ID: 'x-correlation-id',
  IDEMPOTENCY_KEY: 'idempotency-key',
  TRANSACTION_STEP: 'x-transaction-step',
} as const;

export enum CrmAgendaTransactionStep {
  REDIRECT = 'REDIRECT',
  CREATE_PATIENT_LINK = 'CREATE_PATIENT_LINK',
  SYNC_CRM = 'SYNC_CRM',
  UPDATE_SV_LINK = 'UPDATE_SV_LINK',
  RESERVE = 'RESERVE',
  CANCEL = 'CANCEL',
}

export enum CrmAgendaTransactionStatus {
  PENDING = 'PENDING',
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
  PARTIAL = 'PARTIAL',
}
