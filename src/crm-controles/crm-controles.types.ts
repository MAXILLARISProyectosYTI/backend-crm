/** Fila genérica devuelta por SV hasta que el contrato esté fijado */
export type CrmControlesPatientRow = Record<string, unknown>;

export interface CrmControlesCacheMeta {
  lastSyncAt: string | null;
  lastError: string | null;
  source: 'sv' | 'sv-invoice-db' | 'sv-http';
}

export interface CrmControlesPacientesResponse {
  data: CrmControlesPatientRow[];
  meta: CrmControlesCacheMeta;
}
