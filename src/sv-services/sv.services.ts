import { BadRequestException, Injectable } from "@nestjs/common";
import axios from "axios";
import { BodyAddOpportunityToQueueDto, PayloadAddOpportunityToQueueDto } from "src/opportunities-closers/dto/queue-assignment-closers";
import { UpdateQueueOpClosersDto } from "src/opportunities-closers/dto/update-op-closer.dto";
import { CreateClinicHistoryCrmDto } from "src/opportunity/dto/clinic-history";
import { PatientIsNewCrmResponse } from "./patient-is-new.types";
import { CampusListResponse } from "./campus.types";
import { QuotationListResponse, QuotationListItem } from "./quotation-list.types";

@Injectable()
export class SvServices {

  private readonly URL_BACK_SV = process.env.URL_BACK_SV;
  /** Base URL del servicio invoice-mifact-v3 (ej. http://host/api). Usado para estado de facturación por O.S. */
  private readonly URL_INVOICE_MIFACT_V3 = process.env.URL_INVOICE_MIFACT_V3 || '';
  private readonly usernameSv = process.env.USERNAME_ADMIN;
  private readonly passwordSv = process.env.PASSWORD_ADMIN;
  /** Credenciales para login en invoice-mifact-v3. Si no se definen, se usan USERNAME_ADMIN y PASSWORD_ADMIN. */
  private readonly invoiceMifactUsername = process.env.INVOICE_MIFACT_USERNAME || process.env.USERNAME_ADMIN || '';
  private readonly invoiceMifactPassword = process.env.INVOICE_MIFACT_PASSWORD ?? process.env.PASSWORD_ADMIN ?? '';

  constructor(
  ) { }

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

  /**
   * Sede (campus) asociada a una historia clínica; según contrato debe venir de facturación.
   * GET /clinic-history/sede-by-clinic-history/:clinicHistory — ver docs/sv-api-requirements.md
   * Acepta respuesta con campusName/campus_name y campusId/campus_id.
   */
  async getSedeByClinicHistory(
    clinicHistory: string,
    tokenSv: string,
  ): Promise<{ campusId?: number; campusName?: string } | null> {
    try {
      const encoded = encodeURIComponent(clinicHistory);
      const response = await axios.get(
        `${this.URL_BACK_SV}/clinic-history/sede-by-clinic-history/${encoded}`,
        { headers: { Authorization: `Bearer ${tokenSv}` } },
      );
      const raw = response.data;
      const data = raw?.data != null ? raw.data : raw;
      if (!data || (data.campusName == null && data.campus_name == null && data.campusId == null && data.campus_id == null)) {
        return null;
      }
      const campusName = data.campusName ?? data.campus_name ?? null;
      const campusId = data.campusId ?? data.campus_id ?? null;
      return { campusId: campusId != null ? Number(campusId) : undefined, campusName: campusName != null ? String(campusName) : undefined };
    } catch (err) {
      console.error('getSedeByClinicHistory error', clinicHistory, err instanceof Error ? err.message : err);
      return null;
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

  async createClinicHistoryCrm(payloadClinicHistory: CreateClinicHistoryCrmDto, tokenSv: string) {
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

      return { data: responseTokenSv.data, tokenSv: responseTokenSv.data.token };
    } catch (error) {
      console.log('error', error);
      throw new BadRequestException('Error al obtener el token de SV');
    }
  }

  async getTokenSvAdmin() {
    try {
      const responseTokenSv = await axios.post(`${this.URL_BACK_SV}/auth/signin`, { username: this.usernameSv, password: this.passwordSv })

      return { data: responseTokenSv.data, tokenSv: responseTokenSv.data.token };
    } catch (error) {
      console.error('Error getTokenSvAdmin', error);
      throw new BadRequestException('Error al obtener el token administrativo de SV');
    }
  }

  async getStatusClient(opportunityId: string, tokenSv: string) {
    try {
      const responseStatusClient: {
        data: {
          espoId: string;
          id_payment?: number;
          id_reservation?: number;
          patientId?: number;
        }
      } = await axios.get(`${this.URL_BACK_SV}/opportunities/status-patient-crm/${opportunityId}`, {
        headers: {
          Authorization: `Bearer ${tokenSv}`
        }
      })

      const data = responseStatusClient.data;
      // Mostrar botón Historia Clínica cuando el paciente está vinculado (patientId + espoId).
      // Para pago con factura también hay id_payment/id_reservation; para efectivo solo patientId+espoId.
      if (data.patientId && data.espoId) {
        return true;
      }
      return false;

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

  /**
   * Obtiene token para el servicio invoice-mifact-v3 (login).
   * POST {URL_INVOICE_MIFACT_V3}/auth/signin con username/password.
   * Usa INVOICE_MIFACT_USERNAME e INVOICE_MIFACT_PASSWORD si están definidos; si no, USERNAME_ADMIN y PASSWORD_ADMIN.
   * @returns token o null si no hay URL/credenciales o falla el login
   */
  async getTokenInvoiceMifact(): Promise<string | null> {
    if (!this.URL_INVOICE_MIFACT_V3) return null;
    if (!this.invoiceMifactUsername || this.invoiceMifactPassword === undefined || this.invoiceMifactPassword === null) {
      console.warn('Credenciales invoice-mifact no configuradas (INVOICE_MIFACT_USERNAME / INVOICE_MIFACT_PASSWORD o USERNAME_ADMIN / PASSWORD_ADMIN)');
      return null;
    }
    try {
      const base = this.URL_INVOICE_MIFACT_V3.replace(/\/$/, '');
      const loginUrl = `${base}/auth/signin`;
      const response = await axios.post<{ token?: string; access_token?: string }>(loginUrl, {
        username: this.invoiceMifactUsername,
        password: this.invoiceMifactPassword,
      }, { timeout: 10000 });
      const token = response.data?.token ?? response.data?.access_token;
      return token ?? null;
    } catch (error) {
      console.error('Error getTokenInvoiceMifact (login invoice-mifact-v3)', error);
      return null;
    }
  }

  /**
   * Consulta si una orden de servicio (O.S) está facturada.
   * GET {URL_INVOICE_MIFACT_V3}/service-order/:serviceOrderId/invoice-status
   * Requiere login previo: se usa getTokenInvoiceMifact() si no se pasa token.
   * Excluye status_invoice 105 (nota de crédito) y 107 (eliminado). Retorna el último comprobante válido.
   * @param serviceOrderId ID de la orden de servicio
   * @param token Opcional; si no se pasa, se obtiene con getTokenInvoiceMifact()
   * @returns null si URL no configurada o falla login/request
   */
  async getInvoiceStatusByServiceOrderId(
    serviceOrderId: number,
    token?: string | null,
  ): Promise<{
    facturado: boolean;
    urls?: { soles?: string; dolares?: string };
    invoice_result_head_id?: number;
  } | null> {
    if (!this.URL_INVOICE_MIFACT_V3) {
      console.warn('URL_INVOICE_MIFACT_V3 no configurada; no se puede consultar estado de facturación por O.S');
      return null;
    }
    const authToken = token ?? await this.getTokenInvoiceMifact();
    if (!authToken) {
      console.warn('No se pudo obtener token para invoice-mifact-v3');
      return null;
    }
    try {
      const url = `${this.URL_INVOICE_MIFACT_V3.replace(/\/$/, '')}/service-order/${serviceOrderId}/invoice-status`;
      const response = await axios.get<{ facturado: boolean; urls?: { soles?: string; dolares?: string }; invoice_result_head_id?: number }>(url, {
        timeout: 15000,
        headers: { Authorization: `Bearer ${authToken}` },
      });
      return response.data;
    } catch (error) {
      console.error('Error getInvoiceStatusByServiceOrderId', serviceOrderId, error);
      return null;
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

  /**
   * Listado de cotizaciones (todas o paginado). Contrato: docs/sv-api-requirements.md
   * GET /quotation/list — page, limit (máx. 500), dateFrom, dateTo, status opcionales.
   */
  async getQuotationsAll(
    tokenSv: string,
    params?: {
      page?: number;
      limit?: number;
      dateFrom?: string;
      dateTo?: string;
      status?: number;
    },
  ): Promise<QuotationListResponse> {
    try {
      const query: Record<string, number | string | undefined> = {
        page: params?.page ?? 1,
        limit: Math.min(params?.limit ?? 500, 500),
      };
      if (params?.dateFrom) query.dateFrom = params.dateFrom;
      if (params?.dateTo) query.dateTo = params.dateTo;
      if (params?.status !== undefined && params?.status !== null) query.status = params.status;

      const response = await axios.get<QuotationListResponse>(
        `${this.URL_BACK_SV}/quotation/list`,
        {
          headers: { Authorization: `Bearer ${tokenSv}` },
          params: query,
        },
      );
      const data = response.data;
      if (Array.isArray(data)) {
        return { data: data as any, total: data.length };
      }
      return {
        data: data.data ?? [],
        total: data.total,
        page: data.page,
        totalPages: data.totalPages,
      };
    } catch (error) {
      console.error('Error getQuotationsAll', error);
      throw new BadRequestException('Error al obtener el listado de cotizaciones desde SV');
    }
  }

  /**
   * Búsqueda en SV cuando el CRM no tiene resultados. GET /quotation/search?q= — ver docs/sv-api-requirements.md
   */
  /**
   * POST /quotation/treatment-types — Devuelve OI|OFM|APNEA por lote de cotizacionIds.
   * Una sola query al SV para toda la página de cerradoras.
   */
  async getTreatmentTypesByQuotationIds(
    tokenSv: string,
    quotationIds: number[],
  ): Promise<Record<number, { tipo: 'OI' | 'OFM' | 'APNEA'; fecha: string | null }>> {
    if (!quotationIds.length) return {};
    try {
      const response = await axios.post<Record<number, { tipo: 'OI' | 'OFM' | 'APNEA'; fecha: string | null }>>(
        `${this.URL_BACK_SV}/quotation/treatment-types`,
        { quotationIds },
        { headers: { Authorization: `Bearer ${tokenSv}` } },
      );
      return response.data ?? {};
    } catch (err) {
      console.error('getTreatmentTypesByQuotationIds error', err instanceof Error ? err.message : err);
      return {};
    }
  }

  async getQuotationSearch(tokenSv: string, q: string): Promise<QuotationListItem[]> {
    if (!q?.trim()) return [];
    try {
      const response = await axios.get<{ data?: QuotationListItem[] }>(
        `${this.URL_BACK_SV}/quotation/search`,
        {
          headers: { Authorization: `Bearer ${tokenSv}` },
          params: { q: q.trim() },
        },
      );
      const data = response.data;
      if (Array.isArray(data)) return data as QuotationListItem[];
      return Array.isArray(data?.data) ? data.data : [];
    } catch {
      return [];
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

  async getRedirectByOpportunityId(
    opportunityId: string,
    campaignName: string,
    phoneNumber: string,
    historyCLinic: string | undefined,
    forceInitialFlow?: boolean,
  ) {
    try {
      const params: Record<string, string> = {
        campaignName,
        phoneNumber,
        historyCLinic: historyCLinic || '',
      };
      if (forceInitialFlow === true) {
        params.forceInitialFlow = 'true';
      }
      const responseRedirectByOpportunityId = await axios.get(
        `${this.URL_BACK_SV}/opportunities/redirect-by-opportunity-id/${opportunityId}`,
        { params },
      );
      return responseRedirectByOpportunityId.data;
    } catch {
      throw new BadRequestException('Error al obtener el redirect por ID de oportunidad');
    }
  }

  /**
   * Obtiene reserva y pago para flujo completo (cuando clinic_history_crm tiene id_reservation e id_payment).
   * GET {URL_BACK_SV}/opportunities/full-flow-data/:opportunityId
   * El backend SV debe implementar este endpoint y devolver { reservation?, payment? } según clinic_history_crm.
   */
  async getFullFlowDataByOpportunityId(
    opportunityId: string,
    tokenSv: string,
  ): Promise<{ reservation?: unknown; payment?: unknown }> {
    try {
      const response = await axios.get(
        `${this.URL_BACK_SV}/opportunities/full-flow-data/${opportunityId}`,
        { headers: { Authorization: `Bearer ${tokenSv}` } },
      );
      const data = response.data?.data ?? response.data ?? {};
      return {
        reservation: data.reservation ?? undefined,
        payment: data.payment ?? undefined,
      };
    } catch {
      return {};
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

  // ============================================================
  // CRM Controles — Billing proxy (invoice + isFirstFreeControl)
  // ============================================================

  private readonly URL_SCHEDULE_BACKEND = process.env.URL_SCHEDULE_BACKEND || '';

  async checkIsFirstFreeControl(patientId: number): Promise<Record<string, unknown>> {
    if (!this.URL_SCHEDULE_BACKEND) {
      throw new BadRequestException('URL_SCHEDULE_BACKEND no configurada');
    }
    const base = this.URL_SCHEDULE_BACKEND.replace(/\/$/, '');
    const url = `${base}/reservation_http/is-first-control/${patientId}`;
    try {
      const response = await axios.get(url, { timeout: 15000 });
      return response.data;
    } catch (error) {
      console.error('Error checkIsFirstFreeControl', patientId, error);
      throw new BadRequestException(`Error al verificar primer control gratuito para paciente ${patientId}`);
    }
  }

  async checkUrgencyControl(patientId: number): Promise<Record<string, unknown>> {
    if (!this.URL_SCHEDULE_BACKEND) {
      throw new BadRequestException('URL_SCHEDULE_BACKEND no configurada');
    }
    const base = this.URL_SCHEDULE_BACKEND.replace(/\/$/, '');
    const url = `${base}/reservation_http/urgency-control-check/${patientId}`;
    try {
      const response = await axios.get(url, { timeout: 15000 });
      return response.data;
    } catch (error) {
      console.error('Error checkUrgencyControl', patientId, error);
      throw new BadRequestException(`Error al verificar control de urgencia para paciente ${patientId}`);
    }
  }

  async getInvoiceData(clinicHistoryId: number, tokenSv: string): Promise<Record<string, unknown>> {
    if (!this.URL_BACK_SV) throw new BadRequestException('URL_BACK_SV no configurada');
    const base = this.URL_BACK_SV.replace(/\/$/, '');
    const url = `${base}/clinic-history/invoice-data/${clinicHistoryId}`;
    try {
      const response = await axios.get(url, {
        headers: { Authorization: `Bearer ${tokenSv}` },
        timeout: 15000,
      });
      return response.data;
    } catch (error) {
      console.error('Error getInvoiceData', clinicHistoryId, error);
      throw new BadRequestException(`Error al obtener datos de facturación para HC ${clinicHistoryId}`);
    }
  }

  async createControlInvoice(payload: Record<string, unknown>, tokenSv: string): Promise<Record<string, unknown>> {
    if (!this.URL_BACK_SV) throw new BadRequestException('URL_BACK_SV no configurada');
    const base = this.URL_BACK_SV.replace(/\/$/, '');
    const url = `${base}/invoice-mifact-v3/create-service-order-and-invoice`;
    try {
      const response = await axios.post(url, payload, {
        headers: {
          Authorization: `Bearer ${tokenSv}`,
          'Content-Type': 'application/json',
        },
        timeout: 30000,
      });
      return response.data;
    } catch (error: any) {
      const msg = error?.response?.data?.message || error?.message || 'Error desconocido';
      console.error('Error createControlInvoice', msg);
      throw new BadRequestException(`Error al crear OS e invoice: ${msg}`);
    }
  }

  async getContractQuotas(clinicHistoryId: number, tokenSv: string): Promise<Record<string, unknown>[]> {
    if (!this.URL_BACK_SV) throw new BadRequestException('URL_BACK_SV no configurada');
    const base = (this.URL_BACK_SV as string).replace(/\/$/, '');
    try {
      const contractUrl = `${base}/contract/patient-contracts/${clinicHistoryId}`;
      const contractRes = await axios.get(contractUrl, {
        headers: { Authorization: `Bearer ${tokenSv}` },
        timeout: 15000,
      });
      const contracts: any[] = Array.isArray(contractRes.data) ? contractRes.data : [];

      const activeContracts = contracts
        .filter((c: any) => c.state === 1)
        .sort((a: any, b: any) => b.id - a.id);
      if (activeContracts.length === 0) return [];

      const contractId = activeContracts[0].id;
      const detailUrl = `${base}/contract/detail-contract-full/${contractId}`;
      const detailRes = await axios.get(detailUrl, {
        headers: { Authorization: `Bearer ${tokenSv}` },
        timeout: 15000,
      });
      return Array.isArray(detailRes.data) ? detailRes.data : [];
    } catch (error) {
      console.error('Error getContractQuotas', clinicHistoryId, error);
      return [];
    }
  }

  async getQuotaInvoiceDetails(contractDetailId: number, tokenSv: string): Promise<Record<string, unknown>[]> {
    if (!this.URL_BACK_SV) throw new BadRequestException('URL_BACK_SV no configurada');
    const base = (this.URL_BACK_SV as string).replace(/\/$/, '');
    try {
      const url = `${base}/contract/detail-paiment-fixed-contract/${contractDetailId}`;
      const res = await axios.get(url, {
        headers: { Authorization: `Bearer ${tokenSv}` },
        timeout: 15000,
      });
      return Array.isArray(res.data) ? res.data : [];
    } catch (error) {
      console.error('Error getQuotaInvoiceDetails', contractDetailId, error);
      return [];
    }
  }

  async getPatientCampus(clinicHistoryId: number, tokenSv: string): Promise<{ campusId: number; campusName: string }> {
    if (!this.URL_BACK_SV) throw new BadRequestException('URL_BACK_SV no configurada');
    const base = (this.URL_BACK_SV as string).replace(/\/$/, '');
    try {
      const res = await axios.get(`${base}/clinic-history/${clinicHistoryId}`, {
        headers: { Authorization: `Bearer ${tokenSv}` },
        timeout: 10000,
      });
      const data = res.data;
      const campus = data?.campus;
      return {
        campusId: campus?.id ?? 1,
        campusName: campus?.name ?? 'Lima',
      };
    } catch (error) {
      console.error('Error getPatientCampus', clinicHistoryId, error);
      return { campusId: 1, campusName: 'Lima' };
    }
  }

  // ── Agenda Services ───────────────────────────────────────────────────────

  async getDoctorsForDate(date: string, campusId: number | null, tokenSv: string): Promise<any[]> {
    if (!this.URL_BACK_SV) throw new BadRequestException('URL_BACK_SV no configurada');
    const base = (this.URL_BACK_SV as string).replace(/\/$/, '');
    const path = campusId != null
      ? `/doctor/all/info-for-doctor/${date}/${campusId}`
      : `/doctor/all/info-for-doctor/${date}`;
    try {
      const res = await axios.get(`${base}${path}`, {
        headers: { Authorization: `Bearer ${tokenSv}` },
        timeout: 15000,
      });
      const raw = Array.isArray(res.data) ? res.data : [];
      return raw.map((d: any) => ({
        ...d,
        id: d.id_doctor,
        name: d.name_doctor,
        enviroment: d.enviroment ?? '',
        id_enviroment: d.id_enviroment ?? 0,
        state: d.state ?? 1,
      }));
    } catch (error) {
      console.error('Error getDoctorsForDate', date, error);
      return [];
    }
  }

  async createReservation(data: Record<string, unknown>, tokenSv: string): Promise<Record<string, unknown>> {
    if (!this.URL_SCHEDULE_BACKEND) throw new BadRequestException('URL_SCHEDULE_BACKEND no configurada');
    const base = this.URL_SCHEDULE_BACKEND.replace(/\/$/, '');
    try {
      const res = await axios.post(`${base}/reservation_http`, data, {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenSv}`,
        },
        timeout: 20000,
      });
      return res.data;
    } catch (error) {
      console.error('Error createReservation', error);
      throw new BadRequestException('Error al crear reserva');
    }
  }

  async cancelReservation(
    reservationId: number,
    userId: number,
    reason: string,
    tokenSv: string,
  ): Promise<{ code: number; message: string }> {
    if (!this.URL_SCHEDULE_BACKEND) throw new BadRequestException('URL_SCHEDULE_BACKEND no configurada');
    const base = this.URL_SCHEDULE_BACKEND.replace(/\/$/, '');
    try {
      const res = await axios.post<{ code: number; message: string }>(
        `${base}/reservation_http/reservation-cancel-for-client`,
        {
          idReservation: reservationId,
          idState: 0,
          idUser: userId,
          motivoCancel: reason,
          claster_cancel: true,
          flagNoConfirm: true,
        },
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${tokenSv}`,
          },
          timeout: 15000,
        },
      );
      return res.data;
    } catch (error) {
      console.error('Error cancelReservation', reservationId, error);
      throw new BadRequestException(`Error al cancelar reserva ${reservationId}`);
    }
  }

  async linkReservationToOS(osIds: number[], reservationId: number, tokenSv: string): Promise<{ message: string }> {
    if (!this.URL_BACK_SV) throw new BadRequestException('URL_BACK_SV no configurada');
    const base = (this.URL_BACK_SV as string).replace(/\/$/, '');
    try {
      const res = await axios.patch(
        `${base}/service-order-api/update-reservation`,
        { id: osIds, idreservation: reservationId },
        {
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenSv}` },
          timeout: 10000,
        },
      );
      return res.data;
    } catch (error) {
      console.error('Error linkReservationToOS', osIds, reservationId, error);
      throw new BadRequestException('Error al vincular OS con reserva');
    }
  }

  async getInvoiceQueueStatus(queueId: number, tokenSv: string): Promise<Record<string, unknown>> {
    if (!this.URL_BACK_SV) throw new BadRequestException('URL_BACK_SV no configurada');
    const base = (this.URL_BACK_SV as string).replace(/\/$/, '');
    const url = `${base}/invoice-mifact-v3/status/${queueId}`;
    try {
      const response = await axios.get(url, {
        headers: { Authorization: `Bearer ${tokenSv}` },
        timeout: 15000,
      });
      return response.data;
    } catch (error) {
      console.error('Error getInvoiceQueueStatus', queueId, error);
      throw new BadRequestException(`Error al obtener estado de cola ${queueId}`);
    }
  }

  async getControlPrice(clinicHistoryId: number, tokenSv: string): Promise<{ amount: number; currency: string }> {
    if (!this.URL_BACK_SV) throw new BadRequestException('URL_BACK_SV no configurada');
    const base = (this.URL_BACK_SV as string).replace(/\/$/, '');
    const res = await axios.get(`${base}/tariff/58`, {
      headers: { Authorization: `Bearer ${tokenSv}` },
      timeout: 10000,
    });
    const tariff = res.data;
    if (!tariff || tariff.price_sol == null) {
      throw new BadRequestException('No se pudo obtener el precio de la tarifa Control OFM');
    }
    return { amount: tariff.price_sol, currency: 'PEN' };
  }

  async getPatientServiceOrders(clinicHistoryId: number, tokenSv: string): Promise<Record<string, unknown>[]> {
    if (!this.URL_BACK_SV) throw new BadRequestException('URL_BACK_SV no configurada');
    const base = (this.URL_BACK_SV as string).replace(/\/$/, '');
    try {
      const res = await axios.get(
        `${base}/service-order-v2/serviceOrderInvoiceNewVersion/${clinicHistoryId}`,
        { headers: { Authorization: `Bearer ${tokenSv}` }, timeout: 15000 },
      );
      return Array.isArray(res.data) ? res.data : [];
    } catch (error) {
      console.error('Error getPatientServiceOrders', clinicHistoryId, error);
      return [];
    }
  }

  /**
   * Detecta OS de Control OFM facturadas pero SIN reservación agendada.
   * Usa el endpoint payments que expone so.idreservation directamente.
   * Devuelve la lista completa de OS sin agendar con datos para el selector UI.
   */
  async getPendingControlOS(clinicHistoryId: number, tokenSv: string): Promise<{
    hasUnscheduledOS: boolean;
    serviceOrderId: number | null;
    serviceOrders: {
      id: number;
      date: string | null;
      amount: number;
      currency: string;
      serie: string | null;
      correlative: string | null;
      tariffName: string;
      pdfUrl: string | null;
    }[];
  }> {
    if (!this.URL_BACK_SV) throw new BadRequestException('URL_BACK_SV no configurada');
    const base = (this.URL_BACK_SV as string).replace(/\/$/, '');
    const noResult = { hasUnscheduledOS: false, serviceOrderId: null, serviceOrders: [] };
    try {
      const [paymentsRes, osInvoiceRes] = await Promise.all([
        axios.get(`${base}/service-order-api/payments`, {
          params: { idClinicHistory: clinicHistoryId },
          headers: { Authorization: `Bearer ${tokenSv}` },
          timeout: 15000,
        }),
        axios.get(`${base}/service-order-v2/serviceOrderInvoiceNewVersion/${clinicHistoryId}`, {
          headers: { Authorization: `Bearer ${tokenSv}` },
          timeout: 15000,
        }),
      ]);

      const rows: any[] = Array.isArray(paymentsRes.data) ? paymentsRes.data : [];
      const invoicedOS: any[] = Array.isArray(osInvoiceRes.data) ? osInvoiceRes.data : [];

      const unscheduled = rows.filter((r: any) => {
        const osId = Number(r.id_service_order);
        const reservation = r.reservation;
        const reservationState = Number(r.reservation_state);
        const tariffName = String(r.tariff_name || '').toLowerCase();
        const hasNoReservation = reservation == null || reservation === 0 || reservation === '';
        const hasCancelledReservation = !hasNoReservation && reservationState === 0;
        const isControlOFM = tariffName.includes('control ofm') || Number(r.tariff_id) === 58;
        return osId > 0 && (hasNoReservation || hasCancelledReservation) && isControlOFM;
      });

      // Indexar OS facturadas por serie-correlativo para buscar PDF
      const invoiceBySerieMap = new Map<string, any>();
      for (const inv of invoicedOS) {
        const details: any[] = inv.detail || [];
        for (const d of details) {
          if (d.serie_invoice && d.number_invoice) {
            invoiceBySerieMap.set(`${d.serie_invoice}-${d.number_invoice}`, inv);
          }
        }
      }

      // Deduplicar y enriquecer con datos de factura + PDF
      const seen = new Set<number>();
      const enriched: {
        id: number;
        date: string | null;
        amount: number;
        currency: string;
        serie: string | null;
        correlative: string | null;
        tariffName: string;
        pdfUrl: string | null;
      }[] = [];

      for (const r of unscheduled) {
        const osId = Number(r.id_service_order);
        if (seen.has(osId)) continue;
        seen.add(osId);

        const amount = Number(r.amount) || 0;
        const currencyId = Number(r.id_currency);
        const serie = r.serie_invoice || null;
        const correlative = r.correlative_invoice ? String(r.correlative_invoice) : null;

        let pdfUrl: string | null = null;
        let matchedInv: any = null;
        if (serie && correlative) {
          const key = `${serie}-${correlative}`;
          matchedInv = invoiceBySerieMap.get(key);
          if (matchedInv?.physical_receipt?.length > 0) {
            pdfUrl = matchedInv.physical_receipt.find((pr: any) => pr.url)?.url || null;
          }
        }

        enriched.push({
          id: osId,
          date: r.date_service_order || r.payment_date || matchedInv?.date_service_order || null,
          amount,
          currency: currencyId === 1 ? 'PEN' : 'USD',
          serie,
          correlative,
          tariffName: String(r.tariff_name || 'Control OFM'),
          pdfUrl,
        });
      }

      if (enriched.length === 0) return noResult;

      return {
        hasUnscheduledOS: true,
        serviceOrderId: enriched[0].id,
        serviceOrders: enriched,
      };
    } catch (error) {
      console.error('Error getPendingControlOS', clinicHistoryId, error);
      return noResult;
    }
  }

  /**
   * Cohorte para CRM Controles: pacientes con ejecutivo de controles asignado.
   * Usa el endpoint existente en SV: GET /union_doctor_patient_attention/search_patient_with_users_controlls
   * Sobreescribible con la variable de entorno SV_CRM_CONTROLES_PATH.
   *
   * Campos que devuelve SV:
   *   id_registro, id_historia_clinica, nombre_paciente, ap_paterno, ap_materno,
   *   numero_documento, fecha_nacimiento, historia_clinica, sexo, email, phone,
   *   cellphone, nombre_distrito, id_doctor, nombre_docto, ejecutivo_cobranzas,
   *   ejecutivo_controles, ejecutivo_ventas, created_at, id_status_borrado
   */
  async getCrmControlesPatientsFromSv(
    tokenSv: string,
  ): Promise<Record<string, unknown>[]> {
    if (!this.URL_BACK_SV) {
      throw new BadRequestException('URL_BACK_SV no configurada');
    }
    const path =
      process.env.SV_CRM_CONTROLES_PATH?.trim() ||
      '/union_doctor_patient_attention/search_patient_with_users_controlls';
    const base = this.URL_BACK_SV.replace(/\/$/, '');
    const suffix = path.startsWith('/') ? path : `/${path}`;
    const url = `${base}${suffix}`;
    const timeout = Number(process.env.SV_CRM_CONTROLES_TIMEOUT_MS ?? 120000);
    try {
      const response = await axios.get<unknown>(url, {
        headers: { Authorization: `Bearer ${tokenSv}` },
        timeout,
      });
      const raw = response.data;
      if (Array.isArray(raw)) {
        return raw as Record<string, unknown>[];
      }
      if (raw && typeof raw === 'object' && 'data' in raw && Array.isArray((raw as { data: unknown }).data)) {
        return (raw as { data: Record<string, unknown>[] }).data;
      }
      if (raw && typeof raw === 'object' && 'items' in raw && Array.isArray((raw as { items: unknown }).items)) {
        return (raw as { items: Record<string, unknown>[] }).items;
      }
      return [];
    } catch (error) {
      console.error('Error getCrmControlesPatientsFromSv', url, error);
      throw new BadRequestException(
        `Error al obtener pacientes CRM Controles desde SV — url: ${url}`,
      );
    }
  }

  async getCrmControlesSinglePatientFromSv(
    tokenSv: string,
    clinicHistoryId: number,
  ): Promise<Record<string, unknown> | null> {
    if (!this.URL_BACK_SV) {
      throw new BadRequestException('URL_BACK_SV no configurada');
    }
    const path =
      process.env.SV_CRM_CONTROLES_PATH?.trim() ||
      '/union_doctor_patient_attention/search_patient_with_users_controlls';
    const base = this.URL_BACK_SV.replace(/\/$/, '');
    const suffix = path.startsWith('/') ? path : `/${path}`;
    const url = `${base}${suffix}?clinicHistoryId=${clinicHistoryId}`;
    try {
      const response = await axios.get<unknown>(url, {
        headers: { Authorization: `Bearer ${tokenSv}` },
        timeout: 15000,
      });
      const raw = response.data;
      const rows: Record<string, unknown>[] = Array.isArray(raw)
        ? raw
        : raw && typeof raw === 'object' && 'data' in raw && Array.isArray((raw as { data: unknown }).data)
          ? (raw as { data: Record<string, unknown>[] }).data
          : [];
      return rows[0] ?? null;
    } catch (error) {
      console.error('Error getCrmControlesSinglePatientFromSv', url, error);
      return null;
    }
  }

  /**
   * Timeline completo de un paciente OFM: todas sus reservaciones (state=1)
   * ordenadas cronológicamente desde la primera hasta la más reciente.
   * GET /union_doctor_patient_attention/timeline/:patientId
   */
  async getCrmPatientTimelineFromSv(
    patientId: number,
    tokenSv: string,
  ): Promise<Record<string, unknown>[]> {
    if (!this.URL_BACK_SV) {
      throw new BadRequestException('URL_BACK_SV no configurada');
    }
    const base = this.URL_BACK_SV.replace(/\/$/, '');
    const url = `${base}/union_doctor_patient_attention/timeline/${patientId}`;
    const timeout = Number(process.env.SV_CRM_CONTROLES_TIMEOUT_MS ?? 30000);
    try {
      const response = await axios.get<unknown>(url, {
        headers: { Authorization: `Bearer ${tokenSv}` },
        timeout,
      });
      const raw = response.data;
      if (Array.isArray(raw)) return raw as Record<string, unknown>[];
      return [];
    } catch (error) {
      console.error('Error getCrmPatientTimelineFromSv', patientId, error);
      throw new BadRequestException(
        `Error al obtener timeline del paciente ${patientId} desde SV`,
      );
    }
  }

  /**
   * Últimas notas médicas de un paciente desde SV.
   * GET /clinic-history-notes/get-patient-notes/:clinicHistoryId
   */
  async getPatientMedicalNotesFromSv(
    clinicHistoryId: number,
    tokenSv: string,
  ): Promise<Record<string, unknown>[]> {
    if (!this.URL_BACK_SV) {
      throw new BadRequestException('URL_BACK_SV no configurada');
    }
    const base = this.URL_BACK_SV.replace(/\/$/, '');
    const url = `${base}/clinic-history-notes/get-patient-notes/${clinicHistoryId}`;
    const timeout = Number(process.env.SV_CRM_CONTROLES_TIMEOUT_MS ?? 30000);
    try {
      const response = await axios.get<unknown>(url, {
        headers: { Authorization: `Bearer ${tokenSv}` },
        timeout,
      });
      const raw = response.data;
      if (Array.isArray(raw)) return raw as Record<string, unknown>[];
      return [];
    } catch (error) {
      console.error('Error getPatientMedicalNotesFromSv', clinicHistoryId, error);
      throw new BadRequestException(
        `Error al obtener notas médicas del paciente ${clinicHistoryId} desde SV`,
      );
    }
  }

  /**
   * Obtiene sesiones de control OFM desde SV
   * (tariff 58 = control, 192 = instalación primer dispositivo, 198 = control OFM).
   */
  async getCrmControlesSessionsFromSv(
    tokenSv: string,
  ): Promise<Record<string, unknown>[]> {
    if (!this.URL_BACK_SV) {
      throw new BadRequestException('URL_BACK_SV no configurada');
    }
    const base = this.URL_BACK_SV.replace(/\/$/, '');
    const url = `${base}/union_doctor_patient_attention/controles-ofm`;
    const timeout = Number(process.env.SV_CRM_CONTROLES_TIMEOUT_MS ?? 120000);
    try {
      const response = await axios.get<unknown>(url, {
        headers: { Authorization: `Bearer ${tokenSv}` },
        timeout,
      });
      const raw = response.data;
      if (Array.isArray(raw)) return raw as Record<string, unknown>[];
      return [];
    } catch (error) {
      console.error('Error getCrmControlesSessionsFromSv', url, error);
      throw new BadRequestException(
        `Error al obtener controles OFM desde SV — url: ${url}`,
      );
    }
  }

  /**
   * Facturación de controles OFM desde SV — invoice_result_body con fecha_abono,
   * método de pago, moneda, campus, ejecutivo.
   */
  async getFacturacionControlesFromSv(
    tokenSv: string,
  ): Promise<Record<string, unknown>[]> {
    if (!this.URL_BACK_SV) {
      throw new BadRequestException('URL_BACK_SV no configurada');
    }
    const base = this.URL_BACK_SV.replace(/\/$/, '');
    const url = `${base}/union_doctor_patient_attention/facturacion-controles-ofm`;
    const timeout = Number(process.env.SV_CRM_CONTROLES_TIMEOUT_MS ?? 120000);
    try {
      const response = await axios.get<unknown>(url, {
        headers: { Authorization: `Bearer ${tokenSv}` },
        timeout,
      });
      const raw = response.data;
      if (Array.isArray(raw)) return raw as Record<string, unknown>[];
      return [];
    } catch (error) {
      console.error('Error getFacturacionControlesFromSv', url, error);
      throw new BadRequestException(
        `Error al obtener facturación controles desde SV — url: ${url}`,
      );
    }
  }

  /**
   * Reprogramaciones de controles OFM — cantidad por día y campus.
   */
  async getReprogramacionesControlesFromSv(
    tokenSv: string,
  ): Promise<Record<string, unknown>[]> {
    if (!this.URL_BACK_SV) {
      throw new BadRequestException('URL_BACK_SV no configurada');
    }
    const base = this.URL_BACK_SV.replace(/\/$/, '');
    const url = `${base}/union_doctor_patient_attention/reprogramaciones-controles-ofm`;
    const timeout = Number(process.env.SV_CRM_CONTROLES_TIMEOUT_MS ?? 120000);
    try {
      const response = await axios.get<unknown>(url, {
        headers: { Authorization: `Bearer ${tokenSv}` },
        timeout,
      });
      const raw = response.data;
      if (Array.isArray(raw)) return raw as Record<string, unknown>[];
      return [];
    } catch (error) {
      console.error('Error getReprogramacionesControlesFromSv', url, error);
      throw new BadRequestException(
        `Error al obtener reprogramaciones desde SV — url: ${url}`,
      );
    }
  }
}
