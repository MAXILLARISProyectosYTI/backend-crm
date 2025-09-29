import { Injectable } from "@nestjs/common";
import axios from "axios";
import { CreateClinicHistoryCrmDto } from "src/opportunity/dto/clinic-history";

@Injectable()
export class SvServices {

  private readonly URL_BACK_SV = process.env.URL_BACK_SV;
  
  constructor(
  ) {}

  async getPatientIsNew(phoneNumber: string){
    const responseClinicHistory = await axios.get<{
      is_new: boolean;
      patient: any;
      complete: boolean;
      dataReservation: any;
      dataPayment: any
    }>(`${this.URL_BACK_SV}/clinic-history/patient-is-new/${phoneNumber}`);

    console.log('responseClinicHistory', responseClinicHistory.data);

    return responseClinicHistory.data;
  }

  async createClinicHistoryCrm(payloadClinicHistory: CreateClinicHistoryCrmDto){
    const responseClinicHistory = await axios.post(`${this.URL_BACK_SV}/opportunities/create-patient-crm/`, payloadClinicHistory)

    return responseClinicHistory.data;
  }
}
