import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migración consolidada que replica los cambios de:
 * - 2025-02-03_campus_team.sql
 * - 2025-02-03_opportunity_campus_metadata.sql
 * - 2025-02-04_assignment_queue_state.sql
 * - 2025-02-04_opportunity_campus_atencion.sql
 * - documentation/opportunity_presave.sql
 * - documentation/files.sql
 * - documentation/contract_presave.sql
 */
export class ConsolidateMigraciones1738684800000 implements MigrationInterface {
  name = 'ConsolidateMigraciones1738684800000';

  async up(queryRunner: QueryRunner): Promise<void> {
    // —— 1. campus_team: sede (campus) -> equipo ——
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS campus_team (
        campus_id integer NOT NULL,
        team_id   varchar(17) NOT NULL,
        PRIMARY KEY (campus_id, team_id)
      )
    `);
    await queryRunner.query(`
      COMMENT ON TABLE campus_team IS 'Equipos que atienden cada sede (campus externo) para cola de autoasignación'
    `);
    await queryRunner.query(`
      INSERT INTO campus_team (campus_id, team_id) VALUES
        (1, '68a9d71d1cfbeae93'),
        (1, '68a9d710d5a90f5f4'),
        (1, '68a60f243afa8a87f'),
        (1, '68b75568eb21093ef'),
        (1, '68b755a5ae3790763'),
        (1, '68b7559436bfde575'),
        (1, '68a9dfbb0e3b13e33')
      ON CONFLICT (campus_id, team_id) DO NOTHING
    `);

    // —— 2. opportunity: c_campus_id y c_metadata ——
    await queryRunner.query(`
      ALTER TABLE opportunity
        ADD COLUMN IF NOT EXISTS c_campus_id integer NULL DEFAULT 1,
        ADD COLUMN IF NOT EXISTS c_metadata text NULL DEFAULT '{"campusId":1,"campusName":"Lima","companyId":1,"companyCode":"L","companyName":"Lima"}'
    `);
    await queryRunner.query(`
      UPDATE opportunity SET c_campus_id = 1 WHERE c_campus_id IS NULL
    `);
    await queryRunner.query(`
      UPDATE opportunity SET c_metadata = '{"campusId":1,"campusName":"Lima","companyId":1,"companyCode":"L","companyName":"Lima"}' WHERE c_metadata IS NULL
    `);
    await queryRunner.query(`
      COMMENT ON COLUMN opportunity.c_campus_id IS 'Sede (campus) para cola de autoasignación por sede'
    `);
    await queryRunner.query(`
      COMMENT ON COLUMN opportunity.c_metadata IS 'Metadata JSON: empresa/sede (campusId, campusName, companyId, companyCode, companyName)'
    `);

    // —— 3. assignment_queue_state ——
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS assignment_queue_state (
        campus_id             integer NOT NULL,
        sub_campaign_id       varchar(17) NOT NULL,
        last_assigned_user_id varchar(17) NOT NULL,
        last_assigned_at      timestamp with time zone NOT NULL DEFAULT (now() AT TIME ZONE 'UTC'),
        last_opportunity_id   varchar(17) NULL,
        updated_at            timestamp with time zone NOT NULL DEFAULT (now() AT TIME ZONE 'UTC'),
        PRIMARY KEY (campus_id, sub_campaign_id)
      )
    `);
    await queryRunner.query(`
      COMMENT ON TABLE assignment_queue_state IS 'Estado de la cola de asignación: último usuario asignado por sede y subcampaña. Se actualiza en cada asignación (crear/reasignar).'
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_assignment_queue_state_campus
        ON assignment_queue_state (campus_id)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_assignment_queue_state_sub_campaign
        ON assignment_queue_state (sub_campaign_id)
    `);
    await queryRunner.query(`
      INSERT INTO assignment_queue_state (
        campus_id,
        sub_campaign_id,
        last_assigned_user_id,
        last_assigned_at,
        last_opportunity_id,
        updated_at
      )
      SELECT
        o.c_campus_id,
        o.c_sub_campaign_id,
        o.assigned_user_id,
        o.created_at,
        o.id,
        o.created_at
      FROM (
        SELECT
          o2.c_campus_id,
          o2.c_sub_campaign_id,
          o2.assigned_user_id,
          o2.created_at,
          o2.id,
          ROW_NUMBER() OVER (
            PARTITION BY o2.c_campus_id, o2.c_sub_campaign_id
            ORDER BY o2.created_at DESC, o2.id DESC
          ) AS rn
        FROM opportunity o2
        WHERE o2.assigned_user_id IS NOT NULL
          AND o2.c_sub_campaign_id IS NOT NULL
          AND o2.c_campus_id IS NOT NULL
          AND o2.deleted = false
          AND o2.name NOT ILIKE '%REF-%'
      ) o
      WHERE o.rn = 1
      ON CONFLICT (campus_id, sub_campaign_id) DO NOTHING
    `);

    // —— 4. opportunity: c_campus_atencion_id ——
    await queryRunner.query(`
      ALTER TABLE opportunity
        ADD COLUMN IF NOT EXISTS c_campus_atencion_id integer NULL
    `);
    await queryRunner.query(`
      COMMENT ON COLUMN opportunity.c_campus_atencion_id IS 'Sede de atención (campus de atención) donde se atiende al paciente. NULL por defecto.'
    `);

    // —— 5. opportunity_presave (documentation/opportunity_presave.sql) ——
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
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_opportunity_presave_espo_id ON opportunity_presave(espo_id)`);
    await queryRunner.query(`COMMENT ON TABLE opportunity_presave IS 'Almacena todos los datos del cliente y facturación preguardados'`);
    await queryRunner.query(`
      ALTER TABLE opportunity ADD COLUMN IF NOT EXISTS is_presaved BOOLEAN DEFAULT false
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_opportunity_is_presaved ON opportunity(is_presaved)`);

    // —— 6. files (documentation/files.sql) ——
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

    // —— 7. contract_presave (documentation/contract_presave.sql) ——
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
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_contract_presave_quotation_id ON contract_presave(quotation_id)`);
    await queryRunner.query(`COMMENT ON TABLE contract_presave IS 'Tabla para guardar datos pre-guardados del contrato mientras el usuario completa el formulario'`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS contract_presave`);
    await queryRunner.query(`DROP TABLE IF EXISTS files`);
    await queryRunner.query(`DROP TABLE IF EXISTS opportunity_presave`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_opportunity_is_presaved`);
    await queryRunner.query(`ALTER TABLE opportunity DROP COLUMN IF EXISTS is_presaved`);
    await queryRunner.query(`ALTER TABLE opportunity DROP COLUMN IF EXISTS c_campus_atencion_id`);
    await queryRunner.query(`DROP TABLE IF EXISTS assignment_queue_state`);
    await queryRunner.query(`ALTER TABLE opportunity DROP COLUMN IF EXISTS c_campus_id`);
    await queryRunner.query(`ALTER TABLE opportunity DROP COLUMN IF EXISTS c_metadata`);
    await queryRunner.query(`DROP TABLE IF EXISTS campus_team`);
  }
}
