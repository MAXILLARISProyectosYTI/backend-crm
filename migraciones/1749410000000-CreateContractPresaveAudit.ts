import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateContractPresaveAudit1749410000000
  implements MigrationInterface
{
  name = 'CreateContractPresaveAudit1749410000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS contract_presave_audit (
        id SERIAL PRIMARY KEY,
        contract_presave_id INT NULL,
        quotation_id INT NOT NULL,
        clinic_history_id INT NULL,
        action VARCHAR(20) NOT NULL DEFAULT 'save',
        save_source VARCHAR(50) NULL,
        saved_by_user_id VARCHAR(100) NULL,
        contract_type VARCHAR(50) NULL,
        payment_method VARCHAR(20) NULL,
        payments_count INT NULL,
        contract_amount NUMERIC(12, 2) NULL,
        schedule_total_monto_final NUMERIC(12, 2) NULL,
        schedule_total_descuento NUMERIC(12, 2) NULL,
        payment_schedule_editable TEXT NULL,
        registered_payments TEXT NULL,
        payload_json TEXT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_contract_presave_audit_quotation_id
      ON contract_presave_audit (quotation_id)
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_contract_presave_audit_created_at
      ON contract_presave_audit (created_at DESC)
    `);

    await queryRunner.query(`
      COMMENT ON TABLE contract_presave_audit IS
      'Historial append-only de cada guardado del presave de contrato (cerradoras).'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS contract_presave_audit`);
  }
}
