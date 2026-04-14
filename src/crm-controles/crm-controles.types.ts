/** Fila genérica devuelta por SV hasta que el contrato esté fijado */
export type CrmControlesPatientRow = Record<string, unknown>;

export interface CrmControlesCacheMeta {
  lastSyncAt: string | null;
  lastError: string | null;
  source: 'sv';
}

export interface CrmControlesPacientesResponse {
  data: CrmControlesPatientRow[];
  meta: CrmControlesCacheMeta;
}
