import { Injectable, Logger } from '@nestjs/common';
import { Client } from 'pg';
import {
  mergeOiCrmMetricsRow,
  type OiCrmUserMetrics,
} from '../utils/oi-crm-metrics.util';

export interface OiSvMonthMetrics {
  map: Map<string, OiCrmUserMetrics>;
  factRowCount: number;
  evalGroupCount: number;
  source: 'sv-invoice-db';
}

/** Consulta directa a BD SV (invoice_result_*) — fuente única para comisiones OI. */
@Injectable()
export class OiSvInvoiceService {
  private readonly logger = new Logger(OiSvInvoiceService.name);

  private createClient(): Client {
    return new Client({
      host: process.env.SV_DB_HOST || '161.132.211.235',
      port: parseInt(process.env.SV_DB_PORT || '5501', 10),
      user: process.env.SV_DB_USERNAME || 'desarrollador_dev_maxillaris',
      password: process.env.SV_DB_PASSWORD || 'hq75TCdbiJzhfr7lXt3w',
      database: process.env.SV_DB_DATABASE || 'sv_dev',
    });
  }

  monthRange(year: number, month: number): { start: string; end: string } {
    const start = `${year}-${String(month).padStart(2, '0')}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const end = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    return { start, end };
  }

  /** Facturación del mes: evaluaciones OI + planes de tratamiento (excl. controles OFM/MARPE). */
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
        LOWER(TRIM(COALESCE(
          ej.ejecutivo_oi,
          u_bill.username,
          u_so.username,
          'sin_asignar'
        )))                            AS ejecutivo_oi,
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

  /** Evaluaciones OI realizadas (reservas) en el mes. */
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
      ),
      facturador_eval AS (
        SELECT DISTINCT ON (irb2.tariff_id, so2.idclinichistory)
          so2.idclinichistory AS id_clinic_history,
          LOWER(TRIM(COALESCE(u_bill2.username, u_so2.username))) AS billing_user
        FROM invoice_result_body irb2
        INNER JOIN invoice_result_head irh2 ON irh2.id = irb2.idinvoice_result_head
          AND irh2.status_invoice = 1
          AND COALESCE(irh2.credit_memo_state, false) = false
        INNER JOIN service_order so2 ON so2.id = irh2.id_service_order
        LEFT JOIN tariff t2 ON t2.id = irb2.tariff_id
        LEFT JOIN users u_bill2 ON u_bill2.id = irh2.billing_user_id
        LEFT JOIN users u_so2 ON u_so2.id = so2.user_created
        WHERE t2."name" ILIKE '%Evalu%'
          AND COALESCE(irb2.tariff_id, 0) NOT IN (58, 192, 198)
      )
      SELECT
        COALESCE(ej.ejecutivo_oi, fe.billing_user, 'sin_asignar') AS ejecutivo_oi,
        ch.campus AS campus_id,
        COUNT(*)::int AS evaluaciones
      FROM reservation r
      INNER JOIN clinic_history ch ON ch.id = r.patient_id
      LEFT JOIN ejecutivo ej ON ej.id_clinic_history = ch.id
      LEFT JOIN facturador_eval fe ON fe.id_clinic_history = ch.id
      WHERE r.state <> 0
        AND r.tariff_id IN (
          SELECT t3.id FROM tariff t3 WHERE t3."name" ILIKE '%Evalu%'
            AND COALESCE(t3.id, 0) NOT IN (58, 192, 198)
        )
        AND r.date >= $1::date
        AND r.date <= $2::date
        ${campusFilter}
      GROUP BY COALESCE(ej.ejecutivo_oi, fe.billing_user, 'sin_asignar'), ch.campus
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

  /**
   * Atribución OI: quien facturó en invoice (billing_user) tiene prioridad;
   * si no hay facturador, usa ejecutivo OI del paciente.
   */
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
      const facturador = String(row.facturador_username ?? '').trim().toLowerCase();
      const ejecutivoOi = String(row.ejecutivo_oi ?? '').trim().toLowerCase();
      const attrib = facturador
        || (ejecutivoOi && ejecutivoOi !== 'sin_asignar' ? ejecutivoOi : '');
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
      `OI invoice ${year}-${month}: ${factRows.length} líneas factura, ${evalRows.length} grupos eval, ${map.size} ejecutivas`,
    );
    return {
      map,
      factRowCount: factRows.length,
      evalGroupCount: evalRows.length,
      source: 'sv-invoice-db',
    };
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
