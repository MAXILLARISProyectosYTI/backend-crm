import { Opportunity } from '../opportunity.entity';
import { PatientIsNewCrmData } from 'src/sv-services/patient-is-new.types';

export type CreateOpportunityResponseStatus = 'success' | 'error';

/** Respuesta unificada del endpoint de crear oportunidad */
export interface CreateOpportunityResponse {
  status: CreateOpportunityResponseStatus;
  code: string;
  message: string;
  data: {
    opportunity?: Opportunity;
  } & Partial<PatientIsNewCrmData>;
}
