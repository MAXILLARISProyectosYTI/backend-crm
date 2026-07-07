import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client } from 'pg';
import {
  type SvDatabaseConfig,
  resolveSvDatabaseConfig,
} from '../../config/sv-database.config';
import { ReferralCashbackCurrency, currencyFromSvCoinId } from '../enums/referral-cashback.enums';
import {
  OFM_DESC_NORM_IS_CUOTA,
  OFM_DESC_NORM_IS_PRIMER_PAGO,
  ofmDetailIsCuotaInstallment,
  ofmDetailIsPrimerPago,
  ofmPrimerPagoStatusCte,
  ofmPrimerPagoStatusSelect,
  resolveOfmModality,
} from './ofm-contract-detail-sql';

/** SV quotation.idbusinessline — Odontología Integral */
const OI_BUSINESS_LINE_ID = 2;

export type ReferralCashbackSvSourceType =
  | 'OFM_CONTADO_COMPLETE'
  | 'OFM_CUOTAS_INICIAL'
  | 'OFM_CUOTAS_REMAINDER'
  | 'OI_FULL_PLAN'
  | 'OI_STANDALONE_TARIFF';

/** Fase de cashback OFM — idempotencia por contrato + fase */
export type ReferralCashbackOfmCashbackPhase =
  | 'contado_complete'
  | 'cuotas_inicial'
  | 'cuotas_remainder';

export interface SvInvoiceCashbackContext {
  sourceIrbId: number;
  patientId: number;
  contractId: number | null;
  treatmentPlanId: number | null;
  tariffId: number | null;
  invoiceHeadId: number | null;
  treatmentCode?: string;
  contractType?: string;
  invoicedAmount: number;
  currency: ReferralCashbackCurrency;
  sourceType: ReferralCashbackSvSourceType;
  cashbackPhase?: ReferralCashbackOfmCashbackPhase;
  isEligible: boolean;
  skipReason?: string;
}

export interface SvClinicHistoryBrief {
  patientId: number;
  history: string;
  fullName: string;
}

export interface SvIrbCashbackDetail {
  irbId: number;
  amount: number;
  currency: ReferralCashbackCurrency;
  serviceOrderId: number | null;
  treatmentLabel: string | null;
  invoicedAt: string | null;
}

/** Progreso del contrato OFM del titular para habilitarse como referidor. */
export interface ReferrerOfmEligibilityProgress {
  hasOfmContract: boolean;
  contractId: number | null;
  treatmentCode: string | null;
  treatmentLabel: string;
  currency: ReferralCashbackCurrency;
  contractTotal: number;
  amountPaid: number;
  amountPending: number;
  progressPercent: number;
  hasValidInvoice: boolean;
}

@Injectable()
export class ReferralCashbackSvService {
  private readonly logger = new Logger(ReferralCashbackSvService.name);
  private readonly svConfig: SvDatabaseConfig;

  constructor(private readonly configService: ConfigService) {
    this.svConfig =
      this.configService.get<SvDatabaseConfig>('svDatabase')
      ?? resolveSvDatabaseConfig();
  }

  private createClient(): Client {
    const cfg = this.svConfig;
    if (!cfg.password) {
      throw new Error('No hay password para BD SV — revisa DB_PASSWORD o SV_DB_PASSWORD');
    }
    return new Client({
      host: cfg.host,
      port: cfg.port,
      user: cfg.username,
      password: cfg.password,
      database: cfg.database,
      connectionTimeoutMillis: 15000,
    });
  }

  async getPatientIdByOpportunityEspoId(espoId: string): Promise<number | null> {
    const client = this.createClient();
    try {
      await client.connect();
      const { rows } = await client.query<{ patient_id: number }>(
        `
        SELECT chc.patient_id
        FROM clinic_history_crm chc
        WHERE chc.espo_id = $1
          AND chc.patient_id IS NOT NULL
          AND chc.patient_id > 0
        ORDER BY chc.id DESC
        LIMIT 1
        `,
        [espoId],
      );
      return rows[0]?.patient_id ?? null;
    } finally {
      await client.end().catch(() => undefined);
    }
  }

  async getPatientIdByClinicHistory(historyCode: string): Promise<number | null> {
    const code = historyCode?.trim();
    if (!code) return null;

    const client = this.createClient();
    try {
      await client.connect();
      const { rows } = await client.query<{ id: number }>(
        `
        SELECT ch.id
        FROM clinic_history ch
        WHERE TRIM(ch.history) = $1
        ORDER BY ch.id DESC
        LIMIT 1
        `,
        [code],
      );
      return rows[0]?.id ?? null;
    } finally {
      await client.end().catch(() => undefined);
    }
  }

  /**
   * Referidor habilitado: al menos un contrato OFM (contado o cuotas) pagado al 100%
   * con al menos una factura válida en SV.
   */
  async isPatientReferrerEligible(patientId: number): Promise<boolean> {
    const client = this.createClient();
    try {
      await client.connect();
      const { rows } = await client.query<{ eligible: boolean }>(
        `
        SELECT EXISTS (
          SELECT 1
          FROM contract c
          INNER JOIN contract_structure cs ON cs.id = c.contract_structure_id AND cs.state = 1
          WHERE c.idclinichistory = $1
            AND c.state = 1
            AND cs.treatment_code IN ('OFM_CONTADO', 'OFM_CUOTAS')
            AND NOT EXISTS (
              SELECT 1
              FROM contract_detail cd
              WHERE cd.idcontract = c.id
                AND COALESCE(cd.state, 1) = 1
                AND ROUND(COALESCE(cd.balance, 0)::numeric, 2) > 0.01
            )
            AND EXISTS (
              SELECT 1
              FROM contract_detail cd2
              INNER JOIN service_order_payment_detail sopd ON sopd.idcontractdetail = cd2.id
              INNER JOIN invoice_result_body irb ON irb.service_order_payment_detail_id = sopd.id
                AND irb.amount > 0
              INNER JOIN invoice_result_head irh ON irh.id = irb.idinvoice_result_head
                AND irh.status_invoice = 1
                AND COALESCE(irh.credit_memo_state, false) = false
              WHERE cd2.idcontract = c.id
                AND COALESCE(cd2.state, 1) = 1
            )
        ) AS eligible
        `,
        [patientId],
      );
      return rows[0]?.eligible === true;
    } finally {
      await client.end().catch(() => undefined);
    }
  }

  /**
   * Contrato OFM más reciente del paciente + montos pagados/pendientes (para UI de habilitación).
   */
  async getReferrerOfmEligibilityProgress(
    patientId: number,
  ): Promise<ReferrerOfmEligibilityProgress> {
    const empty: ReferrerOfmEligibilityProgress = {
      hasOfmContract: false,
      contractId: null,
      treatmentCode: null,
      treatmentLabel: '',
      currency: ReferralCashbackCurrency.USD,
      contractTotal: 0,
      amountPaid: 0,
      amountPending: 0,
      progressPercent: 0,
      hasValidInvoice: false,
    };

    const client = this.createClient();
    try {
      await client.connect();
      const { rows } = await client.query<{
        contract_id: number;
        treatment_code: string;
        contract_total: string;
        amount_paid: string;
        amount_pending: string;
        id_currency: number | null;
        has_valid_invoice: boolean;
      }>(
        `
        WITH latest_ofm AS (
          SELECT c.id AS contract_id, cs.treatment_code
          FROM contract c
          INNER JOIN contract_structure cs ON cs.id = c.contract_structure_id AND cs.state = 1
          WHERE c.idclinichistory = $1
            AND c.state = 1
            AND cs.treatment_code IN ('OFM_CONTADO', 'OFM_CUOTAS')
          ORDER BY c.id DESC
          LIMIT 1
        ),
        line_totals AS (
          SELECT
            lo.contract_id,
            lo.treatment_code,
            COALESCE(SUM(ROUND(COALESCE(cd.amount, 0)::numeric, 2)), 0) AS contract_total,
            COALESCE(SUM(ROUND(GREATEST(COALESCE(cd.balance, 0), 0)::numeric, 2)), 0) AS amount_pending,
            COALESCE(
              SUM(
                ROUND(
                  (COALESCE(cd.amount, 0) - GREATEST(COALESCE(cd.balance, 0), 0))::numeric,
                  2
                )
              ),
              0
            ) AS amount_paid
          FROM latest_ofm lo
          INNER JOIN contract_detail cd ON cd.idcontract = lo.contract_id
            AND COALESCE(cd.state, 1) = 1
          GROUP BY lo.contract_id, lo.treatment_code
        ),
        invoice_currency AS (
          SELECT irb.id_currency
          FROM line_totals lt
          INNER JOIN contract_detail cd ON cd.idcontract = lt.contract_id
            AND COALESCE(cd.state, 1) = 1
          INNER JOIN service_order_payment_detail sopd ON sopd.idcontractdetail = cd.id
          INNER JOIN invoice_result_body irb ON irb.service_order_payment_detail_id = sopd.id
            AND irb.amount > 0
          INNER JOIN invoice_result_head irh ON irh.id = irb.idinvoice_result_head
            AND irh.status_invoice = 1
            AND COALESCE(irh.credit_memo_state, false) = false
          ORDER BY irb.id DESC
          LIMIT 1
        )
        SELECT
          lt.contract_id,
          lt.treatment_code,
          lt.contract_total::text,
          lt.amount_paid::text,
          lt.amount_pending::text,
          ic.id_currency,
          EXISTS (
            SELECT 1
            FROM contract_detail cd2
            INNER JOIN service_order_payment_detail sopd2 ON sopd2.idcontractdetail = cd2.id
            INNER JOIN invoice_result_body irb2 ON irb2.service_order_payment_detail_id = sopd2.id
              AND irb2.amount > 0
            INNER JOIN invoice_result_head irh2 ON irh2.id = irb2.idinvoice_result_head
              AND irh2.status_invoice = 1
              AND COALESCE(irh2.credit_memo_state, false) = false
            WHERE cd2.idcontract = lt.contract_id
              AND COALESCE(cd2.state, 1) = 1
          ) AS has_valid_invoice
        FROM line_totals lt
        LEFT JOIN invoice_currency ic ON true
        `,
        [patientId],
      );

      const row = rows[0];
      if (!row) return empty;

      const contractTotal = parseFloat(row.contract_total) || 0;
      const amountPaid = parseFloat(row.amount_paid) || 0;
      const amountPending = parseFloat(row.amount_pending) || 0;
      const progressPercent =
        contractTotal > 0
          ? Math.min(100, Math.round((amountPaid / contractTotal) * 1000) / 10)
          : 0;

      const treatmentCode = row.treatment_code ?? null;
      const treatmentLabel =
        treatmentCode === 'OFM_CUOTAS'
          ? 'OFM cuotas'
          : treatmentCode === 'OFM_CONTADO'
            ? 'OFM contado'
            : 'OFM';

      return {
        hasOfmContract: true,
        contractId: row.contract_id,
        treatmentCode,
        treatmentLabel,
        currency: currencyFromSvCoinId(row.id_currency),
        contractTotal,
        amountPaid,
        amountPending,
        progressPercent,
        hasValidInvoice: row.has_valid_invoice === true,
      };
    } catch (err) {
      this.logger.warn(`getReferrerOfmEligibilityProgress(${patientId}): ${err}`);
      return empty;
    } finally {
      await client.end().catch(() => undefined);
    }
  }

  /**
   * IRB ancla para evaluar cashback OFM del referido:
   * - Contado: última factura (MAX irb) cuando el contrato está 100% pagado; el 10% es sobre
   *   la suma de IRB de ese mismo invoice head (no solo una línea).
   * - Cuotas: factura cuando Moldes + Inicial están completos + última al cerrar el contrato.
   */
  async listOfmCashbackTriggerIrbIdsForPatient(patientId: number): Promise<number[]> {
    const client = this.createClient();
    try {
      await client.connect();
      const { rows } = await client.query<{ irb_id: number }>(
        `
        WITH patient_ofm_contracts AS (
          SELECT c.id AS contract_id, cs.treatment_code
          FROM contract c
          INNER JOIN contract_structure cs ON cs.id = c.contract_structure_id AND cs.state = 1
          WHERE c.idclinichistory = $1
            AND c.state = 1
            AND cs.treatment_code IN ('OFM_CONTADO', 'OFM_CUOTAS')
        ),
        fully_paid AS (
          SELECT poc.contract_id, poc.treatment_code
          FROM patient_ofm_contracts poc
          WHERE NOT EXISTS (
            SELECT 1
            FROM contract_detail cd
            WHERE cd.idcontract = poc.contract_id
              AND COALESCE(cd.state, 1) = 1
              AND ROUND(COALESCE(cd.balance, 0)::numeric, 2) > 0.01
          )
        ),
        contract_irbs AS (
          SELECT
            cd.idcontract,
            irb.id AS irb_id,
            LOWER(TRIM(cd.description)) AS desc_norm
          FROM contract_detail cd
          INNER JOIN contract c ON c.id = cd.idcontract AND c.state = 1
          INNER JOIN service_order_payment_detail sopd ON sopd.idcontractdetail = cd.id
          INNER JOIN invoice_result_body irb ON irb.service_order_payment_detail_id = sopd.id
            AND irb.amount > 0
          INNER JOIN invoice_result_head irh ON irh.id = irb.idinvoice_result_head
            AND irh.status_invoice = 1
            AND COALESCE(irh.credit_memo_state, false) = false
          WHERE COALESCE(cd.state, 1) = 1
            AND c.idclinichistory = $1
        )
        SELECT irb_id FROM (
          SELECT MAX(ci.irb_id) AS irb_id
          FROM contract_irbs ci
          INNER JOIN fully_paid fp ON fp.contract_id = ci.idcontract
          INNER JOIN patient_ofm_contracts poc ON poc.contract_id = ci.idcontract
          WHERE poc.treatment_code = 'OFM_CONTADO'
          GROUP BY ci.idcontract

          UNION

          SELECT MAX(ci.irb_id) AS irb_id
          FROM contract_irbs ci
          INNER JOIN patient_ofm_contracts poc ON poc.contract_id = ci.idcontract
          INNER JOIN (
            ${ofmPrimerPagoStatusSelect()}
          ) pps ON pps.contract_id = ci.idcontract
            AND pps.has_moldes
            AND pps.has_inicial
            AND pps.moldes_complete
            AND pps.inicial_complete
          WHERE poc.treatment_code = 'OFM_CUOTAS'
            AND ${OFM_DESC_NORM_IS_PRIMER_PAGO}
          GROUP BY ci.idcontract

          UNION

          SELECT MAX(ci.irb_id) AS irb_id
          FROM contract_irbs ci
          INNER JOIN fully_paid fp ON fp.contract_id = ci.idcontract
          INNER JOIN patient_ofm_contracts poc ON poc.contract_id = ci.idcontract
          WHERE poc.treatment_code = 'OFM_CUOTAS'
            AND ${OFM_DESC_NORM_IS_CUOTA}
          GROUP BY ci.idcontract
        ) triggers
        WHERE irb_id IS NOT NULL
        ORDER BY irb_id ASC
        `,
        [patientId],
      );
      return rows.map((r) => r.irb_id);
    } finally {
      await client.end().catch(() => undefined);
    }
  }

  /**
   * IRB elegibles OI: plan OI facturado completo en una sola factura (sin pagos previos).
   * Devuelve un IRB ancla por plan (MIN irb.id del head que califica).
   */
  async listOiFullPlanAnchorIrbIdsForPatient(patientId: number): Promise<number[]> {
    const client = this.createClient();
    try {
      await client.connect();
      const { rows } = await client.query<{ id: number }>(
        `
        WITH patient_oi_irbs AS (
          SELECT
            irb.id AS irb_id,
            irh.id AS head_id,
            tp.id AS treatment_plan_id,
            tp.adjusted_total::numeric AS adjusted_total
          FROM invoice_result_body irb
          INNER JOIN invoice_result_head irh ON irh.id = irb.idinvoice_result_head
            AND irh.status_invoice = 1
            AND COALESCE(irh.credit_memo_state, false) = false
          INNER JOIN service_order so ON so.id = irh.id_service_order
          INNER JOIN clinic_history ch ON ch.id = so.idclinichistory
          INNER JOIN service_order_payment_detail sopd ON sopd.id = irb.service_order_payment_detail_id
            AND COALESCE(sopd.idcontractdetail, 0) = 0
          INNER JOIN treatment_plan_detail_service_orders tpdso ON tpdso.service_order_id = so.id
          INNER JOIN treatment_plan_detail tpd ON tpd.id = tpdso.treatment_plan_detail_id
            AND COALESCE(tpd.status::text, 'Activo') = 'Activo'
          INNER JOIN treatment_plan tp ON tp.id = tpd.idtreatment_plan
          INNER JOIN quotation q ON q.id = tp.idquotation AND q.idbusinessline = $2
          WHERE ch.id = $1
            AND irb.amount > 0
        ),
        head_plan_totals AS (
          SELECT
            poi.treatment_plan_id,
            poi.head_id,
            poi.adjusted_total,
            COALESCE(SUM(irb2.amount), 0)::numeric AS invoiced_on_head
          FROM patient_oi_irbs poi
          INNER JOIN invoice_result_body irb2 ON irb2.idinvoice_result_head = poi.head_id
            AND irb2.amount > 0
          INNER JOIN invoice_result_head irh2 ON irh2.id = poi.head_id
          INNER JOIN service_order so2 ON so2.id = irh2.id_service_order
          INNER JOIN treatment_plan_detail_service_orders tpdso2 ON tpdso2.service_order_id = so2.id
          INNER JOIN treatment_plan_detail tpd2 ON tpd2.id = tpdso2.treatment_plan_detail_id
            AND tpd2.idtreatment_plan = poi.treatment_plan_id
            AND COALESCE(tpd2.status::text, 'Activo') = 'Activo'
          GROUP BY poi.treatment_plan_id, poi.head_id, poi.adjusted_total
        ),
        qualifying AS (
          SELECT hpt.treatment_plan_id, hpt.head_id
          FROM head_plan_totals hpt
          WHERE hpt.adjusted_total > 0
            AND hpt.invoiced_on_head >= hpt.adjusted_total - GREATEST(hpt.adjusted_total * 0.01, 1)
            AND NOT EXISTS (
              SELECT 1
              FROM patient_oi_irbs poi2
              WHERE poi2.treatment_plan_id = hpt.treatment_plan_id
                AND poi2.head_id <> hpt.head_id
            )
        )
        SELECT MIN(irb.id) AS id
        FROM qualifying q
        INNER JOIN invoice_result_body irb ON irb.idinvoice_result_head = q.head_id
          AND irb.amount > 0
        GROUP BY q.treatment_plan_id
        ORDER BY id ASC
        `,
        [patientId, OI_BUSINESS_LINE_ID],
      );
      return rows.map((r) => r.id);
    } finally {
      await client.end().catch(() => undefined);
    }
  }

  /**
   * IRB elegibles OI sueltos (Generar OS / BillingForm): tarifa OI pagada completa,
   * sin plan de tratamiento ni evaluaciones.
   */
  async listOiStandaloneTariffIrbIdsForPatient(patientId: number): Promise<number[]> {
    const client = this.createClient();
    try {
      await client.connect();
      const { rows } = await client.query<{ id: number }>(
        `
        SELECT DISTINCT irb.id
        FROM invoice_result_body irb
        INNER JOIN invoice_result_head irh ON irh.id = irb.idinvoice_result_head
          AND irh.status_invoice = 1
          AND COALESCE(irh.credit_memo_state, false) = false
        INNER JOIN service_order so ON so.id = irh.id_service_order
        INNER JOIN clinic_history ch ON ch.id = so.idclinichistory
        INNER JOIN service_order_payment_detail sopd ON sopd.id = irb.service_order_payment_detail_id
          AND COALESCE(sopd.idcontractdetail, 0) = 0
          AND sopd."busineslineId" = $2
        INNER JOIN tariff t ON t.id = sopd."tariffId"
        WHERE ch.id = $1
          AND irb.amount > 0
          AND NOT EXISTS (
            SELECT 1
            FROM treatment_plan_detail_service_orders tpdso
            WHERE tpdso.service_order_id = so.id
          )
          AND LOWER(TRIM(COALESCE(t.name, ''))) NOT LIKE '%evaluacion%'
          AND LOWER(TRIM(COALESCE(t.name, ''))) NOT LIKE 'eva%'
          AND LOWER(TRIM(COALESCE(t.description, ''))) NOT LIKE '%evaluacion%'
          AND LOWER(TRIM(COALESCE(t.description, ''))) NOT LIKE 'eva%'
          AND (
            CASE WHEN irb.id_currency = 2 THEN COALESCE(t.price_usd, 0) ELSE COALESCE(t.price_sol, 0) END
          ) > 0
          AND irb.amount >= (
            CASE WHEN irb.id_currency = 2 THEN COALESCE(t.price_usd, 0) ELSE COALESCE(t.price_sol, 0) END
          ) - GREATEST(
            (CASE WHEN irb.id_currency = 2 THEN COALESCE(t.price_usd, 0) ELSE COALESCE(t.price_sol, 0) END) * 0.01,
            1
          )
          AND irb.amount >= sopd.subtotal - GREATEST(sopd.subtotal * 0.01, 1)
        ORDER BY irb.id ASC
        `,
        [patientId, OI_BUSINESS_LINE_ID],
      );
      return rows.map((r) => r.id);
    } finally {
      await client.end().catch(() => undefined);
    }
  }

  async getInvoiceCashbackContext(sourceIrbId: number): Promise<SvInvoiceCashbackContext | null> {
    const ofm = await this.getOfmContractCashbackContext(sourceIrbId);
    if (ofm) return ofm;
    const oiPlan = await this.getOiFullPlanCashbackContext(sourceIrbId);
    if (oiPlan) return oiPlan;
    return this.getOiStandaloneTariffCashbackContext(sourceIrbId);
  }

  /**
   * OFM referido:
   * - Contado: 10% de la factura (head) que cierra el contrato al 100%.
   *   Si esa boleta tiene varias líneas (Moldes + Único Pago), se suman todos los IRB del mismo head.
   *   Pagos parciales en facturas distintas: solo la última factura de cierre cuenta.
   * - Cuotas: 10% de Moldes + Inicial (ambos completos) + 10% de las cuotas al cerrar el contrato.
   */
  private async getOfmContractCashbackContext(
    sourceIrbId: number,
  ): Promise<SvInvoiceCashbackContext | null> {
    const client = this.createClient();
    try {
      await client.connect();
      const { rows } = await client.query<{
        source_irb_id: number;
        patient_id: number;
        contract_id: number;
        treatment_code: string;
        contract_type: string;
        detail_description: string;
        is_primer_pago_line: boolean;
        is_cuota_line: boolean;
        has_moldes: boolean;
        has_inicial: boolean;
        moldes_complete: boolean;
        inicial_complete: boolean;
        primer_pago_ready: boolean;
        contract_fully_paid: boolean;
        total_invoiced: string;
        trigger_irb_amount: string;
        closing_head_invoiced: string;
        primer_pago_invoiced: string;
        remainder_invoiced: string;
        id_currency: number;
      }>(
        `
        WITH irb_row AS (
          SELECT
            irb.id AS source_irb_id,
            ch.id AS patient_id,
            c.id AS contract_id,
            cs.treatment_code,
            cs.contract_type,
            cd.description AS detail_description,
            irh.id AS invoice_head_id,
            irb.amount AS trigger_irb_amount,
            irb.id_currency,
            (${ofmDetailIsPrimerPago('cd')}) AS is_primer_pago_line,
            (${ofmDetailIsCuotaInstallment('cd')}) AS is_cuota_line
          FROM invoice_result_body irb
          INNER JOIN invoice_result_head irh ON irh.id = irb.idinvoice_result_head
            AND irh.status_invoice = 1
            AND COALESCE(irh.credit_memo_state, false) = false
          INNER JOIN service_order so ON so.id = irh.id_service_order
          INNER JOIN clinic_history ch ON ch.id = so.idclinichistory
          INNER JOIN service_order_payment_detail sopd ON sopd.id = irb.service_order_payment_detail_id
            AND sopd.idcontractdetail > 0
          INNER JOIN contract_detail cd ON cd.id = sopd.idcontractdetail
            AND COALESCE(cd.state, 1) = 1
          INNER JOIN contract c ON c.id = cd.idcontract AND c.state = 1
          INNER JOIN contract_structure cs ON cs.id = c.contract_structure_id AND cs.state = 1
          WHERE irb.id = $1
            AND irb.amount > 0
            AND cs.treatment_code IN ('OFM_CONTADO', 'OFM_CUOTAS')
        ),
        primer_pago_status AS (
          ${ofmPrimerPagoStatusCte('(SELECT contract_id FROM irb_row)')}
        ),
        contract_totals AS (
          SELECT
            cd.idcontract,
            COALESCE(SUM(irb2.amount), 0)::numeric AS total_invoiced,
            COALESCE(SUM(irb2.amount) FILTER (
              WHERE ${ofmDetailIsPrimerPago('cd')}
            ), 0)::numeric AS primer_pago_invoiced,
            COALESCE(SUM(irb2.amount) FILTER (
              WHERE ${ofmDetailIsCuotaInstallment('cd')}
            ), 0)::numeric AS remainder_invoiced
          FROM contract_detail cd
          INNER JOIN service_order_payment_detail sopd ON sopd.idcontractdetail = cd.id
          INNER JOIN invoice_result_body irb2 ON irb2.service_order_payment_detail_id = sopd.id
            AND irb2.amount > 0
          INNER JOIN invoice_result_head irh2 ON irh2.id = irb2.idinvoice_result_head
            AND irh2.status_invoice = 1
            AND COALESCE(irh2.credit_memo_state, false) = false
          WHERE COALESCE(cd.state, 1) = 1
            AND cd.idcontract = (SELECT contract_id FROM irb_row)
          GROUP BY cd.idcontract
        ),
        contract_paid AS (
          SELECT
            c.id AS contract_id,
            NOT EXISTS (
              SELECT 1
              FROM contract_detail cd3
              WHERE cd3.idcontract = c.id
                AND COALESCE(cd3.state, 1) = 1
                AND ROUND(COALESCE(cd3.balance, 0)::numeric, 2) > 0.01
            ) AS contract_fully_paid
          FROM contract c
          WHERE c.id = (SELECT contract_id FROM irb_row)
        ),
        closing_head_totals AS (
          SELECT
            COALESCE(SUM(irb_closing.amount), 0)::numeric AS closing_head_invoiced
          FROM irb_row ir0
          INNER JOIN invoice_result_body irb_closing ON irb_closing.idinvoice_result_head = ir0.invoice_head_id
            AND irb_closing.amount > 0
          INNER JOIN invoice_result_head irh_closing ON irh_closing.id = irb_closing.idinvoice_result_head
            AND irh_closing.status_invoice = 1
            AND COALESCE(irh_closing.credit_memo_state, false) = false
          INNER JOIN service_order_payment_detail sopd_closing ON sopd_closing.id = irb_closing.service_order_payment_detail_id
            AND sopd_closing.idcontractdetail > 0
          INNER JOIN contract_detail cd_closing ON cd_closing.id = sopd_closing.idcontractdetail
            AND COALESCE(cd_closing.state, 1) = 1
            AND cd_closing.idcontract = ir0.contract_id
        )
        SELECT
          ir.source_irb_id,
          ir.patient_id,
          ir.contract_id,
          ir.treatment_code,
          ir.contract_type,
          ir.detail_description,
          ir.is_primer_pago_line,
          ir.is_cuota_line,
          pps.has_moldes,
          pps.has_inicial,
          pps.moldes_complete,
          pps.inicial_complete,
          (pps.has_moldes AND pps.has_inicial AND pps.moldes_complete AND pps.inicial_complete) AS primer_pago_ready,
          cp.contract_fully_paid,
          ct.total_invoiced::text,
          ir.trigger_irb_amount::text,
          cht.closing_head_invoiced::text,
          ct.primer_pago_invoiced::text,
          ct.remainder_invoiced::text,
          ir.id_currency
        FROM irb_row ir
        INNER JOIN contract_totals ct ON ct.idcontract = ir.contract_id
        INNER JOIN contract_paid cp ON cp.contract_id = ir.contract_id
        INNER JOIN primer_pago_status pps ON pps.contract_id = ir.contract_id
        CROSS JOIN closing_head_totals cht
        LIMIT 1
        `,
        [sourceIrbId],
      );

      const row = rows[0];
      if (!row) return null;

      const treatmentCode = String(row.treatment_code ?? '').toUpperCase();
      const contractType = String(row.contract_type ?? '').toUpperCase();
      const closingHeadInvoiced = parseFloat(row.closing_head_invoiced) || 0;
      const closingInvoicedAmount =
        closingHeadInvoiced > 0
          ? closingHeadInvoiced
          : parseFloat(row.trigger_irb_amount) || 0;
      const primerPagoInvoiced = parseFloat(row.primer_pago_invoiced) || 0;
      const remainderInvoiced = parseFloat(row.remainder_invoiced) || 0;
      const fullyPaid = row.contract_fully_paid === true;
      const primerPagoReady = row.primer_pago_ready === true;
      const { isContado, isCuotas } = resolveOfmModality(treatmentCode, contractType);

      const base = {
        sourceIrbId: row.source_irb_id,
        patientId: row.patient_id,
        contractId: row.contract_id,
        treatmentPlanId: null as number | null,
        tariffId: null as number | null,
        invoiceHeadId: null as number | null,
        treatmentCode,
        contractType,
        currency: currencyFromSvCoinId(row.id_currency),
      };

      if (isContado && !isCuotas) {
        if (!fullyPaid) {
          return {
            ...base,
            sourceType: 'OFM_CONTADO_COMPLETE',
            cashbackPhase: 'contado_complete',
            invoicedAmount: closingInvoicedAmount,
            isEligible: false,
            skipReason: 'Contrato OFM al contado aún no está pagado al 100%',
          };
        }
        return {
          ...base,
          sourceType: 'OFM_CONTADO_COMPLETE',
          cashbackPhase: 'contado_complete',
          invoicedAmount: closingInvoicedAmount,
          isEligible: closingInvoicedAmount > 0,
          skipReason:
            closingInvoicedAmount > 0
              ? undefined
              : 'Sin monto facturado en la factura que cierra el contrato',
        };
      }

      if (isCuotas) {
        if (row.is_primer_pago_line) {
          if (primerPagoReady && primerPagoInvoiced > 0) {
            return {
              ...base,
              sourceType: 'OFM_CUOTAS_INICIAL',
              cashbackPhase: 'cuotas_inicial',
              invoicedAmount: primerPagoInvoiced,
              isEligible: true,
            };
          }
          const skipReason = !row.has_moldes
            ? 'Contrato en cuotas sin línea Moldes'
            : !row.has_inicial
              ? 'Contrato en cuotas sin línea Inicial'
              : !row.moldes_complete
                ? 'Moldes aún no está pagado al 100%'
                : !row.inicial_complete
                  ? 'Inicial aún no está pagada al 100%'
                  : 'Primer pago (Moldes + Inicial) sin monto facturado';
          return {
            ...base,
            sourceType: 'OFM_CUOTAS_INICIAL',
            cashbackPhase: 'cuotas_inicial',
            invoicedAmount: primerPagoInvoiced,
            isEligible: false,
            skipReason,
          };
        }
        if (row.is_cuota_line) {
          if (fullyPaid && remainderInvoiced > 0) {
            return {
              ...base,
              sourceType: 'OFM_CUOTAS_REMAINDER',
              cashbackPhase: 'cuotas_remainder',
              invoicedAmount: remainderInvoiced,
              isEligible: true,
            };
          }
          const skipReason = fullyPaid
            ? 'Contrato en cuotas sin cuotas facturadas para el cierre'
            : 'Contrato en cuotas aún no está pagado al 100% (cuotas pendientes)';
          return {
            ...base,
            sourceType: 'OFM_CUOTAS_REMAINDER',
            cashbackPhase: 'cuotas_remainder',
            invoicedAmount: remainderInvoiced,
            isEligible: false,
            skipReason,
          };
        }

        return {
          ...base,
          sourceType: 'OFM_CUOTAS_REMAINDER',
          cashbackPhase: 'cuotas_remainder',
          invoicedAmount: remainderInvoiced,
          isEligible: false,
          skipReason: 'Factura no corresponde a Moldes, Inicial ni cuota del contrato',
        };
      }

      return null;
    } catch (err) {
      this.logger.error(`getOfmContractCashbackContext(${sourceIrbId}): ${err}`);
      throw err;
    } finally {
      await client.end().catch(() => undefined);
    }
  }

  /**
   * OI: 10% solo si el plan se factura completo en una sola factura (sin abonos previos).
   * invoicedAmount = suma de IRB del mismo head ligados al plan.
   */
  private async getOiFullPlanCashbackContext(
    sourceIrbId: number,
  ): Promise<SvInvoiceCashbackContext | null> {
    const client = this.createClient();
    try {
      await client.connect();
      const { rows } = await client.query<{
        source_irb_id: number;
        patient_id: number;
        treatment_plan_id: number;
        head_id: number;
        invoiced_on_head: string;
        id_currency: number;
      }>(
        `
        WITH source_irb AS (
          SELECT
            irb.id,
            irh.id AS head_id,
            so.id AS so_id,
            irb.id_currency
          FROM invoice_result_body irb
          INNER JOIN invoice_result_head irh ON irh.id = irb.idinvoice_result_head
            AND irh.status_invoice = 1
            AND COALESCE(irh.credit_memo_state, false) = false
          INNER JOIN service_order so ON so.id = irh.id_service_order
          INNER JOIN service_order_payment_detail sopd ON sopd.id = irb.service_order_payment_detail_id
            AND COALESCE(sopd.idcontractdetail, 0) = 0
          WHERE irb.id = $1
            AND irb.amount > 0
        ),
        plan_for_irb AS (
          SELECT DISTINCT
            tp.id AS treatment_plan_id,
            tp.adjusted_total::numeric AS adjusted_total,
            ch.id AS patient_id,
            si.head_id
          FROM source_irb si
          INNER JOIN treatment_plan_detail_service_orders tpdso ON tpdso.service_order_id = si.so_id
          INNER JOIN treatment_plan_detail tpd ON tpd.id = tpdso.treatment_plan_detail_id
            AND COALESCE(tpd.status::text, 'Activo') = 'Activo'
          INNER JOIN treatment_plan tp ON tp.id = tpd.idtreatment_plan
          INNER JOIN quotation q ON q.id = tp.idquotation AND q.idbusinessline = $2
          INNER JOIN service_order so ON so.id = si.so_id
          INNER JOIN clinic_history ch ON ch.id = so.idclinichistory
        ),
        head_totals AS (
          SELECT
            p.treatment_plan_id,
            p.adjusted_total,
            p.patient_id,
            p.head_id,
            COALESCE(SUM(irb2.amount), 0)::numeric AS invoiced_on_head
          FROM plan_for_irb p
          INNER JOIN invoice_result_body irb2 ON irb2.idinvoice_result_head = p.head_id
            AND irb2.amount > 0
          INNER JOIN invoice_result_head irh2 ON irh2.id = p.head_id
          INNER JOIN service_order so2 ON so2.id = irh2.id_service_order
          INNER JOIN treatment_plan_detail_service_orders tpdso2 ON tpdso2.service_order_id = so2.id
          INNER JOIN treatment_plan_detail tpd2 ON tpd2.id = tpdso2.treatment_plan_detail_id
            AND tpd2.idtreatment_plan = p.treatment_plan_id
            AND COALESCE(tpd2.status::text, 'Activo') = 'Activo'
          GROUP BY p.treatment_plan_id, p.adjusted_total, p.patient_id, p.head_id
        )
        SELECT
          si.id AS source_irb_id,
          ht.patient_id,
          ht.treatment_plan_id,
          ht.head_id,
          ht.invoiced_on_head::text AS invoiced_on_head,
          si.id_currency
        FROM head_totals ht
        INNER JOIN source_irb si ON si.head_id = ht.head_id
        WHERE ht.adjusted_total > 0
          AND ht.invoiced_on_head >= ht.adjusted_total - GREATEST(ht.adjusted_total * 0.01, 1)
          AND NOT EXISTS (
            SELECT 1
            FROM invoice_result_body irb0
            INNER JOIN invoice_result_head irh0 ON irh0.id = irb0.idinvoice_result_head
              AND irh0.status_invoice = 1
              AND COALESCE(irh0.credit_memo_state, false) = false
            INNER JOIN service_order so0 ON so0.id = irh0.id_service_order
            INNER JOIN treatment_plan_detail_service_orders tpdso0 ON tpdso0.service_order_id = so0.id
            INNER JOIN treatment_plan_detail tpd0 ON tpd0.id = tpdso0.treatment_plan_detail_id
              AND tpd0.idtreatment_plan = ht.treatment_plan_id
              AND COALESCE(tpd0.status::text, 'Activo') = 'Activo'
            WHERE irh0.id <> ht.head_id
              AND irb0.amount > 0
          )
        LIMIT 1
        `,
        [sourceIrbId, OI_BUSINESS_LINE_ID],
      );

      const row = rows[0];
      if (!row) return null;

      return {
        sourceIrbId: row.source_irb_id,
        patientId: row.patient_id,
        contractId: null,
        treatmentPlanId: row.treatment_plan_id,
        tariffId: null,
        invoiceHeadId: row.head_id,
        invoicedAmount: parseFloat(row.invoiced_on_head) || 0,
        currency: currencyFromSvCoinId(row.id_currency),
        sourceType: 'OI_FULL_PLAN',
        isEligible: true,
      };
    } catch (err) {
      this.logger.error(`getOiFullPlanCashbackContext(${sourceIrbId}): ${err}`);
      throw err;
    } finally {
      await client.end().catch(() => undefined);
    }
  }

  /**
   * OI suelto (Generar OS): tarifa línea 2 facturada al 100% en una sola factura.
   * Excluye evaluaciones, pagos parciales y OS ya vinculadas a un plan de tratamiento.
   */
  private async getOiStandaloneTariffCashbackContext(
    sourceIrbId: number,
  ): Promise<SvInvoiceCashbackContext | null> {
    const client = this.createClient();
    try {
      await client.connect();
      const { rows } = await client.query<{
        source_irb_id: number;
        patient_id: number;
        tariff_id: number;
        invoiced_amount: string;
        id_currency: number;
      }>(
        `
        SELECT
          irb.id AS source_irb_id,
          ch.id AS patient_id,
          sopd."tariffId" AS tariff_id,
          irb.amount::text AS invoiced_amount,
          irb.id_currency
        FROM invoice_result_body irb
        INNER JOIN invoice_result_head irh ON irh.id = irb.idinvoice_result_head
          AND irh.status_invoice = 1
          AND COALESCE(irh.credit_memo_state, false) = false
        INNER JOIN service_order so ON so.id = irh.id_service_order
        INNER JOIN clinic_history ch ON ch.id = so.idclinichistory
        INNER JOIN service_order_payment_detail sopd ON sopd.id = irb.service_order_payment_detail_id
          AND COALESCE(sopd.idcontractdetail, 0) = 0
          AND sopd."busineslineId" = $2
        INNER JOIN tariff t ON t.id = sopd."tariffId"
        WHERE irb.id = $1
          AND irb.amount > 0
          AND NOT EXISTS (
            SELECT 1
            FROM treatment_plan_detail_service_orders tpdso
            WHERE tpdso.service_order_id = so.id
          )
          AND LOWER(TRIM(COALESCE(t.name, ''))) NOT LIKE '%evaluacion%'
          AND LOWER(TRIM(COALESCE(t.name, ''))) NOT LIKE 'eva%'
          AND LOWER(TRIM(COALESCE(t.description, ''))) NOT LIKE '%evaluacion%'
          AND LOWER(TRIM(COALESCE(t.description, ''))) NOT LIKE 'eva%'
          AND (
            CASE WHEN irb.id_currency = 2 THEN COALESCE(t.price_usd, 0) ELSE COALESCE(t.price_sol, 0) END
          ) > 0
          AND irb.amount >= (
            CASE WHEN irb.id_currency = 2 THEN COALESCE(t.price_usd, 0) ELSE COALESCE(t.price_sol, 0) END
          ) - GREATEST(
            (CASE WHEN irb.id_currency = 2 THEN COALESCE(t.price_usd, 0) ELSE COALESCE(t.price_sol, 0) END) * 0.01,
            1
          )
          AND irb.amount >= sopd.subtotal - GREATEST(sopd.subtotal * 0.01, 1)
        LIMIT 1
        `,
        [sourceIrbId, OI_BUSINESS_LINE_ID],
      );

      const row = rows[0];
      if (!row) return null;

      return {
        sourceIrbId: row.source_irb_id,
        patientId: row.patient_id,
        contractId: null,
        treatmentPlanId: null,
        tariffId: row.tariff_id,
        invoiceHeadId: null,
        invoicedAmount: parseFloat(row.invoiced_amount) || 0,
        currency: currencyFromSvCoinId(row.id_currency),
        sourceType: 'OI_STANDALONE_TARIFF',
        isEligible: true,
      };
    } catch (err) {
      this.logger.error(`getOiStandaloneTariffCashbackContext(${sourceIrbId}): ${err}`);
      throw err;
    } finally {
      await client.end().catch(() => undefined);
    }
  }

  async getClinicHistoryBriefs(
    patientIds: number[],
  ): Promise<Map<number, SvClinicHistoryBrief>> {
    const map = new Map<number, SvClinicHistoryBrief>();
    if (!patientIds.length) return map;

    const client = this.createClient();
    try {
      await client.connect();
      const { rows } = await client.query<{
        id: number;
        history: string;
        full_name: string;
      }>(
        `
        SELECT
          ch.id,
          ch.history,
          TRIM(
            CONCAT(
              COALESCE(ch.name, ''),
              ' ',
              COALESCE(ch."lastNameFather", ''),
              ' ',
              COALESCE(ch."lastNameMother", '')
            )
          ) AS full_name
        FROM clinic_history ch
        WHERE ch.id = ANY($1::int[])
        `,
        [patientIds],
      );

      for (const row of rows) {
        map.set(row.id, {
          patientId: row.id,
          history: row.history ?? '',
          fullName: row.full_name?.trim() || `Paciente ${row.id}`,
        });
      }
      return map;
    } catch (err) {
      this.logger.error(`getClinicHistoryBriefs: ${err}`);
      return map;
    } finally {
      await client.end().catch(() => undefined);
    }
  }

  async getIrbCashbackDetails(
    irbIds: number[],
  ): Promise<Map<number, SvIrbCashbackDetail>> {
    const map = new Map<number, SvIrbCashbackDetail>();
    if (!irbIds.length) return map;

    const client = this.createClient();
    try {
      await client.connect();
      const { rows } = await client.query<{
        irb_id: number;
        amount: string;
        id_currency: number;
        service_order_id: number | null;
        treatment_label: string | null;
        invoiced_at: Date | string | null;
      }>(
        `
        SELECT
          irb.id AS irb_id,
          irb.amount::text AS amount,
          irb.id_currency,
          so.id AS service_order_id,
          COALESCE(
            NULLIF(TRIM(t.name), ''),
            NULLIF(TRIM(t.description), ''),
            NULLIF(TRIM(cd.description), ''),
            NULLIF(TRIM(sopd.subtotal::text), '')
          ) AS treatment_label,
          COALESCE(
            irh.created_at::timestamptz,
            NULLIF(irh.receipt_date_soles::text, '')::timestamptz,
            NULLIF(irh.receipt_date_dolares::text, '')::timestamptz,
            (irh.invoice_date::timestamp AT TIME ZONE 'America/Lima')
          ) AS invoiced_at
        FROM invoice_result_body irb
        INNER JOIN invoice_result_head irh ON irh.id = irb.idinvoice_result_head
        INNER JOIN service_order so ON so.id = irh.id_service_order
        LEFT JOIN service_order_payment_detail sopd ON sopd.id = irb.service_order_payment_detail_id
        LEFT JOIN tariff t ON t.id = sopd."tariffId"
        LEFT JOIN contract_detail cd ON cd.id = sopd.idcontractdetail
        WHERE irb.id = ANY($1::int[])
        `,
        [irbIds],
      );

      for (const row of rows) {
        map.set(row.irb_id, {
          irbId: row.irb_id,
          amount: parseFloat(row.amount) || 0,
          currency: currencyFromSvCoinId(row.id_currency),
          serviceOrderId: row.service_order_id,
          treatmentLabel: row.treatment_label,
          invoicedAt: row.invoiced_at ? new Date(row.invoiced_at).toISOString() : null,
        });
      }
      return map;
    } catch (err) {
      this.logger.error(`getIrbCashbackDetails: ${err}`);
      return map;
    } finally {
      await client.end().catch(() => undefined);
    }
  }
}
