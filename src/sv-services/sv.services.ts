import { Injectable } from "@nestjs/common";
import axios from "axios";
import { CreateClinicHistoryCrmDto } from "src/opportunity/dto/clinic-history";

@Injectable()
export class SvServices {

  private readonly URL_BACK_SV = process.env.URL_BACK_SV;
  
  constructor(
  ) {}

  async getPatientIsNew(phoneNumber: string, tokenSv: string){
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
  }

  async createClinicHistoryCrm(payloadClinicHistory: CreateClinicHistoryCrmDto, tokenSv: string ){
    const responseClinicHistory = await axios.post(`${this.URL_BACK_SV}/opportunities/create-patient-crm/`, payloadClinicHistory, {
      headers: {
        Authorization: `Bearer ${tokenSv}`
      }
    })

    return responseClinicHistory.data;
  }

  async uploadFiles(group: string, id: string, files: Express.Multer.File[], tokenSv: string) {
    const responseUploadFiles = await axios.post(`${this.URL_BACK_SV}/medical-act/upload/os/:group/:id`, { files }, {
      headers: {
        Authorization: `Bearer ${tokenSv}`
      }
    })

    return responseUploadFiles.data;
  }

  async getTokenSv(username: string, password: string) {
    const responseTokenSv = await axios.post(`${this.URL_BACK_SV}/auth/signin`, { username, password })

    return responseTokenSv.data.token;
  }

  async getStatusClient(opportunityId: string, tokenSv: string) {
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

  }

  async getPatientSV(clinicHistory: string, tokenSv: string) {
    const responsePatientSV = await axios.get(`${this.URL_BACK_SV}/clinic-history-v2/data-by-clinic-history/${clinicHistory}`, {
      headers: {
        Authorization: `Bearer ${tokenSv}`
      }
    })

    return responsePatientSV.data;
  }

  async getPatientSVByEspoId(espoId: string, tokenSv: string) {
    const responsePatientSV = await axios.get(`${this.URL_BACK_SV}/opportunities/clinic-history-crm-by-espo-id/${espoId}`, {
      headers: {
        Authorization: `Bearer ${tokenSv}`
      }
    })

    return responsePatientSV.data;
  }

  async updateClinicHistoryCrm(espoId: string, tokenSv: string, payload: Partial<CreateClinicHistoryCrmDto>) {
    const responsePatientSV = await axios.put(`${this.URL_BACK_SV}/opportunities/update-clinic-history-crm/${espoId}`, payload, {
      headers: {
        Authorization: `Bearer ${tokenSv}`
      }
    })

    return responsePatientSV.data;
  }

  async getPatientByClinicHistory(clinicHistory: string, tokenSv: string) {
    const responsePatientSV = await axios.get(`${this.URL_BACK_SV}/clinic-history/get-by-clinic-history/${clinicHistory}`, {
      headers: {
        Authorization: `Bearer ${tokenSv}`
      }
    })

    return responsePatientSV.data;
  }

  async getIRHByComprobante(comprobante: string, tokenSv: string) {
    const responsePatientSV = await axios.get(`${this.URL_BACK_SV}/service_billing_payments01/get-irh-by-comprobante/${comprobante}`, {
      headers: {
        Authorization: `Bearer ${tokenSv}`
      }
    })

    return responsePatientSV.data;
  }
}
