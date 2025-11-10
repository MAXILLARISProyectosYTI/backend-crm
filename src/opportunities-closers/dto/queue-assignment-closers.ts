export interface BodyAddOpportunityToQueueDto {
  name: string;
  history: string;
  opportunityId: string;
  quotationId: number;
}

export interface PayloadAddOpportunityToQueueDto {
  opportunityId: string;
  quotationId: number;
  history: string;
  opportunityCloserId: string;
}
