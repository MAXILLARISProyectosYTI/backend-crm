import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Override manual de atribución de comisión por factura (Call Center / OI / Controles).
 * Permite al admin reasignar a quién cuenta una factura específica cuando quien la
 * facturó (billing_user_id en SV) no es quien realmente hizo la venta — sin cambiar
 * la lógica automática global (evita inflar/mover números de otras ejecutivas).
 */
export class CreateCommissionInvoiceOverride1749580000000 implements MigrationInterface {
  name = 'CreateCommissionInvoiceOverride1749580000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS commission_invoice_override (
        id SERIAL PRIMARY KEY,
        area VARCHAR(20) NOT NULL CHECK (area IN ('CALL_CENTER', 'OI', 'CONTROLES')),
        invoice_id INTEGER NOT NULL,
        assigned_user_login VARCHAR(100) NOT NULL,
        assigned_user_name VARCHAR(200) NULL,
        original_biller_login VARCHAR(100) NULL,
        note TEXT NULL,
        created_by_id VARCHAR(17) NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_commission_invoice_override UNIQUE (area, invoice_id)
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_commission_invoice_override_area
        ON commission_invoice_override (area)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS commission_invoice_override`);
  }
}
