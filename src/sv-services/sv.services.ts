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
    const responseStatusClient = await axios.get(`${this.URL_BACK_SV}/opportunities/status-client/${opportunityId}`, {
      headers: {
        Authorization: `Bearer ${tokenSv}`
      }
    })

    
  }
}
