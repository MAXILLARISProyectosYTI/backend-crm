import { Client } from 'pg';

/** Cliente PostgreSQL → BD SV (invoice_result_*). Usa SV_DB_* del .env del CRM. */
export function createSvDbClient(): Client {
  return new Client({
    host: process.env.SV_DB_HOST || '161.132.211.235',
    port: parseInt(process.env.SV_DB_PORT || '5501', 10),
    user: process.env.SV_DB_USERNAME || 'desarrollador_dev_maxillaris',
    password: process.env.SV_DB_PASSWORD || 'hq75TCdbiJzhfr7lXt3w',
    database: process.env.SV_DB_DATABASE || 'sv_dev',
  });
}

/**
 * Facturación OI desde invoice_result_body (evaluaciones + plan de tratamiento).
 * Misma lógica que SV GET /facturacion-oi — sin depender de HTTP ni de SV backend levantado.
 */
export async function queryOiFacturacionFromSvDb(
  since: string,
  until: string,
  campusId?: number | null,
): Promise<Record<string, unknown>[]> {
  const client = createSvDbClient();
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
      irb.id                     AS invoice_body_id,
      irh.invoice_date::text      AS invoice_date,
      irb.payment_date::text      AS fecha_abono,
      irb.amount,
      c2.code                     AS moneda,
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
      END                         AS amount_pen,
      ch.campus                   AS campus_id,
      LOWER(TRIM(COALESCE(
        ej.ejecutivo_oi,
        u_bill.username,
        u_so.username,
        'sin_asignar'
      )))                         AS ejecutivo_oi,
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

/** Evaluaciones OI (reservas) — mismo criterio que SV GET /evaluaciones-oi */
export async function queryOiEvaluacionesFromSvDb(
  since: string,
  until: string,
  campusId?: number | null,
): Promise<Record<string, unknown>[]> {
  const client = createSvDbClient();
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
      SELECT DISTINCT ON (so2.idclinichistory)
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
