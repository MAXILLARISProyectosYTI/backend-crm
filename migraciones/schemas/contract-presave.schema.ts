/**
 * Esquema de referencia: contract_presave
 * Fuente de verdad para DDL (sustituye documentation/contract_presave.sql).
 */

export const CONTRACT_PRESAVE_TABLE = 'contract_presave';

/** CREATE TABLE completo (instalaciones nuevas / referencia). */
export const CONTRACT_PRESAVE_CREATE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS ${CONTRACT_PRESAVE_TABLE} (
    id SERIAL PRIMARY KEY,
    quotation_id INT UNIQUE NOT NULL,
    clinic_history_id INT,
    tipo_documento_factura VARCHAR(10),
    nombre_factura VARCHAR(255),
    numero_documento_factura VARCHAR(20),
    contract_type VARCHAR(50),
    payment_method VARCHAR(20),
    payments_count INT,
    contract_duration_months INT,
    contract_date VARCHAR(10),
    fixed_payment_date VARCHAR(10),
    contract_amount NUMERIC(12, 2),
    descuento_campana_activo BOOLEAN DEFAULT FALSE,
    monto_descuento_campana NUMERIC(12, 2) DEFAULT 0,
    descuento_hoy_activo BOOLEAN DEFAULT FALSE,
    monto_descuento_hoy NUMERIC(12, 2) DEFAULT 0,
    descuento_discrecional_activo BOOLEAN DEFAULT FALSE,
    tipo_descuento_discrecional VARCHAR(50),
    monto_descuento_discrecional NUMERIC(12, 2) DEFAULT 0,
    descuento_gerencia_solicitado BOOLEAN DEFAULT FALSE,
    monto_descuento_gerencia NUMERIC(12, 2) DEFAULT 0,
    payment_schedule_editable TEXT,
    registered_payments TEXT,
    current_payment_form_data TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )
`;

export const CONTRACT_PRESAVE_INDEX_SQL = `
  CREATE INDEX IF NOT EXISTS idx_contract_presave_quotation_id
  ON ${CONTRACT_PRESAVE_TABLE} (quotation_id)
`;

export const CONTRACT_PRESAVE_COMMENT_SQL = `
  COMMENT ON TABLE ${CONTRACT_PRESAVE_TABLE} IS
  'Presave del contrato en cerradoras (quotation_id único)'
`;

/**
 * Columnas que pueden faltar en BD creadas con migraciones antiguas.
 * Cada entrada genera: ALTER TABLE ... ADD COLUMN IF NOT EXISTS ...
 */
export const CONTRACT_PRESAVE_ENSURE_COLUMNS: ReadonlyArray<{
  name: string;
  ddl: string;
}> = [
  { name: 'contract_date', ddl: 'VARCHAR(10) NULL' },
  { name: 'fixed_payment_date', ddl: 'VARCHAR(10) NULL' },
  { name: 'contract_amount', ddl: 'NUMERIC(12, 2) NULL' },
  { name: 'monto_descuento_campana', ddl: 'NUMERIC(12, 2) DEFAULT 0' },
  { name: 'monto_descuento_hoy', ddl: 'NUMERIC(12, 2) DEFAULT 0' },
  { name: 'current_payment_form_data', ddl: 'TEXT NULL' },
];

export function buildEnsureContractPresaveColumnsSql(): string[] {
  return CONTRACT_PRESAVE_ENSURE_COLUMNS.map(
    (col) =>
      `ALTER TABLE ${CONTRACT_PRESAVE_TABLE} ADD COLUMN IF NOT EXISTS ${col.name} ${col.ddl}`,
  );
}
