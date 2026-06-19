import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client } from 'pg';
import {
  mergeOiCrmMetricsRow,
  type OiCrmUserMetrics,
} from '../utils/oi-crm-metrics.util';
import {
  type SvDatabaseConfig,
  resolveSvDatabaseConfig,
  isCrmProductionEnv,
} from '../../config/sv-database.config';

export interface OiSvMonthMetrics {
  map: Map<string, OiCrmUserMetrics>;
  factRowCount: number;
  evalGroupCount: number;
  source: 'sv-invoice-db';
}

export interface FacturacionMtdSummary {
  area: 'CIERRE_TTO' | 'OI' | 'CONTROLES' | 'CALL_CENTER';
  year: number;
  month: number;
  startDate: string;
  endDate: string;
  isPartialMonth: boolean;
  campusId: number | null;
  /** Monto principal según área (OI: con IGV, Controles: sin IGV, Cerradoras: USD) */
  totalPrincipal: number;
  totalUsd: number;
  totalPenConIgv: number;
  totalPenSinIgv: number;
  osCount: number;
  paymentCount: number;
  lineCount: number;
  currencyLabel: 'USD' | 'PEN_CON_IGV' | 'PEN_SIN_IGV';
  asOf: string;
  supported: boolean;
  message?: string;
}

const IGV_RATE = 1.18;

/** Arequipa puede ser campus 15 o 18 en SV — misma lógica que Controles. */
function cerradorasCampusSqlFilter(
  campusId: number | null | undefined,
  params: unknown[],
  column = 'ch.campus',
): string {
  if (campusId == null) return '';
  const ids = campusId === 15 || campusId === 18 ? [15, 18] : [campusId];
  params.push(ids);
  return ` AND ${column} = ANY($${params.length}::int[])`;
}

function normalizeCerradorasCampusId(raw: number | null | undefined): number {
  const id = Number(raw ?? 1);
  if (id === 18 || id === 15) return 15;
  return id || 1;
}

/** Evaluación OI (odontología integral), excluye OFM/MARPE/APNEA. */
export const OI_EVAL_TARIFF_WHERE = `
  COALESCE(t.name, '') ILIKE '%Evalu%'
  AND COALESCE(t.id, 0) NOT IN (58, 192, 198)
  AND COALESCE(t.name, '') NOT ILIKE '%OFM%'
  AND COALESCE(t.name, '') NOT ILIKE '%MARPE%'
  AND COALESCE(t.name, '') NOT ILIKE '%APNEA%'
  AND COALESCE(t.name, '') NOT ILIKE '%CAPNEA%'
  AND (
    COALESCE(t.name, '') ILIKE '%OI%'
    OR COALESCE(t.name, '') ILIKE '%Odontolog%Integr%'
    OR COALESCE(t.name, '') ILIKE '%Odontologia Integral%'
    OR COALESCE(t.name, '') NOT ILIKE '% OFM%'
  )
`;

/** En facturación OI: líneas eval solo si son pago completo (id_payment CRM). */
export const OI_FACTURACION_EVAL_OR_PT_WHERE = `
  (
    COALESCE(t.name, '') NOT ILIKE '%Evalu%'
    OR EXISTS (
      SELECT 1
      FROM clinic_history_crm chc_pay
      INNER JOIN reservation r_pay ON r_pay.id = chc_pay.id_reservation
        AND r_pay.patient_id = ch.id
      LEFT JOIN tariff t_pay ON t_pay.id = r_pay.tariff_id
      WHERE chc_pay.patient_id = ch.id
        AND chc_pay.id_payment = irh.id
        AND chc_pay.id_reservation IS NOT NULL
        AND ${OI_EVAL_TARIFF_WHERE.replace(/\bt\./g, 't_pay.')}
    )
  )
`;

/** Login SV atribuido: union_doctor_patient (OI) → creador OS → facturador. */
export const OI_EJECUTIVO_LOGIN_EXPR = `
  LOWER(TRIM(COALESCE(
    NULLIF(TRIM(ej.ejecutivo_oi), ''),
    NULLIF(TRIM(u_so.username), ''),
    NULLIF(TRIM(u_bill.username), ''),
    'sin_asignar'
  )))
`;

/** Línea de factura OI que es evaluación (ya pasó OI_FACTURACION_EVAL_OR_PT en queryFacturacionRows). */
export function isOiEvalFacturacionRow(row: Record<string, unknown>): boolean {
  const name = String(row.tipo_arancel ?? row.tipo ?? '').trim();
  if (!name || !/evalu/i.test(name)) return false;
  const tid = Number(row.tariff_id ?? 0);
  return tid !== 58 && tid !== 192 && tid !== 198;
}

@Injectable()
export class OiSvInvoiceService implements OnModuleInit {
  private readonly logger = new Logger(OiSvInvoiceService.name);
  private svConfig: SvDatabaseConfig;

  constructor(private readonly configService: ConfigService) {
    this.svConfig = this.configService.get<SvDatabaseConfig>('svDatabase')
      ?? resolveSvDatabaseConfig();
  }

  onModuleInit(): void {
    const { host, port, database, username } = this.svConfig;
    const envLabel = isCrmProductionEnv() ? 'production' : 'development';
    this.logger.log(
      `OI invoice SV: ${host}:${port}/${database} (user=${username}, env=${envLabel})`,
    );
  }

  getSvConfig(): SvDatabaseConfig {
    return this.svConfig;
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

  monthRange(year: number, month: number): { start: string; end: string } {
    const start = `${year}-${String(month).padStart(2, '0')}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const end = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    return { start, end };
  }

  /** Del día 1 del mes hasta hoy (si es el mes en curso) o fin de mes. */
  resolveMtdRange(year: number, month: number): {
    start: string;
    end: string;
    isPartialMonth: boolean;
  } {
    const { start, end: monthEnd } = this.monthRange(year, month);
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    const isCurrentMonth = now.getFullYear() === year && now.getMonth() + 1 === month;
    if (isCurrentMonth && today < monthEnd) {
      return { start, end: today, isPartialMonth: true };
    }
    return { start, end: monthEnd, isPartialMonth: false };
  }

  /**
   * Total facturado acumulado del mes (MTD) desde SV, filtrable por sede.
   * Consulta en vivo: crece conforme se facturan O.S. en el mes.
   */
  async queryFacturacionMtdSummary(
    area: 'CIERRE_TTO' | 'OI' | 'CONTROLES' | 'CALL_CENTER',
    year: number,
    month: number,
    campusId?: number | null,
  ): Promise<FacturacionMtdSummary> {
    const { start, end, isPartialMonth } = this.resolveMtdRange(year, month);
    const asOf = new Date().toISOString();
    const base = {
      area,
      year,
      month,
      startDate: start,
      endDate: end,
      isPartialMonth,
      campusId: campusId ?? null,
      asOf,
    };

    if (area === 'CALL_CENTER') {
      return {
        ...base,
        totalPrincipal: 0,
        totalUsd: 0,
        totalPenConIgv: 0,
        totalPenSinIgv: 0,
        osCount: 0,
        paymentCount: 0,
        lineCount: 0,
        currencyLabel: 'PEN_CON_IGV',
        supported: false,
        message: 'Call Center usa evaluaciones vendidas/asistidas, no monto facturado.',
      };
    }

    if (area === 'CIERRE_TTO') {
      const agg = await this.queryCerradorasMtdAggregate(start, end, campusId);
      return {
        ...base,
        totalPrincipal: agg.totalUsd,
        totalUsd: agg.totalUsd,
        totalPenConIgv: agg.totalPenConIgv,
        totalPenSinIgv: Math.round((agg.totalPenConIgv / IGV_RATE) * 100) / 100,
        osCount: agg.osCount,
        paymentCount: agg.paymentCount,
        lineCount: agg.paymentCount,
        currencyLabel: 'USD',
        supported: true,
      };
    }

    if (area === 'OI') {
      const rows = await this.queryFacturacionRows(start, end, campusId);
      const osIds = new Set<number>();
      let totalPenConIgv = 0;
      for (const row of rows) {
        totalPenConIgv += Number(row.amount_pen ?? row.amount ?? 0);
        const soId = Number(row.service_order_id ?? 0);
        if (soId > 0) osIds.add(soId);
      }
      totalPenConIgv = Math.round(totalPenConIgv * 100) / 100;
      return {
        ...base,
        totalPrincipal: totalPenConIgv,
        totalUsd: 0,
        totalPenConIgv,
        totalPenSinIgv: Math.round((totalPenConIgv / IGV_RATE) * 100) / 100,
        osCount: osIds.size,
        paymentCount: rows.length,
        lineCount: rows.length,
        currencyLabel: 'PEN_CON_IGV',
        supported: true,
      };
    }

    const campusIds = campusId != null ? [campusId] : null;
    const rows = await this.queryControlesFacturacionRows(start, end, campusIds);
    const seen = new Set<string>();
    let totalPenSinIgv = 0;
    for (const row of rows) {
      const key = String(row.invoice_body_id ?? `${row.id_historia_clinica}-${row.invoice_date}-${row.amount}`);
      if (seen.has(key)) continue;
      seen.add(key);
      totalPenSinIgv += Number(row.amount ?? 0) / IGV_RATE;
    }
    totalPenSinIgv = Math.round(totalPenSinIgv * 100) / 100;
    return {
      ...base,
      totalPrincipal: totalPenSinIgv,
      totalUsd: 0,
      totalPenConIgv: Math.round(totalPenSinIgv * IGV_RATE * 100) / 100,
      totalPenSinIgv,
      osCount: 0,
      paymentCount: seen.size,
      lineCount: rows.length,
      currencyLabel: 'PEN_SIN_IGV',
      supported: true,
    };
  }

  /** Suma pagos OFM/MARPE/APNEA MTD; deduplica por operation_number + moneda. */
  private async queryCerradorasMtdAggregate(
    since: string,
    until: string,
    campusId?: number | null,
  ): Promise<{
    totalUsd: number;
    totalPenConIgv: number;
    osCount: number;
    paymentCount: number;
  }> {
    const client = this.createClient();
    const params: unknown[] = [since, until];
    const campusFilter = cerradorasCampusSqlFilter(campusId, params);

    const sql = `
      WITH pagos AS (
        SELECT
          irh.id_service_order,
          irb.id AS invoice_body_id,
          COALESCE(NULLIF(TRIM(irb.operation_number), ''), 'id-' || irb.id::text) AS op_key,
          irb.id_currency,
          CASE
            WHEN irb.id_currency = 2 THEN irb.amount
            ELSE irb.amount / NULLIF(COALESCE(
              (SELECT er2.value FROM exchange_rate er2
               WHERE er2.state = 1
                 AND er2.date <= COALESCE(irb.payment_date, irh.invoice_date::date)
               ORDER BY er2.date DESC LIMIT 1),
              3.5
            ), 0)
          END AS amount_usd,
          CASE
            WHEN irb.id_currency = 1 THEN irb.amount
            WHEN irb.id_currency = 2 THEN irb.amount * COALESCE(
              (SELECT er2.value FROM exchange_rate er2
               WHERE er2.state = 1
                 AND er2.date <= COALESCE(irb.payment_date, irh.invoice_date::date)
               ORDER BY er2.date DESC LIMIT 1),
              3.5
            )
            ELSE irb.amount
          END AS amount_pen
        FROM invoice_result_body irb
        INNER JOIN invoice_result_head irh ON irh.id = irb.idinvoice_result_head
          AND irh.status_invoice = 1
          AND COALESCE(irh.credit_memo_state, false) = false
        INNER JOIN service_order so ON so.id = irh.id_service_order
        INNER JOIN clinic_history ch ON ch.id = so.idclinichistory
        LEFT JOIN service_order_payment_detail sopd ON sopd.id = irb.service_order_payment_detail_id
        LEFT JOIN contract_detail cd ON cd.id = sopd.idcontractdetail AND cd.state = 1
        LEFT JOIN contract c_direct ON c_direct.id = cd.idcontract AND c_direct.state = 1
        LEFT JOIN LATERAL (
          SELECT c2.id
          FROM contract c2
          INNER JOIN contract_structure cs ON cs.id = c2.contract_structure_id
          WHERE c2.idclinichistory = ch.id AND c2.state = 1
            AND (
              cs.treatment_code LIKE 'OFM%'
              OR cs.treatment_code LIKE 'MARPE%'
              OR cs.treatment_code LIKE 'APNEA%'
            )
          ORDER BY c2.date DESC NULLS LAST
          LIMIT 1
        ) c_patient ON c_direct.id IS NULL
        WHERE (
          (irb.payment_date IS NOT NULL
            AND irb.payment_date >= $1::date AND irb.payment_date <= $2::date)
          OR (irb.payment_date IS NULL
            AND irh.invoice_date::date >= $1::date AND irh.invoice_date::date <= $2::date)
        )
        AND COALESCE(c_direct.id, c_patient.id) IS NOT NULL
        ${campusFilter}
      ),
      dedup AS (
        SELECT DISTINCT ON (op_key, id_currency)
          id_service_order, amount_usd, amount_pen
        FROM pagos
        ORDER BY op_key, id_currency, invoice_body_id
      )
      SELECT
        ROUND(COALESCE(SUM(amount_usd), 0)::numeric, 2) AS total_usd,
        ROUND(COALESCE(SUM(amount_pen), 0)::numeric, 2) AS total_pen,
        COUNT(DISTINCT id_service_order)::int AS os_count,
        COUNT(*)::int AS payment_count
      FROM dedup
    `;

    try {
      await client.connect();
      const result = await client.query(sql, params);
      const row = result.rows[0] ?? {};
      return {
        totalUsd: Number(row.total_usd ?? 0),
        totalPenConIgv: Number(row.total_pen ?? 0),
        osCount: Number(row.os_count ?? 0),
        paymentCount: Number(row.payment_count ?? 0),
      };
    } finally {
      try {
        await client.end();
      } catch {
        /* ignore */
      }
    }
  }

  /** Prueba conexión y devuelve conteo de líneas invoice del mes (diagnóstico prod). */
  async pingMonth(year: number, month: number): Promise<{
    ok: boolean;
    host: string;
    database: string;
    factRowCount: number;
    error?: string;
  }> {
    const { host, database } = this.svConfig;
    try {
      const { factRowCount } = await this.fetchMonthMetrics(year, month);
      return { ok: true, host, database, factRowCount };
    } catch (err) {
      return {
        ok: false,
        host,
        database,
        factRowCount: 0,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  async queryFacturacionRows(
    since: string,
    until: string,
    campusId?: number | null,
  ): Promise<Record<string, unknown>[]> {
    const client = this.createClient();
    const params: unknown[] = [since, until];
    let campusFilter = '';
    if (campusId != null) {
      params.push(campusId);
      campusFilter = ` AND ch.campus = $${params.length}`;
    }

    const sql = `
      WITH ejecutivo AS (
        SELECT DISTINCT ON (udp2.id_clinic_history)
          udp2.id_clinic_history,
          LOWER(TRIM(u2.username)) AS ejecutivo_oi
        FROM union_doctor_patient udp2
        INNER JOIN users u2 ON u2.id = udp2.id_sales_executive
        WHERE udp2.id_status_borrado = 2
          AND udp2.id_sales_executive IS NOT NULL
        ORDER BY udp2.id_clinic_history, udp2.id DESC
      )
      SELECT
        irb.id                        AS invoice_body_id,
        irh.id_service_order          AS service_order_id,
        irh.invoice_date::text         AS invoice_date,
        irb.payment_date::text         AS fecha_abono,
        irb.amount,
        c2.code                        AS moneda,
        CASE
          WHEN UPPER(COALESCE(c2.code, 'PEN')) IN ('USD', '$', 'US', 'DOL')
            THEN irb.amount * COALESCE(
              (SELECT er2.value FROM exchange_rate er2
               WHERE er2.state = 1
                 AND er2.date <= COALESCE(irb.payment_date, irh.invoice_date::date)
               ORDER BY er2.date DESC LIMIT 1),
              1
            )
          ELSE irb.amount
        END                            AS amount_pen,
        ch.campus                      AS campus_id,
        NULLIF(LOWER(TRIM(ej.ejecutivo_oi)), '') AS asignado_oi,
        NULLIF(LOWER(TRIM(u_so.username)), '') AS os_creator_username,
        NULLIF(LOWER(TRIM(u_bill.username)), '') AS facturador_username,
        ${OI_EJECUTIVO_LOGIN_EXPR}       AS ejecutivo_oi,
        irb.tariff_id,
        t.name                         AS tipo_arancel
      FROM invoice_result_body irb
      INNER JOIN invoice_result_head irh ON irh.id = irb.idinvoice_result_head
        AND irh.status_invoice = 1
        AND COALESCE(irh.credit_memo_state, false) = false
      INNER JOIN service_order so ON so.id = irh.id_service_order
      INNER JOIN clinic_history ch ON ch.id = so.idclinichistory
      LEFT JOIN tariff t ON t.id = irb.tariff_id
      LEFT JOIN coin c2 ON c2.id = irb.id_currency
      LEFT JOIN ejecutivo ej ON ej.id_clinic_history = ch.id
      LEFT JOIN users u_so ON u_so.id = so.user_created
      LEFT JOIN users u_bill ON u_bill.id = irh.billing_user_id
      WHERE COALESCE(t."name", '') NOT ILIKE '%Control OFM%'
        AND COALESCE(t."name", '') NOT ILIKE '%Control Marpe%'
        AND COALESCE(irb.tariff_id, 0) NOT IN (58, 192, 198)
        AND ${OI_FACTURACION_EVAL_OR_PT_WHERE}
        AND (
          (irb.payment_date IS NOT NULL
            AND irb.payment_date >= $1::date AND irb.payment_date <= $2::date)
          OR (irb.payment_date IS NULL
            AND irh.invoice_date::date >= $1::date AND irh.invoice_date::date <= $2::date)
        )
        ${campusFilter}
      ORDER BY irb.payment_date DESC NULLS LAST, irh.invoice_date DESC
    `;

    try {
      await client.connect();
      const result = await client.query(sql, params);
      return result.rows as Record<string, unknown>[];
    } finally {
      try {
        await client.end();
      } catch {
        /* ignore */
      }
    }
  }

  async queryEvaluacionesRows(
    since: string,
    until: string,
    campusId?: number | null,
  ): Promise<Record<string, unknown>[]> {
    const client = this.createClient();
    const params: unknown[] = [since, until];
    let campusFilter = '';
    if (campusId != null) {
      params.push(campusId);
      campusFilter = ` AND COALESCE(r.id_campus, ch.campus) = $${params.length}`;
    }

    // Evaluaciones OI COMPLETAS: pago completo vía clinic_history_crm.id_payment (no parciales).
    const sql = `
      WITH ejecutivo AS (
        SELECT DISTINCT ON (udp2.id_clinic_history)
          udp2.id_clinic_history,
          LOWER(TRIM(u2.username)) AS ejecutivo_oi
        FROM union_doctor_patient udp2
        INNER JOIN users u2 ON u2.id = udp2.id_sales_executive
        WHERE udp2.id_status_borrado = 2
          AND udp2.id_sales_executive IS NOT NULL
        ORDER BY udp2.id_clinic_history, udp2.id DESC
      )
      SELECT
        ${OI_EJECUTIVO_LOGIN_EXPR} AS ejecutivo_oi,
        COALESCE(r.id_campus, ch.campus) AS campus_id,
        COUNT(DISTINCT chc.id)::int  AS evaluaciones
      FROM clinic_history_crm chc
      INNER JOIN clinic_history ch ON ch.id = chc.patient_id
      INNER JOIN reservation r ON r.id = chc.id_reservation AND r.patient_id = ch.id
      LEFT JOIN tariff t ON t.id = r.tariff_id
      LEFT JOIN ejecutivo ej ON ej.id_clinic_history = ch.id
      INNER JOIN invoice_result_head irh ON irh.id = chc.id_payment
        AND irh.status_invoice = 1
        AND COALESCE(irh.credit_memo_state, false) = false
      INNER JOIN service_order so ON so.id = irh.id_service_order
      LEFT JOIN users u_so ON u_so.id = so.user_created
      LEFT JOIN users u_bill ON u_bill.id = irh.billing_user_id
      WHERE chc.id_payment IS NOT NULL
        AND chc.id_reservation IS NOT NULL
        AND ${OI_EVAL_TARIFF_WHERE}
        AND irh.invoice_date::date >= $1::date
        AND irh.invoice_date::date <= $2::date
        ${campusFilter}
      GROUP BY 1, 2
    `;

    try {
      await client.connect();
      const result = await client.query(sql, params);
      return result.rows as Record<string, unknown>[];
    } finally {
      try {
        await client.end();
      } catch {
        /* ignore */
      }
    }
  }

  /** id_sales_executive (HC) → creador OS → facturador recepción. */
  static resolveOiEjecutivoLogin(row: Record<string, unknown>): string {
    const pick = (...keys: string[]) => {
      for (const key of keys) {
        const s = String(row[key] ?? '').trim().toLowerCase();
        if (s && s !== 'sin_asignar') return s;
      }
      return '';
    };
    return pick('ejecutivo_oi', 'asignado_oi', 'os_creator_username', 'facturador_username');
  }

  aggregateMetrics(
    factRows: Record<string, unknown>[],
    evalRows: Record<string, unknown>[],
  ): Map<string, OiCrmUserMetrics> {
    const map = new Map<string, OiCrmUserMetrics>();
    const evalFromFact = new Map<string, number>();

    const add = (username: string, patch: Partial<OiCrmUserMetrics>) => {
      const key = username.trim().toLowerCase();
      if (!key || key === 'sin_asignar') return;
      mergeOiCrmMetricsRow(map, key, patch);
    };

    for (const row of factRows) {
      const attrib = OiSvInvoiceService.resolveOiEjecutivoLogin(row);
      const amountPen = Number(row.amount_pen ?? row.amount ?? 0);
      if (!attrib) continue;
      if (amountPen > 0) add(attrib, { facturadoConIgv: amountPen });
      if (isOiEvalFacturacionRow(row)) {
        evalFromFact.set(attrib, (evalFromFact.get(attrib) ?? 0) + 1);
      }
    }

    for (const [login, count] of evalFromFact) {
      add(login, { evaluaciones: count });
    }

    // Respaldo: CRM id_payment + cita (por si alguna eval no entró en facturación).
    for (const row of evalRows) {
      const ejecutivo = OiSvInvoiceService.resolveOiEjecutivoLogin(row);
      const evals = Number(row.evaluaciones ?? 0);
      if (!ejecutivo || evals <= 0) continue;
      const prev = map.get(ejecutivo)?.evaluaciones ?? 0;
      if (evals > prev) add(ejecutivo, { evaluaciones: evals });
    }

    return map;
  }

  async fetchMonthMetrics(
    year: number,
    month: number,
    campusId?: number | null,
  ): Promise<OiSvMonthMetrics> {
    const { start, end } = this.monthRange(year, month);
    const [factRows, evalRows] = await Promise.all([
      this.queryFacturacionRows(start, end, campusId),
      this.queryEvaluacionesRows(start, end, campusId),
    ]);
    const map = this.aggregateMetrics(factRows, evalRows);
    this.logger.log(
      `OI invoice ${year}-${month} @ ${this.svConfig.database}: ${factRows.length} líneas, ${map.size} ejecutivas`,
    );
    return {
      map,
      factRowCount: factRows.length,
      evalGroupCount: evalRows.length,
      source: 'sv-invoice-db',
    };
  }

  /** Subquery estándar (clinic-history-v2): último ejecutivo de controles por HC en BD prod. */
  private static readonly CONTROLES_EJECUTIVO_SQL = `
    (SELECT LOWER(TRIM(us_ctl.username))
     FROM union_doctor_patient udp_ce
     INNER JOIN users us_ctl ON us_ctl.id = udp_ce.id_controller_executive
     WHERE udp_ce.id_clinic_history = ch.id
       AND udp_ce.id_status_borrado = 2
       AND udp_ce.id_controller_executive IS NOT NULL
     ORDER BY udp_ce.created_at DESC
     LIMIT 1)`;

  /** Facturación controles OFM desde BD SV — misma lógica de atribución que prod (clinic-history-v2). */
  async queryControlesFacturacionRows(
    since: string,
    until: string,
    campusIds?: number[] | null,
  ): Promise<Record<string, unknown>[]> {
    const client = this.createClient();
    const params: unknown[] = [since, until];
    let campusFilter = '';
    if (campusIds != null && campusIds.length > 0) {
      params.push(campusIds);
      campusFilter = ` AND ch.campus = ANY($${params.length}::int[])`;
    }

    const sql = `
      SELECT
        irb.id                     AS invoice_body_id,
        irh.invoice_date::text      AS invoice_date,
        irb.payment_date::text      AS fecha_abono,
        irb.amount,
        c2.code                     AS moneda,
        ch.id                       AS id_historia_clinica,
        ch.campus                   AS campus_id,
        ${OiSvInvoiceService.CONTROLES_EJECUTIVO_SQL} AS ejecutivo_controles,
        LOWER(TRIM(COALESCE(u_bill.username, u_so.username, ''))) AS facturador_username,
        irb.tariff_id,
        t.name                      AS tipo_arancel
      FROM invoice_result_body irb
      INNER JOIN invoice_result_head irh ON irh.id = irb.idinvoice_result_head
        AND irh.status_invoice = 1
        AND COALESCE(irh.credit_memo_state, false) = false
      INNER JOIN service_order so ON so.id = irh.id_service_order
      INNER JOIN clinic_history ch ON ch.id = so.idclinichistory
      LEFT JOIN tariff t ON t.id = irb.tariff_id
      LEFT JOIN coin c2 ON c2.id = irb.id_currency
      LEFT JOIN users u_so ON u_so.id = so.user_created
      LEFT JOIN users u_bill ON u_bill.id = irh.billing_user_id
      WHERE irb.tariff_id IN (58, 192, 198)
        AND (
          (irb.payment_date IS NOT NULL
            AND irb.payment_date >= $1::date AND irb.payment_date <= $2::date)
          OR (irb.payment_date IS NULL
            AND irh.invoice_date::date >= $1::date AND irh.invoice_date::date <= $2::date)
        )
        AND EXISTS (
          SELECT 1 FROM contract c
          JOIN contract_structure cs ON cs.id = c.contract_structure_id
          WHERE c.idclinichistory = ch.id
            AND cs.treatment_code LIKE 'OFM%'
            AND c.state = 1
        )
        ${campusFilter}
      ORDER BY irb.payment_date DESC NULLS LAST, irh.invoice_date DESC
    `;

    try {
      await client.connect();
      const result = await client.query(sql, params);
      return result.rows as Record<string, unknown>[];
    } finally {
      try {
        await client.end();
      } catch {
        /* ignore */
      }
    }
  }

  /** Mapa id_historia_clinica → login SV (union_doctor_patient.id_controller_executive). */
  async queryControllerExecutiveMap(clinicHistoryIds: number[]): Promise<Map<number, string>> {
    const ids = [...new Set(clinicHistoryIds.filter((id) => id > 0))];
    const map = new Map<number, string>();
    if (ids.length === 0) return map;

    const client = this.createClient();
    try {
      await client.connect();
      const result = await client.query(
        `SELECT DISTINCT ON (udp.id_clinic_history)
            udp.id_clinic_history,
            LOWER(TRIM(u.username)) AS ejecutivo_controles
         FROM union_doctor_patient udp
         INNER JOIN users u ON u.id = udp.id_controller_executive
         WHERE udp.id_status_borrado = 2
           AND udp.id_controller_executive IS NOT NULL
           AND udp.id_clinic_history = ANY($1::int[])
         ORDER BY udp.id_clinic_history, udp.created_at DESC`,
        [ids],
      );
      for (const row of result.rows) {
        const hc = Number(row.id_clinic_history);
        const login = String(row.ejecutivo_controles ?? '').trim().toLowerCase();
        if (hc && login) map.set(hc, login);
      }
    } finally {
      try {
        await client.end();
      } catch {
        /* ignore */
      }
    }
    return map;
  }

  /** Métricas Call Center desde BD SV (misma query que union_doctor_patient_attention/call-center-metrics). */
  async queryCallCenterMetricsRows(
    since: string,
    until: string,
    campusIds?: number[] | null,
  ): Promise<Record<string, unknown>[]> {
    const client = this.createClient();
    const params: unknown[] = [since, until];
    let campusFilter = '';
    let campusFilterAsist = '';
    if (campusIds != null && campusIds.length > 0) {
      params.push(campusIds);
      campusFilter = ` AND ch.campus = ANY($${params.length}::int[])`;
      campusFilterAsist = ` AND COALESCE(r.id_campus, ch.campus) = ANY($${params.length}::int[])`;
    }

    const sql = `
      WITH ejecutivo AS (
        SELECT DISTINCT ON (udp2.id_clinic_history)
          udp2.id_clinic_history,
          LOWER(TRIM(u2.username)) AS ejecutivo
        FROM union_doctor_patient udp2
        INNER JOIN users u2 ON u2.id = udp2.id_sales_executive
        WHERE udp2.id_status_borrado = 2 AND udp2.id_sales_executive IS NOT NULL
        ORDER BY udp2.id_clinic_history, udp2.id DESC
      ),
      pagos_mes AS (
        SELECT
          COALESCE(c_direct.id, c_patient.id) AS contract_id,
          ch.campus AS campus_id,
          LOWER(TRIM(COALESCE(ej.ejecutivo, u_bill.username, u_so.username, ''))) AS ejecutivo,
          CASE
            WHEN COALESCE(cs_direct.treatment_code, c_patient.treatment_code, '') ILIKE '%APNEA%'
              OR COALESCE(cs_direct.treatment_code, c_patient.treatment_code, '') ILIKE '%CAPNEA%'
              THEN 'apnea' ELSE 'ofm'
          END AS tipo_tratamiento,
          CASE
            WHEN cd.description ILIKE '%moldes%' OR cd.description ILIKE '%inicial%'
              OR cd.description ILIKE '%contado%' THEN 'contado' ELSE 'cuotas'
          END AS modalidad_pago
        FROM invoice_result_body irb
        INNER JOIN invoice_result_head irh ON irh.id = irb.idinvoice_result_head
          AND irh.status_invoice = 1 AND COALESCE(irh.credit_memo_state, false) = false
        INNER JOIN service_order so ON so.id = irh.id_service_order
        INNER JOIN clinic_history ch ON ch.id = so.idclinichistory
        LEFT JOIN service_order_payment_detail sopd ON sopd.id = irb.service_order_payment_detail_id
        LEFT JOIN contract_detail cd ON cd.id = sopd.idcontractdetail AND cd.state = 1
        LEFT JOIN contract c_direct ON c_direct.id = cd.idcontract AND c_direct.state = 1
        LEFT JOIN contract_structure cs_direct ON cs_direct.id = c_direct.contract_structure_id
        LEFT JOIN LATERAL (
          SELECT c2.id, cs2.treatment_code
          FROM contract c2
          INNER JOIN contract_structure cs2 ON cs2.id = c2.contract_structure_id
          WHERE c2.idclinichistory = ch.id AND c2.state = 1
            AND (cs2.treatment_code LIKE 'OFM%' OR cs2.treatment_code LIKE 'APNEA%' OR cs2.treatment_code LIKE 'CAPNEA%')
          ORDER BY c2.date DESC NULLS LAST LIMIT 1
        ) c_patient ON c_direct.id IS NULL
        LEFT JOIN ejecutivo ej ON ej.id_clinic_history = ch.id
        LEFT JOIN users u_bill ON u_bill.id = irh.billing_user_id
        LEFT JOIN users u_so ON u_so.id = so.user_created
        WHERE COALESCE(c_direct.id, c_patient.id) IS NOT NULL
          AND (
            (irb.payment_date IS NOT NULL AND irb.payment_date >= $1::date AND irb.payment_date <= $2::date)
            OR (irb.payment_date IS NULL AND irh.invoice_date::date >= $1::date AND irh.invoice_date::date <= $2::date)
          )
          ${campusFilter}
      ),
      tto_agg AS (
        SELECT ejecutivo, campus_id,
          COUNT(*) FILTER (WHERE tipo_tratamiento = 'ofm' AND modalidad_pago = 'contado')::int AS tto_ofm_contado,
          COUNT(*) FILTER (WHERE tipo_tratamiento = 'ofm' AND modalidad_pago = 'cuotas')::int AS tto_ofm_cuotas,
          COUNT(*) FILTER (WHERE tipo_tratamiento = 'apnea' AND modalidad_pago = 'contado')::int AS tto_apnea_contado,
          COUNT(*) FILTER (WHERE tipo_tratamiento = 'apnea' AND modalidad_pago = 'cuotas')::int AS tto_apnea_cuotas
        FROM pagos_mes WHERE ejecutivo <> '' GROUP BY ejecutivo, campus_id
      ),
      eva_vend AS (
        SELECT
          LOWER(TRIM(COALESCE(ej.ejecutivo, u_bill.username, ''))) AS ejecutivo,
          COALESCE(r.id_campus, ch.campus) AS campus_id,
          COUNT(DISTINCT chc.id) FILTER (
            WHERE COALESCE(t.name, '') NOT ILIKE '%APNEA%'
              AND COALESCE(t.name, '') NOT ILIKE '%CAPNEA%'
          )::int AS eva_vendidas_ofm,
          COUNT(DISTINCT chc.id) FILTER (
            WHERE COALESCE(t.name, '') ILIKE '%APNEA%'
              OR COALESCE(t.name, '') ILIKE '%CAPNEA%'
          )::int AS eva_vendidas_apnea
        FROM clinic_history_crm chc
        INNER JOIN clinic_history ch ON ch.id = chc.patient_id
        INNER JOIN reservation r ON r.id = chc.id_reservation AND r.patient_id = ch.id
        LEFT JOIN tariff t ON t.id = r.tariff_id
        LEFT JOIN ejecutivo ej ON ej.id_clinic_history = ch.id
        INNER JOIN invoice_result_head irh ON irh.id = chc.id_payment
          AND irh.status_invoice = 1
          AND COALESCE(irh.credit_memo_state, false) = false
        LEFT JOIN users u_bill ON u_bill.id = irh.billing_user_id
        WHERE chc.id_payment IS NOT NULL
          AND chc.id_reservation IS NOT NULL
          AND COALESCE(r.tariff_id, 0) NOT IN (58, 192, 198)
          AND COALESCE(t.name, '') ILIKE '%Evalu%'
          AND irh.invoice_date::date >= $1::date
          AND irh.invoice_date::date <= $2::date
          ${campusFilter.replace(/ch\.campus/g, 'COALESCE(r.id_campus, ch.campus)')}
        GROUP BY 1, 2
        HAVING LOWER(TRIM(COALESCE(ej.ejecutivo, u_bill.username, ''))) <> ''
      ),
      eva_asist AS (
        SELECT ejecutivo, campus_id, SUM(cnt)::int AS eva_asistidas
        FROM (
          SELECT
            LOWER(TRIM(COALESCE(ej.ejecutivo, u_bill.username, u_so.username, ''))) AS ejecutivo,
            COALESCE(r.id_campus, ch.campus) AS campus_id,
            COUNT(DISTINCT irb.id)::int AS cnt
          FROM invoice_result_body irb
          INNER JOIN invoice_result_head irh ON irh.id = irb.idinvoice_result_head
            AND irh.status_invoice = 1 AND COALESCE(irh.credit_memo_state, false) = false
          INNER JOIN service_order so ON so.id = irh.id_service_order
          INNER JOIN clinic_history ch ON ch.id = so.idclinichistory
          INNER JOIN clinic_history_crm chc ON chc.patient_id = ch.id
            AND chc.id_reservation IS NOT NULL
          INNER JOIN reservation r ON r.id = chc.id_reservation
            AND r.patient_id = ch.id
            AND r.state IN (3, 4, 5)
          LEFT JOIN tariff t ON t.id = irb.tariff_id
          LEFT JOIN ejecutivo ej ON ej.id_clinic_history = ch.id
          LEFT JOIN users u_bill ON u_bill.id = irh.billing_user_id
          LEFT JOIN users u_so ON u_so.id = so.user_created
          WHERE t."name" ILIKE '%Evalu%'
            AND COALESCE(irb.tariff_id, 0) NOT IN (58, 192, 198)
            AND (
              (irb.payment_date IS NOT NULL AND irb.payment_date >= $1::date AND irb.payment_date <= $2::date)
              OR (irb.payment_date IS NULL AND irh.invoice_date::date >= $1::date AND irh.invoice_date::date <= $2::date)
            )
            ${campusFilterAsist}
          GROUP BY 1, 2
          HAVING LOWER(TRIM(COALESCE(ej.ejecutivo, u_bill.username, u_so.username, ''))) <> ''
          UNION ALL
          SELECT
            LOWER(TRIM(COALESCE(ej.ejecutivo, iv.billing_user, iv.so_creator, ''))) AS ejecutivo,
            COALESCE(r.id_campus, ch.campus) AS campus_id,
            COUNT(DISTINCT r.id)::int AS cnt
          FROM reservation r
          INNER JOIN clinic_history ch ON ch.id = r.patient_id
          LEFT JOIN tariff t ON t.id = r.tariff_id
          LEFT JOIN ejecutivo ej ON ej.id_clinic_history = ch.id
          LEFT JOIN LATERAL (
            SELECT
              LOWER(TRIM(COALESCE(u_bill2.username, ''))) AS billing_user,
              LOWER(TRIM(COALESCE(u_so2.username, ''))) AS so_creator
            FROM invoice_result_body irb2
            INNER JOIN invoice_result_head irh2 ON irh2.id = irb2.idinvoice_result_head
              AND irh2.status_invoice = 1 AND COALESCE(irh2.credit_memo_state, false) = false
            INNER JOIN service_order so2 ON so2.id = irh2.id_service_order
            LEFT JOIN tariff t2 ON t2.id = irb2.tariff_id
            LEFT JOIN users u_bill2 ON u_bill2.id = irh2.billing_user_id
            LEFT JOIN users u_so2 ON u_so2.id = so2.user_created
            WHERE so2.idclinichistory = ch.id
              AND COALESCE(t2."name", '') ILIKE '%Evalu%'
              AND COALESCE(irb2.tariff_id, 0) NOT IN (58, 192, 198)
            ORDER BY irh2.invoice_date DESC NULLS LAST LIMIT 1
          ) iv ON true
          WHERE r.state IN (3, 4, 5)
            AND COALESCE(t."name", '') ILIKE '%Evalu%'
            AND COALESCE(r.tariff_id, 0) NOT IN (58, 192, 198)
            AND r.date >= $1::date AND r.date <= $2::date
            AND NOT EXISTS (
              SELECT 1 FROM clinic_history_crm chc2
              WHERE chc2.id_reservation = r.id AND chc2.patient_id = ch.id
            )
            ${campusFilterAsist}
          GROUP BY 1, 2
          HAVING LOWER(TRIM(COALESCE(ej.ejecutivo, iv.billing_user, iv.so_creator, ''))) <> ''
        ) eva_asist_union
        GROUP BY ejecutivo, campus_id
      ),
      keys AS (
        SELECT ejecutivo, campus_id FROM tto_agg
        UNION SELECT ejecutivo, campus_id FROM eva_vend
        UNION SELECT ejecutivo, campus_id FROM eva_asist WHERE ejecutivo <> 'sin_asignar'
      )
      SELECT
        k.ejecutivo,
        k.campus_id,
        COALESCE(t.tto_ofm_contado, 0) AS tto_ofm_contado,
        COALESCE(t.tto_ofm_cuotas, 0) AS tto_ofm_cuotas,
        COALESCE(t.tto_apnea_contado, 0) AS tto_apnea_contado,
        COALESCE(t.tto_apnea_cuotas, 0) AS tto_apnea_cuotas,
        COALESCE(v.eva_vendidas_ofm, 0) AS eva_vendidas_ofm,
        COALESCE(v.eva_vendidas_apnea, 0) AS eva_vendidas_apnea,
        COALESCE(a.eva_asistidas, 0) AS eva_asistidas
      FROM keys k
      LEFT JOIN tto_agg t ON t.ejecutivo = k.ejecutivo AND t.campus_id = k.campus_id
      LEFT JOIN eva_vend v ON v.ejecutivo = k.ejecutivo AND v.campus_id = k.campus_id
      LEFT JOIN eva_asist a ON a.ejecutivo = k.ejecutivo AND a.campus_id = k.campus_id
      WHERE k.ejecutivo <> '' AND k.ejecutivo <> 'sin_asignar'
      ORDER BY k.ejecutivo, k.campus_id
    `;

    try {
      await client.connect();
      const result = await client.query(sql, params);
      return result.rows as Record<string, unknown>[];
    } finally {
      try {
        await client.end();
      } catch {
        /* ignore */
      }
    }
  }

  /** Sede de facturación SV (clinic_history.campus) por cotización y/o contrato. Prioriza boleta/factura sobre contrato. */
  async queryCerradorasInvoiceCampusMap(
    quotationIds: number[],
    contractIds: number[] = [],
  ): Promise<{ byQuotation: Map<number, number>; byContract: Map<number, number> }> {
    const byQuotation = new Map<number, number>();
    const byContract = new Map<number, number>();
    const qIds = [...new Set(quotationIds.filter((id) => id > 0))];
    const cIds = [...new Set(contractIds.filter((id) => id > 0))];
    if (qIds.length === 0 && cIds.length === 0) {
      return { byQuotation, byContract };
    }

    const client = this.createClient();
    try {
      await client.connect();
      if (qIds.length > 0) {
        const byInvoiceQ = await client.query(
          `SELECT DISTINCT ON (q.id)
              q.id AS quotation_id,
              ch.campus AS campus_id
           FROM quotation q
           INNER JOIN service_order so ON so.idquotation = q.id
           INNER JOIN invoice_result_head irh ON irh.id_service_order = so.id AND irh.status_invoice = 1
           INNER JOIN clinic_history ch ON ch.id = so.idclinichistory
           WHERE q.id = ANY($1::int[])
           ORDER BY q.id, irh.invoice_date DESC NULLS LAST`,
          [qIds],
        );
        for (const row of byInvoiceQ.rows) {
          const qid = Number(row.quotation_id);
          const campus = Number(row.campus_id);
          if (qid > 0 && campus > 0) byQuotation.set(qid, campus);
        }

        const byQ = await client.query(
          `SELECT DISTINCT ON (c.idquotation)
              c.idquotation AS quotation_id,
              c.id AS contract_id,
              ch.campus AS campus_id
           FROM contract c
           INNER JOIN clinic_history ch ON ch.id = c.idclinichistory
           WHERE c.idquotation = ANY($1::int[])
             AND c.state = 1
             AND COALESCE(c.idquotation, 0) > 0
           ORDER BY c.idquotation, c.date DESC NULLS LAST`,
          [qIds],
        );
        for (const row of byQ.rows) {
          const qid = Number(row.quotation_id);
          const cid = Number(row.contract_id);
          const campus = Number(row.campus_id);
          if (qid > 0 && campus > 0 && !byQuotation.has(qid)) byQuotation.set(qid, campus);
          if (cid > 0 && campus > 0) byContract.set(cid, campus);
        }
      }

      if (cIds.length > 0) {
        const byInvoiceC = await client.query(
          `SELECT DISTINCT ON (c.id)
              c.id AS contract_id,
              COALESCE(c.idquotation, 0) AS quotation_id,
              ch.campus AS campus_id
           FROM contract c
           INNER JOIN contract_detail cd ON cd.idcontract = c.id AND cd.state = 1
           INNER JOIN service_order_payment_detail sopd ON sopd.id = cd.id
           INNER JOIN invoice_result_body irb ON irb.service_order_payment_detail_id = sopd.id
           INNER JOIN invoice_result_head irh ON irh.id = irb.idinvoice_result_head AND irh.status_invoice = 1
           INNER JOIN service_order so ON so.id = irh.id_service_order
           INNER JOIN clinic_history ch ON ch.id = so.idclinichistory
           WHERE c.id = ANY($1::int[])
             AND c.state = 1
           ORDER BY c.id, irh.invoice_date DESC NULLS LAST`,
          [cIds],
        );
        for (const row of byInvoiceC.rows) {
          const cid = Number(row.contract_id);
          const qid = Number(row.quotation_id);
          const campus = Number(row.campus_id);
          if (cid > 0 && campus > 0) byContract.set(cid, campus);
          if (qid > 0 && campus > 0) byQuotation.set(qid, campus);
        }

        const byC = await client.query(
          `SELECT DISTINCT ON (c.id)
              c.id AS contract_id,
              COALESCE(c.idquotation, 0) AS quotation_id,
              ch.campus AS campus_id
           FROM contract c
           INNER JOIN clinic_history ch ON ch.id = c.idclinichistory
           WHERE c.id = ANY($1::int[])
             AND c.state = 1
           ORDER BY c.id, c.date DESC NULLS LAST`,
          [cIds],
        );
        for (const row of byC.rows) {
          const cid = Number(row.contract_id);
          const qid = Number(row.quotation_id);
          const campus = Number(row.campus_id);
          if (cid > 0 && campus > 0 && !byContract.has(cid)) byContract.set(cid, campus);
          if (qid > 0 && campus > 0 && !byQuotation.has(qid)) byQuotation.set(qid, campus);
        }
      }
    } finally {
      try {
        await client.end();
      } catch {
        /* ignore */
      }
    }
    return { byQuotation, byContract };
  }

  /** Cotizaciones con factura SV en el período (misma query que facturacion-cerradoras). */
  async queryCerradorasFacturacionRows(
    since: string,
    until: string,
    campusId?: number | null,
  ): Promise<Array<{
    contract_id: number;
    quotation_id: number;
    contract_date: string;
    contract_num: string;
    campus_id: number;
    billing_username: string;
    os_creator_username: string;
    service_order_id: number;
    service_order_creator_id: number;
    payment_date: string;
    moldes_date: string | null;
    first_payment_date: string | null;
    amount_usd: number;
    treatment_code: string;
  }>> {
    const client = this.createClient();
    const params: unknown[] = [since, until];
    const campusFilter = cerradorasCampusSqlFilter(campusId, params);

    const sql = `
      WITH pagos_mes AS (
        SELECT
          COALESCE(c_direct.id, c_patient.id) AS contract_id,
          COALESCE(c_direct.idquotation, c_patient.idquotation, NULLIF(so.idquotation, 0), 0) AS quotation_id,
          COALESCE(c_direct.date, c_patient.date)::text AS contract_date,
          COALESCE(c_direct.num, c_patient.num, '') AS contract_num,
          COALESCE(cs_direct.treatment_code, c_patient.treatment_code, '') AS treatment_code,
          ch.campus AS campus_id,
          irh.id_service_order AS service_order_id,
          irh.service_order_creator_id AS service_order_creator_id,
          LOWER(TRIM(COALESCE(u_bill.username, ''))) AS billing_username,
          LOWER(TRIM(COALESCE(
            NULLIF(TRIM(u_irh_so.username), ''),
            NULLIF(TRIM(u_so.username), ''),
            ''
          ))) AS os_creator_username,
          COALESCE(irb.payment_date, irh.invoice_date::date)::text AS payment_date,
          CASE
            WHEN irb.id_currency = 2 THEN irb.amount
            ELSE irb.amount / NULLIF(COALESCE(
              (SELECT er2.value FROM exchange_rate er2
               WHERE er2.state = 1
                 AND er2.date <= COALESCE(irb.payment_date, irh.invoice_date::date)
               ORDER BY er2.date DESC LIMIT 1),
              3.5
            ), 0)
          END AS amount_usd,
          (SELECT MIN(cd2.date)::text FROM contract_detail cd2
            WHERE cd2.idcontract = COALESCE(c_direct.id, c_patient.id)
              AND cd2.state = 1 AND cd2.description ILIKE '%moldes%') AS moldes_date,
          (SELECT MIN(cd3.date)::text FROM contract_detail cd3
            WHERE cd3.idcontract = COALESCE(c_direct.id, c_patient.id)
              AND cd3.state = 1) AS first_payment_date,
          CASE
            WHEN cd.description ILIKE '%moldes%' THEN 0
            WHEN cd.description ILIKE '%inicial%' THEN 1
            ELSE 2
          END AS quota_priority
        FROM invoice_result_body irb
        INNER JOIN invoice_result_head irh ON irh.id = irb.idinvoice_result_head
          AND irh.status_invoice = 1
          AND COALESCE(irh.credit_memo_state, false) = false
        INNER JOIN service_order so ON so.id = irh.id_service_order
        INNER JOIN clinic_history ch ON ch.id = so.idclinichistory
        LEFT JOIN service_order_payment_detail sopd ON sopd.id = irb.service_order_payment_detail_id
        LEFT JOIN contract_detail cd ON cd.id = sopd.idcontractdetail AND cd.state = 1
        LEFT JOIN contract c_direct ON c_direct.id = cd.idcontract AND c_direct.state = 1
        LEFT JOIN contract_structure cs_direct ON cs_direct.id = c_direct.contract_structure_id
        LEFT JOIN LATERAL (
          SELECT c2.id, c2.idquotation, c2.date, c2.num, cs2.treatment_code
          FROM contract c2
          INNER JOIN contract_structure cs2 ON cs2.id = c2.contract_structure_id
          WHERE c2.idclinichistory = ch.id AND c2.state = 1
            AND (
              cs2.treatment_code LIKE 'OFM%'
              OR cs2.treatment_code LIKE 'MARPE%'
              OR cs2.treatment_code LIKE 'APNEA%'
            )
          ORDER BY c2.date DESC NULLS LAST
          LIMIT 1
        ) c_patient ON c_direct.id IS NULL
        LEFT JOIN users u_bill ON u_bill.id = irh.billing_user_id
        LEFT JOIN users u_irh_so ON u_irh_so.id = irh.service_order_creator_id
        LEFT JOIN users u_so ON u_so.id = so.user_created
        WHERE (
          (irb.payment_date IS NOT NULL
            AND irb.payment_date >= $1::date AND irb.payment_date <= $2::date)
          OR (irb.payment_date IS NULL
            AND irh.invoice_date::date >= $1::date AND irh.invoice_date::date <= $2::date)
        )
        AND COALESCE(c_direct.id, c_patient.id) IS NOT NULL
        ${campusFilter}
      )
      SELECT DISTINCT ON (service_order_id)
        contract_id, quotation_id, contract_date, contract_num, treatment_code,
        campus_id, service_order_id, service_order_creator_id,
        billing_username, os_creator_username,
        payment_date, moldes_date, first_payment_date, amount_usd
      FROM pagos_mes
      WHERE billing_username <> '' OR os_creator_username <> ''
      ORDER BY service_order_id, quota_priority, payment_date ASC
    `;

    try {
      await client.connect();
      const result = await client.query(sql, params);
      return (result.rows as Record<string, unknown>[]).map((r) => ({
        contract_id: Number(r.contract_id),
        quotation_id: Number(r.quotation_id ?? 0),
        contract_date: String(r.contract_date ?? ''),
        contract_num: String(r.contract_num ?? ''),
        campus_id: Number(r.campus_id ?? 1),
        billing_username: String(r.billing_username ?? '').trim().toLowerCase(),
        os_creator_username: String(r.os_creator_username ?? '').trim().toLowerCase(),
        service_order_id: Number(r.service_order_id ?? 0),
        service_order_creator_id: Number(r.service_order_creator_id ?? 0),
        payment_date: String(r.payment_date ?? '').slice(0, 10),
        moldes_date: r.moldes_date ? String(r.moldes_date).slice(0, 10) : null,
        first_payment_date: r.first_payment_date ? String(r.first_payment_date).slice(0, 10) : null,
        amount_usd: Number(r.amount_usd ?? 0),
        treatment_code: String(r.treatment_code ?? ''),
      })).filter((r) => r.contract_id > 0 && (r.billing_username || r.os_creator_username));
    } finally {
      try {
        await client.end();
      } catch {
        /* ignore */
      }
    }
  }

  /**
   * Sede principal por cerradora: sede donde más cierres facturó en SV (últimos 18 meses).
   * Misma lógica que facturacion-cerradoras (contratos OFM/MARPE/APNEA), no equipos CRM.
   */
  async queryCerradoraDominantCampusByLogin(
    svLogins: string[],
  ): Promise<Map<string, number>> {
    const logins = [...new Set(svLogins.map((l) => l.trim().toLowerCase()).filter(Boolean))];
    if (logins.length === 0) return new Map();

    const since = new Date();
    since.setMonth(since.getMonth() - 18);
    const sinceStr = since.toISOString().slice(0, 10);

    const client = this.createClient();
    try {
      await client.connect();
      const result = await client.query(
        `WITH pagos AS (
           SELECT
             LOWER(TRIM(COALESCE(
               NULLIF(TRIM(u_irh_so.username), ''),
               NULLIF(TRIM(u_so.username), ''),
               NULLIF(TRIM(u_bill.username), ''),
               ''
             ))) AS billing_login,
             ch.campus AS campus_id,
             irh.id_service_order AS service_order_id
           FROM invoice_result_body irb
           INNER JOIN invoice_result_head irh ON irh.id = irb.idinvoice_result_head
             AND irh.status_invoice = 1
             AND COALESCE(irh.credit_memo_state, false) = false
           INNER JOIN service_order so ON so.id = irh.id_service_order
           INNER JOIN clinic_history ch ON ch.id = so.idclinichistory
           LEFT JOIN service_order_payment_detail sopd ON sopd.id = irb.service_order_payment_detail_id
           LEFT JOIN contract_detail cd ON cd.id = sopd.idcontractdetail AND cd.state = 1
           LEFT JOIN contract c_direct ON c_direct.id = cd.idcontract AND c_direct.state = 1
           LEFT JOIN LATERAL (
             SELECT c2.id
             FROM contract c2
             INNER JOIN contract_structure cs ON cs.id = c2.contract_structure_id
             WHERE c2.idclinichistory = ch.id AND c2.state = 1
               AND (
                 cs.treatment_code LIKE 'OFM%'
                 OR cs.treatment_code LIKE 'MARPE%'
                 OR cs.treatment_code LIKE 'APNEA%'
               )
             ORDER BY c2.date DESC NULLS LAST
             LIMIT 1
           ) c_patient ON c_direct.id IS NULL
           LEFT JOIN users u_bill ON u_bill.id = irh.billing_user_id
           LEFT JOIN users u_irh_so ON u_irh_so.id = irh.service_order_creator_id
           LEFT JOIN users u_so ON u_so.id = so.user_created
           WHERE (
             (irb.payment_date IS NOT NULL AND irb.payment_date >= $1::date)
             OR (irb.payment_date IS NULL AND irh.invoice_date::date >= $1::date)
           )
             AND COALESCE(c_direct.id, c_patient.id) IS NOT NULL
             AND LOWER(TRIM(COALESCE(
               NULLIF(TRIM(u_irh_so.username), ''),
               NULLIF(TRIM(u_so.username), ''),
               NULLIF(TRIM(u_bill.username), ''),
               ''
             ))) = ANY($2::text[])
         ),
         fact AS (
           SELECT billing_login, campus_id, COUNT(DISTINCT service_order_id)::int AS closures
           FROM pagos
           WHERE billing_login <> '' AND campus_id > 0
           GROUP BY billing_login, campus_id
         ),
         ranked AS (
           SELECT billing_login, campus_id,
             ROW_NUMBER() OVER (PARTITION BY billing_login ORDER BY closures DESC, campus_id) AS rn
           FROM fact
         )
         SELECT billing_login, campus_id FROM ranked WHERE rn = 1`,
        [sinceStr, logins],
      );
      const map = new Map<string, number>();
      for (const row of result.rows) {
        map.set(String(row.billing_login), normalizeCerradorasCampusId(Number(row.campus_id)));
      }
      return map;
    } finally {
      try {
        await client.end();
      } catch {
        /* ignore */
      }
    }
  }

  async queryQuotationInvoiceCampusMap(
    quotationIds: number[],
  ): Promise<Map<number, number>> {
    const { byQuotation } = await this.queryCerradorasInvoiceCampusMap(quotationIds);
    return byQuotation;
  }

  async lookupDisplayName(svLogin: string): Promise<string | null> {
    const client = this.createClient();
    try {
      await client.connect();
      const result = await client.query(
        `SELECT u.username AS display_name
         FROM users u
         WHERE LOWER(TRIM(u.username)) = LOWER(TRIM($1))
         LIMIT 1`,
        [svLogin],
      );
      return result.rows[0]?.display_name ?? null;
    } catch {
      return null;
    } finally {
      try {
        await client.end();
      } catch {
        /* ignore */
      }
    }
  }
}
