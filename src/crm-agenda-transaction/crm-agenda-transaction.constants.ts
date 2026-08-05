export const CRM_AGENDA_HEADERS = {
  CORRELATION_ID: 'x-correlation-id',
  IDEMPOTENCY_KEY: 'idempotency-key',
  TRANSACTION_STEP: 'x-transaction-step',
} as const;

/** Headers HTTP estándar que el CRM acepta en CORS. */
export const CORS_BASE_HEADERS = [
  'Content-Type',
  'Authorization',
  'Accept',
] as const;

/**
 * Allowlist CORS completa.
 * Incluye los headers de traza agenda↔CRM (única fuente: CRM_AGENDA_HEADERS)
 * para que el preflight de creation_patient / appointmentCalendar no falle.
 */
export const CORS_ALLOWED_HEADERS: readonly string[] = [
  ...CORS_BASE_HEADERS,
  ...Object.values(CRM_AGENDA_HEADERS),
];

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
