import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Registro de autorizaciones de gerencia para bajar el total OFM dentro de la banda (-100 USD).
 */
export class ContractGerenciaBandUsage1749580000000 implements MigrationInterface {
  name = 'ContractGerenciaBandUsage1749580000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS contract_gerencia_band_usage (
        id SERIAL PRIMARY KEY,
        requested_by_user_id VARCHAR(17) NOT NULL,
        approver_user_id VARCHAR(17) NOT NULL,
        quotation_id INTEGER,
        contract_type VARCHAR(50) NOT NULL,
        payment_method VARCHAR(30) NOT NULL,
        total_amount NUMERIC(12, 2) NOT NULL,
        created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_gerencia_band_usage_user_month
        ON contract_gerencia_band_usage (requested_by_user_id, created_at);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS contract_gerencia_band_usage`);
  }
}
