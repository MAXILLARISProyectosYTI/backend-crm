/** Item de cotización tal como lo expone SV en el listado (contrato mínimo). */
export interface QuotationListItem {
  id: number | string;
  name: string;
  history: string;
}

/** Respuesta del endpoint de listado de cotizaciones (todas / paginado). */
export interface QuotationListResponse {
  data: QuotationListItem[];
  total?: number;
  page?: number;
  totalPages?: number;
}
