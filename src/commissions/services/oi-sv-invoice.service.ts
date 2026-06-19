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

/** Consulta directa a BD SV (invoice_result_*) — fuente única para comisiones OI. */
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
        LOWER(TRIM(COALESCE(ej.ejecutivo_oi, u_bill.username, u_so.username, 'sin_asignar'))) AS ejecutivo_oi,
        LOWER(TRIM(COALESCE(u_bill.username, u_so.username, ''))) AS facturador_username,
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
      campusFilter = ` AND ch.campus = $${params.length}`;
    }

    // Evaluaciones FACTURADAS por ejecutivo OI (OS + factura). Atribución: ejecutiva OI → facturador → creador OS.
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
        LOWER(TRIM(COALESCE(ej.ejecutivo_oi, u_bill.username, u_so.username, 'sin_asignar'))) AS ejecutivo_oi,
        ch.campus                    AS campus_id,
        COUNT(DISTINCT irb.id)::int  AS evaluaciones
      FROM invoice_result_body irb
      INNER JOIN invoice_result_head irh ON irh.id = irb.idinvoice_result_head
        AND irh.status_invoice = 1
        AND COALESCE(irh.credit_memo_state, false) = false
      INNER JOIN service_order so ON so.id = irh.id_service_order
      INNER JOIN clinic_history ch ON ch.id = so.idclinichistory
      LEFT  JOIN tariff t ON t.id = irb.tariff_id
      LEFT  JOIN ejecutivo ej ON ej.id_clinic_history = ch.id
      LEFT  JOIN users u_so ON u_so.id = so.user_created
      LEFT  JOIN users u_bill ON u_bill.id = irh.billing_user_id
      WHERE t."name" ILIKE '%Evalu%'
        AND COALESCE(irb.tariff_id, 0) NOT IN (58, 192, 198)
        AND (
          (irb.payment_date IS NOT NULL
            AND irb.payment_date >= $1::date AND irb.payment_date <= $2::date)
          OR (irb.payment_date IS NULL
            AND irh.invoice_date::date >= $1::date AND irh.invoice_date::date <= $2::date)
        )
        ${campusFilter}
      GROUP BY 1, ch.campus
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

  aggregateMetrics(
    factRows: Record<string, unknown>[],
    evalRows: Record<string, unknown>[],
  ): Map<string, OiCrmUserMetrics> {
    const map = new Map<string, OiCrmUserMetrics>();

    const add = (username: string, patch: Partial<OiCrmUserMetrics>) => {
      const key = username.trim().toLowerCase();
      if (!key || key === 'sin_asignar') return;
      mergeOiCrmMetricsRow(map, key, patch);
    };

    for (const row of factRows) {
      const ejecutivoOi = String(row.ejecutivo_oi ?? '').trim().toLowerCase();
      const facturador = String(row.facturador_username ?? '').trim().toLowerCase();
      // Prioridad: ejecutivo OI asignado (id_sales_executive) → facturador (fallback)
      const attrib = (ejecutivoOi && ejecutivoOi !== 'sin_asignar')
        ? ejecutivoOi
        : facturador;
      const amountPen = Number(row.amount_pen ?? row.amount ?? 0);
      if (!attrib || amountPen <= 0) continue;
      add(attrib, { facturadoConIgv: amountPen });
    }

    for (const row of evalRows) {
      const ejecutivo = String(row.ejecutivo_oi ?? '').trim().toLowerCase();
      const evals = Number(row.evaluaciones ?? 0);
      if (!ejecutivo || ejecutivo === 'sin_asignar' || evals <= 0) continue;
      add(ejecutivo, { evaluaciones: evals });
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
            ch.campus AS campus_id,
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
            ${campusFilter}
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

  /**
   * Sede principal por cerradora según dónde facturó en SV (últimos 18 meses).
   * login SV (username) → campus_id dominante.
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
        `WITH fact AS (
           SELECT
             LOWER(TRIM(COALESCE(u_bill.username, u_so.username, ''))) AS billing_login,
             ch.campus AS campus_id,
             COUNT(DISTINCT irh.id)::int AS invoices
           FROM invoice_result_head irh
           INNER JOIN service_order so ON so.id = irh.id_service_order
           INNER JOIN clinic_history ch ON ch.id = so.idclinichistory
           LEFT JOIN users u_bill ON u_bill.id = irh.billing_user_id
           LEFT JOIN users u_so ON u_so.id = so.user_created
           WHERE irh.status_invoice = 1
             AND COALESCE(irh.credit_memo_state, false) = false
             AND irh.invoice_date >= $1::date
             AND LOWER(TRIM(COALESCE(u_bill.username, u_so.username, ''))) = ANY($2::text[])
           GROUP BY billing_login, ch.campus
         ),
         ranked AS (
           SELECT billing_login, campus_id,
             ROW_NUMBER() OVER (PARTITION BY billing_login ORDER BY invoices DESC, campus_id) AS rn
           FROM fact
           WHERE campus_id > 0
         )
         SELECT billing_login, campus_id FROM ranked WHERE rn = 1`,
        [sinceStr, logins],
      );
      const map = new Map<string, number>();
      for (const row of result.rows) {
        map.set(String(row.billing_login), Number(row.campus_id));
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
