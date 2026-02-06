import { BadRequestException, Injectable } from "@nestjs/common";
import axios from "axios";
import { BodyAddOpportunityToQueueDto, PayloadAddOpportunityToQueueDto } from "src/opportunities-closers/dto/queue-assignment-closers";
import { UpdateQueueOpClosersDto } from "src/opportunities-closers/dto/update-op-closer.dto";
import { CreateClinicHistoryCrmDto } from "src/opportunity/dto/clinic-history";
import { PatientIsNewCrmResponse } from "./patient-is-new.types";
import { CampusListResponse } from "./campus.types";

@Injectable()
export class SvServices {

  private readonly URL_BACK_SV = process.env.URL_BACK_SV;
  private readonly usernameSv = process.env.USERNAME_ADMIN;
  private readonly passwordSv = process.env.PASSWORD_ADMIN;
  
  constructor(
  ) {}

  async getCampuses(tokenSv: string): Promise<CampusListResponse> {
    try {
      const response = await axios.get<CampusListResponse>(`${this.URL_BACK_SV}/campus`, {
        headers: { Authorization: `Bearer ${tokenSv}` },
      });
      return response.data;
    } catch (error) {
      console.error('Error getCampuses', error);
      throw new BadRequestException('Error al obtener sedes (campus) desde SV');
    }
  }

  async getPatientIsNew(phoneNumber: string, tokenSv: string): Promise<PatientIsNewCrmResponse> {
    try {
      const responseClinicHistory = await axios.get<PatientIsNewCrmResponse>(
        `${this.URL_BACK_SV}/clinic-history/patient-is-new-crm/${phoneNumber}`,
        {
          headers: {
            Authorization: `Bearer ${tokenSv}`
          }
        }
      );

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

  async getRedirectByOpportunityId(opportunityId: string, campaignName: string, phoneNumber: string, historyCLinic: string | undefined) {
    try {
      const responseRedirectByOpportunityId = await axios.get(`${this.URL_BACK_SV}/opportunities/redirect-by-opportunity-id/${opportunityId}`, {
        params: {
          campaignName,
          phoneNumber,
          historyCLinic: historyCLinic || ''
        }
      });
      return responseRedirectByOpportunityId.data;
    } catch {
      throw new BadRequestException('Error al obtener el redirect por ID de oportunidad');
    }
  }

  async getResumenEvolutivoUnidades(fechaInicio: string, fechaFin: string, page: number = 1, limit: number = 12, tokenSv: string) {
    try {
      const response = await axios.get(`${this.URL_BACK_SV}/kpi/unidades`, {
        params: {
          fecha_inicio: fechaInicio,
          fecha_fin: fechaFin,
          page,
          limit
        },
        headers: {
          Authorization: `Bearer ${tokenSv}`
        }
      })
      return response.data;
    } catch (error) {
      console.error('Error getResumenEvolutivoUnidades', error);
      throw new BadRequestException('Error al obtener resumen evolutivo en unidades desde SV');
    }
  }

  async getResumenEvolutivoPorcentajes(fechaInicio: string, fechaFin: string, page: number = 1, limit: number = 12, tokenSv: string) {
    try {
      const response = await axios.get(`${this.URL_BACK_SV}/kpi/porcentajes`, {
        params: {
          fecha_inicio: fechaInicio,
          fecha_fin: fechaFin,
          page,
          limit
        },
        headers: {
          Authorization: `Bearer ${tokenSv}`
        }
      })
      return response.data;
    } catch (error) {
      console.error('Error getResumenEvolutivoPorcentajes', error);
      throw new BadRequestException('Error al obtener resumen evolutivo en porcentajes desde SV');
    }
  }

  async getComparativoMensual(añoInicio: number, añoFin: number, tokenSv: string) {
    try {
      const response = await axios.get(`${this.URL_BACK_SV}/kpi/comparativo-mensual`, {
        params: {
          año_inicio: añoInicio.toString(),
          año_fin: añoFin.toString(),
        },
        headers: {
          Authorization: `Bearer ${tokenSv}`
        }
      });
      return response.data;
    } catch (error) {
      console.error('Error getComparativoMensual from SV', error);
      throw new BadRequestException('Error al obtener datos comparativos mensuales de KPI desde SV');
    }
  }

  // Endpoints específicos para gráficos anuales
  async getComparativoVendidasAnual(añoInicio: number, añoFin: number, tokenSv: string) {
    try {
      const response = await axios.get(`${this.URL_BACK_SV}/kpi/comparativo-vendidas-anual`, {
        params: {
          año_inicio: añoInicio.toString(),
          año_fin: añoFin.toString(),
        },
        headers: {
          Authorization: `Bearer ${tokenSv}`
        }
      });
      return response.data;
    } catch (error) {
      console.error('Error getComparativoVendidasAnual from SV', error);
      throw new BadRequestException('Error al obtener comparativo vendidas anual desde SV');
    }
  }

  async getComparativoAsistidasAnual(añoInicio: number, añoFin: number, tokenSv: string) {
    try {
      const response = await axios.get(`${this.URL_BACK_SV}/kpi/comparativo-asistidas-anual`, {
        params: {
          año_inicio: añoInicio.toString(),
          año_fin: añoFin.toString(),
        },
        headers: {
          Authorization: `Bearer ${tokenSv}`
        }
      });
      return response.data;
    } catch (error) {
      console.error('Error getComparativoAsistidasAnual from SV', error);
      throw new BadRequestException('Error al obtener comparativo asistidas anual desde SV');
    }
  }

  async getComparativoMoldesAnual(añoInicio: number, añoFin: number, tokenSv: string) {
    try {
      const response = await axios.get(`${this.URL_BACK_SV}/kpi/comparativo-moldes-anual`, {
        params: {
          año_inicio: añoInicio.toString(),
          año_fin: añoFin.toString(),
        },
        headers: {
          Authorization: `Bearer ${tokenSv}`
        }
      });
      return response.data;
    } catch (error) {
      console.error('Error getComparativoMoldesAnual from SV', error);
      throw new BadRequestException('Error al obtener comparativo moldes anual desde SV');
    }
  }

  async getComparativoTratamientosAnual(añoInicio: number, añoFin: number, tokenSv: string) {
    try {
      const response = await axios.get(`${this.URL_BACK_SV}/kpi/comparativo-tratamientos-anual`, {
        params: {
          año_inicio: añoInicio.toString(),
          año_fin: añoFin.toString(),
        },
        headers: {
          Authorization: `Bearer ${tokenSv}`
        }
      });
      return response.data;
    } catch (error) {
      console.error('Error getComparativoTratamientosAnual from SV', error);
      throw new BadRequestException('Error al obtener comparativo tratamientos anual desde SV');
    }
  }

  // Endpoints específicos para gráficos mensuales
  async getComparativoVendidasMes(añoInicio: number, añoFin: number, mes: string, tokenSv: string) {
    try {
      const response = await axios.get(`${this.URL_BACK_SV}/kpi/comparativo-vendidas-mes`, {
        params: {
          año_inicio: añoInicio.toString(),
          año_fin: añoFin.toString(),
          mes: mes,
        },
        headers: {
          Authorization: `Bearer ${tokenSv}`
        }
      });
      return response.data;
    } catch (error) {
      console.error('Error getComparativoVendidasMes from SV', error);
      throw new BadRequestException('Error al obtener comparativo vendidas mes desde SV');
    }
  }

  async getComparativoAsistidasMes(añoInicio: number, añoFin: number, mes: string, tokenSv: string) {
    try {
      const response = await axios.get(`${this.URL_BACK_SV}/kpi/comparativo-asistidas-mes`, {
        params: {
          año_inicio: añoInicio.toString(),
          año_fin: añoFin.toString(),
          mes: mes,
        },
        headers: {
          Authorization: `Bearer ${tokenSv}`
        }
      });
      return response.data;
    } catch (error) {
      console.error('Error getComparativoAsistidasMes from SV', error);
      throw new BadRequestException('Error al obtener comparativo asistidas mes desde SV');
    }
  }

  async getComparativoMoldesMes(añoInicio: number, añoFin: number, mes: string, tokenSv: string) {
    try {
      const response = await axios.get(`${this.URL_BACK_SV}/kpi/comparativo-moldes-mes`, {
        params: {
          año_inicio: añoInicio.toString(),
          año_fin: añoFin.toString(),
          mes: mes,
        },
        headers: {
          Authorization: `Bearer ${tokenSv}`
        }
      });
      return response.data;
    } catch (error) {
      console.error('Error getComparativoMoldesMes from SV', error);
      throw new BadRequestException('Error al obtener comparativo moldes mes desde SV');
    }
  }

  async getComparativoTratamientosMes(añoInicio: number, añoFin: number, mes: string, tokenSv: string) {
    try {
      const response = await axios.get(`${this.URL_BACK_SV}/kpi/comparativo-tratamientos-mes`, {
        params: {
          año_inicio: añoInicio.toString(),
          año_fin: añoFin.toString(),
          mes: mes,
        },
        headers: {
          Authorization: `Bearer ${tokenSv}`
        }
      });
      return response.data;
    } catch (error) {
      console.error('Error getComparativoTratamientosMes from SV', error);
      throw new BadRequestException('Error al obtener comparativo tratamientos mes desde SV');
    }
  }

  // ============================================================
  // Contract Pricing y Types - Métodos para contratos
  // ============================================================
  
  async getContractPricingByTreatmentCode(treatmentCode: string, tokenSv: string) {
    try {
      const response = await axios.get(
        `${this.URL_BACK_SV}/contract-pricing/by-treatment-code/${treatmentCode}`,
        {
          headers: {
            Authorization: `Bearer ${tokenSv}`
          }
        }
      );
      return response.data;
    } catch (error) {
      console.error('Error getContractPricingByTreatmentCode from SV', error);
      throw new BadRequestException(
        `Error al obtener precio de contrato por treatment_code ${treatmentCode} desde SV`
      );
    }
  }
  
  async getAllContractTypeStructure(tokenSv: string) {
    try {
      const response = await axios.get(`${this.URL_BACK_SV}/contract-type-structure`, {
        headers: {
          Authorization: `Bearer ${tokenSv}`
        }
      });
      return response.data;
    } catch (error) {
      console.error('Error getAllContractTypeStructure from SV', error);
      throw new BadRequestException('Error al obtener tipos de estructura de contratos desde SV');
    }
  }
}
  