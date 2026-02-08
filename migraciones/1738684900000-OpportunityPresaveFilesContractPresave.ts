import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Tablas de documentación: opportunity_presave, files, contract_presave.
 * documentation/opportunity_presave.sql, files.sql, contract_presave.sql
 */
export class OpportunityPresaveFilesContractPresave1738684900000
  implements MigrationInterface
{
  name = 'OpportunityPresaveFilesContractPresave1738684900000';

  async up(queryRunner: QueryRunner): Promise<void> {
    // —— opportunity_presave ——
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS opportunity_presave (
        id SERIAL PRIMARY KEY,
        espo_id VARCHAR(255) NOT NULL UNIQUE,
        document_number VARCHAR(20),
        name VARCHAR(255),
        last_name_father VARCHAR(255),
        last_name_mother VARCHAR(255),
        cellphone VARCHAR(20),
        email VARCHAR(255),
        address VARCHAR(500),
        attorney VARCHAR(255),
        invoise_type_document VARCHAR(50),
        invoise_num_document VARCHAR(50),
        doctor_id INTEGER,
        business_line_id INTEGER,
        specialty_id INTEGER,
        tariff_id INTEGER,
        fecha_abono DATE,
        metodo_pago INTEGER,
        cuenta_bancaria INTEGER,
        numero_operacion VARCHAR(100),
        moneda VARCHAR(10),
        monto_pago DECIMAL(12,2),
        description TEXT,
        vouchers_data TEXT,
        clinic_history VARCHAR(50),
        clinic_history_id INTEGER,
        payment_type VARCHAR(50),
        company_type VARCHAR(50),
        exchange_rate DECIMAL(12,4),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_opportunity_presave_espo_id ON opportunity_presave(espo_id)`,
    );
    await queryRunner.query(
      `COMMENT ON TABLE opportunity_presave IS 'Almacena todos los datos del cliente y facturación preguardados'`,
    );
    await queryRunner.query(`
      ALTER TABLE opportunity ADD COLUMN IF NOT EXISTS is_presaved BOOLEAN DEFAULT false
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_opportunity_is_presaved ON opportunity(is_presaved)`,
    );

    // —— files ——
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS files (
        id SERIAL PRIMARY KEY,
        parent_id VARCHAR(255) NOT NULL,
        parent_type VARCHAR(100) NOT NULL,
        file_name VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT now(),
        file_content BYTEA
      )
    `);

    // —— contract_presave ——
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS contract_presave (
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
        descuento_campana_activo BOOLEAN DEFAULT FALSE,
        descuento_hoy_activo BOOLEAN DEFAULT FALSE,
        descuento_discrecional_activo BOOLEAN DEFAULT FALSE,
        tipo_descuento_discrecional VARCHAR(50),
        monto_descuento_discrecional DECIMAL(12, 2) DEFAULT 0,
        descuento_gerencia_solicitado BOOLEAN DEFAULT FALSE,
        monto_descuento_gerencia DECIMAL(12, 2) DEFAULT 0,
        payment_schedule_editable TEXT,
        registered_payments TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_contract_presave_quotation_id ON contract_presave(quotation_id)`,
    );
    await queryRunner.query(
      `COMMENT ON TABLE contract_presave IS 'Tabla para guardar datos pre-guardados del contrato mientras el usuario completa el formulario'`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS contract_presave`);
    await queryRunner.query(`DROP TABLE IF EXISTS files`);
    await queryRunner.query(`DROP TABLE IF EXISTS opportunity_presave`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_opportunity_is_presaved`);
    await queryRunner.query(
      `ALTER TABLE opportunity DROP COLUMN IF EXISTS is_presaved`,
    );
  }
}
