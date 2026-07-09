/**
 * Clasificación de líneas contract_detail OFM — alineada con SV
 * (contract-management.service, service.order.v2.service).
 *
 * Usa SPLIT_PART sobre la primera palabra para tolerar variaciones menores
 * y coincidir con cómo SV nombra Moldes / Inicial / Cuota N.
 */

const desc = (alias: string) => `${alias}.description`;

/** Línea Moldes (ej. "Moldes"). */
export function ofmDetailIsMoldes(alias = 'cd'): string {
  return `LOWER(SPLIT_PART(TRIM(${desc(alias)}), ' ', 1)) = 'moldes'`;
}

/** Línea Inicial o Cuota Inicial del pricing. */
export function ofmDetailIsInicial(alias = 'cd'): string {
  return `(
    LOWER(SPLIT_PART(TRIM(${desc(alias)}), ' ', 1)) = 'inicial'
    OR LOWER(TRIM(${desc(alias)})) LIKE 'cuota inicial%'
  )`;
}

/** Cuotas 1..N — excluye "Cuota Inicial". */
export function ofmDetailIsCuotaInstallment(alias = 'cd'): string {
  return `(
    LOWER(SPLIT_PART(TRIM(${desc(alias)}), ' ', 1)) = 'cuota'
    AND NOT (LOWER(TRIM(${desc(alias)})) LIKE 'cuota inicial%')
  )`;
}

/** Línea de cierre al contado (aparece al cambiar cuotas → contado). */
export function ofmDetailIsUnicoPago(alias = 'cd'): string {
  return `LOWER(TRIM(${desc(alias)})) LIKE 'único pago%' OR LOWER(TRIM(${desc(alias)})) LIKE 'unico pago%'`;
}

/** Monto IRB en USD (PEN / TC o USD directo). coin.id: 1=PEN, 2=USD */
export function ofmIrbAmountUsdExpr(irbAlias = 'irb', erAlias = 'er'): string {
  return `(
    CASE
      WHEN ${irbAlias}.id_currency = 2 THEN ${irbAlias}.amount
      WHEN ${erAlias}.value > 0 THEN ROUND((${irbAlias}.amount / ${erAlias}.value)::numeric, 2)
      ELSE 0
    END
  )`;
}

/**
 * Incluir facturas de "Único pago" en el primer tramo cuando el contrato volvió a cuotas
 * y aún tiene cuotas pendientes (pago contado intermedio que completa Moldes+Inicial).
 */
export function ofmUnicoPagoCountsAsPrimerTramoSql(
  contractIdExpr: string,
  cdAlias = 'cd',
): string {
  return `(
    ${ofmDetailIsUnicoPago(cdAlias)}
    AND EXISTS (
      SELECT 1
      FROM contract c_u
      INNER JOIN contract_structure cs_u ON cs_u.id = c_u.contract_structure_id AND cs_u.state = 1
      WHERE c_u.id = ${contractIdExpr}
        AND c_u.state = 1
        AND cs_u.treatment_code = 'OFM_CUOTAS'
    )
    AND EXISTS (
      SELECT 1
      FROM contract_detail cd_p
      WHERE cd_p.idcontract = ${contractIdExpr}
        AND COALESCE(cd_p.state, 1) = 1
        AND ${ofmDetailIsCuotaInstallment('cd_p')}
        AND ROUND(COALESCE(cd_p.balance, 0)::numeric, 2) > 0.01
    )
  )`;
}

/** Primer pago en modalidad cuotas: Moldes + Inicial. */
export function ofmDetailIsPrimerPago(alias = 'cd'): string {
  return `(${ofmDetailIsMoldes(alias)} OR ${ofmDetailIsInicial(alias)})`;
}

/** Para desc_norm en CTEs que ya tienen la columna normalizada. */
export const OFM_DESC_NORM_IS_MOLDES = "desc_norm = 'moldes'";
export const OFM_DESC_NORM_IS_INICIAL = "(desc_norm = 'inicial' OR desc_norm LIKE 'cuota inicial%')";
export const OFM_DESC_NORM_IS_CUOTA = "(desc_norm LIKE 'cuota%' AND desc_norm NOT LIKE 'cuota inicial%')";
export const OFM_DESC_NORM_IS_PRIMER_PAGO = `(${OFM_DESC_NORM_IS_MOLDES} OR ${OFM_DESC_NORM_IS_INICIAL})`;
export const OFM_DESC_NORM_IS_UNICO_PAGO = "(desc_norm LIKE 'único pago%' OR desc_norm LIKE 'unico pago%')";

/**
 * Estado del primer pago Moldes + Inicial.
 * Por defecto solo mira detalles activos (state=1).
 * Con `includeInactive=true` también cuenta líneas desactivadas tras cambio
 * de modalidad (cuotas→contado desactiva "Inicial" y crea "Único pago").
 */
export function ofmPrimerPagoStatusSelect(
  contractFilter?: string,
  options?: { includeInactive?: boolean },
): string {
  const includeInactive = options?.includeInactive === true;
  const stateOk = (alias: string) =>
    includeInactive ? 'TRUE' : `COALESCE(${alias}.state, 1) = 1`;
  const where = contractFilter ? `WHERE ${contractFilter}` : '';
  return `
    SELECT
      c.id AS contract_id,
      EXISTS (
        SELECT 1 FROM contract_detail cd
        WHERE cd.idcontract = c.id
          AND ${stateOk('cd')}
          AND ${ofmDetailIsMoldes('cd')}
      ) AS has_moldes,
      EXISTS (
        SELECT 1 FROM contract_detail cd
        WHERE cd.idcontract = c.id
          AND ${stateOk('cd')}
          AND ${ofmDetailIsInicial('cd')}
      ) AS has_inicial,
      (
        EXISTS (
          SELECT 1 FROM contract_detail cd
          WHERE cd.idcontract = c.id
            AND ${stateOk('cd')}
            AND ${ofmDetailIsMoldes('cd')}
        )
        AND NOT EXISTS (
          SELECT 1 FROM contract_detail cd
          WHERE cd.idcontract = c.id
            AND ${stateOk('cd')}
            AND ${ofmDetailIsMoldes('cd')}
            AND ROUND(COALESCE(cd.balance, 0)::numeric, 2) > 0.01
        )
      ) AS moldes_complete,
      (
        EXISTS (
          SELECT 1 FROM contract_detail cd
          WHERE cd.idcontract = c.id
            AND ${stateOk('cd')}
            AND ${ofmDetailIsInicial('cd')}
        )
        AND NOT EXISTS (
          SELECT 1 FROM contract_detail cd
          WHERE cd.idcontract = c.id
            AND ${stateOk('cd')}
            AND ${ofmDetailIsInicial('cd')}
            AND ROUND(COALESCE(cd.balance, 0)::numeric, 2) > 0.01
        )
      ) AS inicial_complete
    FROM contract c
    ${where}
  `;
}

/** Alias corto para un solo contrato (subquery escalar). */
export function ofmPrimerPagoStatusCte(
  contractIdExpr: string,
  options?: { includeInactive?: boolean },
): string {
  return ofmPrimerPagoStatusSelect(`c.id = ${contractIdExpr}`, options);
}

/**
 * Facturación histórica Moldes + Inicial (incluye detalles state=0).
 * Sobrevive al cambio de modalidad que desactiva "Inicial".
 */
export function ofmHistoricalPrimerPagoInvoicedSelect(contractIdExpr: string): string {
  const primerTramoLine = `(
    ${ofmDetailIsPrimerPago('cd')}
    OR ${ofmUnicoPagoCountsAsPrimerTramoSql(contractIdExpr, 'cd')}
  )`;
  return `
    SELECT
      COALESCE(SUM(irb.amount) FILTER (
        WHERE ${ofmDetailIsPrimerPago('cd')}
      ), 0)::numeric AS primer_pago_invoiced,
      COALESCE(SUM(${ofmIrbAmountUsdExpr('irb', 'er')}) FILTER (
        WHERE ${primerTramoLine}
      ), 0)::numeric AS primer_pago_invoiced_usd,
      COALESCE(SUM(${ofmIrbAmountUsdExpr('irb', 'er')}) FILTER (
        WHERE ${ofmDetailIsMoldes('cd')}
      ), 0)::numeric AS moldes_invoiced_usd,
      COALESCE(SUM(${ofmIrbAmountUsdExpr('irb', 'er')}) FILTER (
        WHERE ${ofmDetailIsInicial('cd')}
      ), 0)::numeric AS inicial_invoiced_usd,
      COALESCE(SUM(${ofmIrbAmountUsdExpr('irb', 'er')}) FILTER (
        WHERE ${ofmUnicoPagoCountsAsPrimerTramoSql(contractIdExpr, 'cd')}
      ), 0)::numeric AS unico_pago_invoiced_usd,
      COALESCE(SUM(irb.amount) FILTER (
        WHERE ${ofmDetailIsMoldes('cd')}
      ), 0)::numeric AS moldes_invoiced,
      COALESCE(SUM(irb.amount) FILTER (
        WHERE ${ofmDetailIsInicial('cd')}
      ), 0)::numeric AS inicial_invoiced,
      COALESCE(SUM(irb.amount) FILTER (
        WHERE ${ofmDetailIsCuotaInstallment('cd')}
      ), 0)::numeric AS remainder_invoiced,
      COALESCE(SUM(irb.amount), 0)::numeric AS total_invoiced
    FROM contract_detail cd
    INNER JOIN service_order_payment_detail sopd ON sopd.idcontractdetail = cd.id
    INNER JOIN invoice_result_body irb ON irb.service_order_payment_detail_id = sopd.id
      AND irb.amount > 0
    INNER JOIN invoice_result_head irh ON irh.id = irb.idinvoice_result_head
      AND irh.status_invoice = 1
      AND COALESCE(irh.credit_memo_state, false) = false
    LEFT JOIN exchange_rate er ON er.id = irb.exchange_rate_id
    WHERE cd.idcontract = ${contractIdExpr}
  `;
}

/** Resuelve modalidad OFM: treatment_code tiene prioridad sobre contract_type. */
export function resolveOfmModality(
  treatmentCode: string,
  contractType: string,
): { isCuotas: boolean; isContado: boolean } {
  const code = treatmentCode.toUpperCase();
  const type = contractType.toUpperCase();
  if (code === 'OFM_CUOTAS') {
    return { isCuotas: true, isContado: false };
  }
  if (code === 'OFM_CONTADO') {
    return { isCuotas: false, isContado: true };
  }
  if (type === 'CUOTAS') {
    return { isCuotas: true, isContado: false };
  }
  if (type === 'CONTADO') {
    return { isCuotas: false, isContado: true };
  }
  return { isCuotas: false, isContado: false };
}
