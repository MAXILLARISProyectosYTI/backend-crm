export interface BodyAddOpportunityToQueueDto {
  name: string;
  history: string;
  opportunityId: string;
  quotationId: number;
  /** Sede de atención (campus) para asignación por sede cuando no hay cerradoras */
  campusAtencionId?: number;
}

export interface PayloadAddOpportunityToQueueDto {
  opportunityId: string;
  quotationId: number;
  history: string;
  opportunityCloserId: string;
}
