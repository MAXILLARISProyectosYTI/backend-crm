import { BadRequestException, Injectable } from "@nestjs/common";
import axios from "axios";
import { BodyAddOpportunityToQueueDto, PayloadAddOpportunityToQueueDto } from "src/opportunities-closers/dto/queue-assignment-closers";
import { UpdateQueueOpClosersDto } from "src/opportunities-closers/dto/update-op-closer.dto";
import { CreateClinicHistoryCrmDto } from "src/opportunity/dto/clinic-history";

@Injectable()
export class SvServices {

  private readonly URL_BACK_SV = process.env.URL_BACK_SV;
  private readonly usernameSv = process.env.USERNAME_ADMIN;
  private readonly passwordSv = process.env.PASSWORD_ADMIN;
  
  constructor(
  ) {}

  async getPatientIsNew(phoneNumber: string, tokenSv: string){
    try {
      const responseClinicHistory = await axios.get<{
        is_new: boolean;
        patient: any;
        complete: boolean;
        dataReservation: any;
        dataPayment: any
      }>(`${this.URL_BACK_SV}/clinic-history/patient-is-new/${phoneNumber}`, {
        headers: {
          Authorization: `Bearer ${tokenSv}`
        }
      });
  
      return responseClinicHistory.data;
    } catch (error) {
      console.error('Error getPatientIsNew', error);
      throw new BadRequestException('Error al obtener información del paciente en SV');
    }
  }

  async createClinicHistoryCrm(payloadClinicHistory: CreateClinicHistoryCrmDto, tokenSv: string ){
    try {
      const responseClinicHistory = await axios.post(`${this.URL_BACK_SV}/opportunities/create-patient-crm/`, payloadClinicHistory, {
        headers: {
          Authorization: `Bearer ${tokenSv}`
        }
      })
  
      return responseClinicHistory.data;
    } catch (error) {
      console.error('Error createClinicHistoryCrm', error);
      throw new BadRequestException('Error al crear la historia clínica en SV');
    }
  }

  async getTokenSv(username: string, password: string) {
    try {
      const responseTokenSv = await axios.post(`${this.URL_BACK_SV}/auth/signin`, { username, password })
  
      return {data:responseTokenSv.data, tokenSv: responseTokenSv.data.token};      
    } catch (error) {
      console.log('error', error);
      throw new BadRequestException('Error al obtener el token de SV');
    }
  }

  async getTokenSvAdmin() {
    try {
      const responseTokenSv = await axios.post(`${this.URL_BACK_SV}/auth/signin`, { username: this.usernameSv, password: this.passwordSv })
  
      return {data:responseTokenSv.data, tokenSv: responseTokenSv.data.token};
    } catch (error) {
      console.error('Error getTokenSvAdmin', error);
      throw new BadRequestException('Error al obtener el token administrativo de SV');
    }
  }

  async getStatusClient(opportunityId: string, tokenSv: string) {
    try {
      const responseStatusClient: { data: { 
        espoId: string;
        id_payment?: number;
        id_reservation?: number;
        patientId?: number;}} = await axios.get(`${this.URL_BACK_SV}/opportunities/status-patient-crm/${opportunityId}`, {
        headers: {
          Authorization: `Bearer ${tokenSv}`
        }
      })
  
      const data = responseStatusClient.data;
  
     if(data.id_payment && data.id_reservation && data.patientId && data.espoId) {
      return true
     }  else {
      return false;
     }
  
    } catch (error) {
      console.error('Error getStatusClient', error);
      throw new BadRequestException('Error al obtener el estado del cliente en SV');
    }
  }

  async getPatientSV(clinicHistory: string, tokenSv: string) {
    try {
      const responsePatientSV = await axios.get(`${this.URL_BACK_SV}/clinic-history-v2/data-by-clinic-history/${clinicHistory}`, {
        headers: {
          Authorization: `Bearer ${tokenSv}`
        }
      })
  
      return responsePatientSV.data;
    } catch (error) {
      console.error('Error getPatientSV', error);
      throw new BadRequestException('Error al obtener datos del paciente en SV');
    }
  }

  async getPatientSVByEspoId(espoId: string, tokenSv: string) {
    try {
      const responsePatientSV = await axios.get(`${this.URL_BACK_SV}/opportunities/clinic-history-crm-by-espo-id/${espoId}`, {
        headers: {
          Authorization: `Bearer ${tokenSv}`
        }
      })
  
      return responsePatientSV.data;
    } catch (error) {
      console.error('Error getPatientSVByEspoId', error);
      throw new BadRequestException('Error al obtener datos del paciente por EspoId en SV');
    }
  }

  async updateClinicHistoryCrm(espoId: string, tokenSv: string, payload: Partial<CreateClinicHistoryCrmDto>) {
    try {
      const responsePatientSV = await axios.put(`${this.URL_BACK_SV}/opportunities/update-clinic-history-crm/${espoId}`, payload, {
        headers: {
          Authorization: `Bearer ${tokenSv}`
        }
      })
  
      return responsePatientSV.data;
    } catch (error) {
      console.error('Error updateClinicHistoryCrm', error);
      throw new BadRequestException('Error al actualizar la historia clínica en SV');
    }
  }

  async getPatientByClinicHistory(clinicHistory: string, tokenSv: string) {
    try {
      const responsePatientSV = await axios.get(`${this.URL_BACK_SV}/clinic-history/get-by-clinic-history/${clinicHistory}`, {
        headers: {
          Authorization: `Bearer ${tokenSv}`
        }
      })
  
      return responsePatientSV.data;
    } catch (error) {
      console.error('Error getPatientByClinicHistory', error);
      throw new BadRequestException('Error al obtener la historia clínica en SV');
    }
  }

  async getIRHByComprobante(comprobante: string, tokenSv: string) {
    try {
      console.log('comprobante', comprobante);
      console.log('url', `${this.URL_BACK_SV}/service_billing_payments01/get-irh-by-comprobante`);
      const responsePatientSV = await axios.post(`${this.URL_BACK_SV}/service_billing_payments01/get-irh-by-comprobante`, { comprobante }, {
        headers: {
          Authorization: `Bearer ${tokenSv}`
        }
      })
  
      return responsePatientSV.data;
    } catch (error) {
      console.error('Error getIRHByComprobante', error);
      throw new BadRequestException('Error al obtener el IRH por comprobante en SV');
    }
  }

  async updateQueueAssignmentClosers(opportunityCloserId: string, payload: Partial<UpdateQueueOpClosersDto>, tokenSv: string) {
    try {
      const responseQueueAssignmentClosers = await axios.put(`${this.URL_BACK_SV}/opportunity-closers/update-queue/${opportunityCloserId}`, payload, {
        headers: {
          Authorization: `Bearer ${tokenSv}`
        }
      })
  
      return responseQueueAssignmentClosers.data;
    } catch (error) {
      console.error('Error updateQueueAssignmentClosers', error);
      throw new BadRequestException('Error al actualizar la cola de closers en SV');
    }
  }

  async getFactsByContractId(contractId: number, tokenSv: string): Promise<{
    url_invoice_dolares: string;
    url_invoice_soles: string;
    id: number;
}[]> {
    try {
      const responseFacts = await axios.get(`${this.URL_BACK_SV}/contract/get-facts-contract/${contractId}`, {
        headers: {
          Authorization: `Bearer ${tokenSv}`
        }
      })
  
      return responseFacts.data;
    } catch (error) {
      console.error('Error getFactsByContractId', error);
      throw new BadRequestException('Error al obtener facturas del contrato en SV');
    }
  }

  async getQuotationsToday(tokenSv: string) {
    try {
      const responseQuotations = await axios.get(`${this.URL_BACK_SV}/quotation/get-today`, {
        headers: {
          Authorization: `Bearer ${tokenSv}`
        }
      })
      return responseQuotations.data;
    } catch (error) {
      console.log('error', error);
      throw new BadRequestException('Error al obtener las cotizaciones de SV');
    }
  }

  async addOpportunityToQueue(payload: PayloadAddOpportunityToQueueDto, tokenSv: string) {
    try {
      const responseQueueAssignmentClosers = await axios.post(`${this.URL_BACK_SV}/opportunity-closers/add-quotation-to-queue`, payload, {
        headers: {
          Authorization: `Bearer ${tokenSv}`
        }
      })
  
      return responseQueueAssignmentClosers.data;
    } catch (error) {
      console.error('Error addOpportunityToQueue', error);
      throw new BadRequestException('Error al agregar la oportunidad a la cola en SV');
    }
  }

  async getRedirectByOpportunityId(opportunityId: string, campaignName: string, clinicHistory: string) {
    try {
      console.log('campaignName', campaignName);
      console.log('clinicHistory', clinicHistory);
      console.log('opportunityId', opportunityId);
      console.log('url', `${this.URL_BACK_SV}/opportunities/redirect-by-opportunity-id/${opportunityId}?campaignName=${campaignName}&clinicHistory=${clinicHistory}`);
      const responseRedirectByOpportunityId = await axios.get(`${this.URL_BACK_SV}/opportunities/redirect-by-opportunity-id/${opportunityId}`, {
        params: {
          campaignName,
          clinicHistory
        }
      })
      return responseRedirectByOpportunityId.data;
    } catch (error) {
      console.error('Error getRedirectByOpportunityId', error);
      throw new BadRequestException('Error al obtener el redirect por ID de oportunidad');
    }
  }
}
  