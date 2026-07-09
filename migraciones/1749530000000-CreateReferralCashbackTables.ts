import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Cashback por referidos (punto 11 acuerdos marketing).
 * Saldo por paciente/moneda + ledger de movimientos + % configurable (default 10%).
 */
export class CreateReferralCashbackTables1749530000000 implements MigrationInterface {
  name = 'CreateReferralCashbackTables1749530000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE opportunity
        ADD COLUMN IF NOT EXISTS c_primary_opportunity_id VARCHAR(17) NULL
    `);

    await queryRunner.query(`
      COMMENT ON COLUMN opportunity.c_primary_opportunity_id IS
        'Oportunidad principal (referidor) cuando c_is_referral_creation = true.'
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_opportunity_primary_referral
        ON opportunity (c_primary_opportunity_id)
        WHERE c_primary_opportunity_id IS NOT NULL
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS referral_cashback_config (
        id SERIAL PRIMARY KEY,
        default_percent NUMERIC(6, 4) NOT NULL DEFAULT 10.0000,
        active BOOLEAN NOT NULL DEFAULT true,
        notes TEXT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await queryRunner.query(`
      INSERT INTO referral_cashback_config (default_percent, notes)
      SELECT 10.0000, 'Cashback referidos OFM al contado — default 10%'
      WHERE NOT EXISTS (SELECT 1 FROM referral_cashback_config LIMIT 1)
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS referral_cashback_balance (
        id SERIAL PRIMARY KEY,
        patient_id INTEGER NOT NULL,
        currency VARCHAR(3) NOT NULL CHECK (currency IN ('PEN', 'USD')),
        available_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
        total_earned NUMERIC(14, 2) NOT NULL DEFAULT 0,
        total_used NUMERIC(14, 2) NOT NULL DEFAULT 0,
        referrer_opportunity_id VARCHAR(17) NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_referral_cashback_balance_patient_currency
          UNIQUE (patient_id, currency)
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_referral_cashback_balance_patient
        ON referral_cashback_balance (patient_id)
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS referral_cashback_ledger (
        id SERIAL PRIMARY KEY,
        balance_id INTEGER NOT NULL REFERENCES referral_cashback_balance (id),
        entry_type VARCHAR(20) NOT NULL CHECK (entry_type IN ('EARNED', 'USED', 'ADJUSTMENT')),
        amount NUMERIC(14, 2) NOT NULL,
        currency VARCHAR(3) NOT NULL CHECK (currency IN ('PEN', 'USD')),
        percent_applied NUMERIC(6, 4) NULL,
        referrer_patient_id INTEGER NULL,
        referred_patient_id INTEGER NULL,
        referrer_opportunity_id VARCHAR(17) NULL,
        referred_opportunity_id VARCHAR(17) NULL,
        source_irb_id INTEGER NULL,
        source_contract_id INTEGER NULL,
        apply_context VARCHAR(80) NULL,
        metadata JSONB NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_referral_cashback_ledger_source_irb
        ON referral_cashback_ledger (source_irb_id)
        WHERE source_irb_id IS NOT NULL AND entry_type = 'EARNED'
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_referral_cashback_ledger_balance
        ON referral_cashback_ledger (balance_id, created_at DESC)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS referral_cashback_ledger`);
    await queryRunner.query(`DROP TABLE IF EXISTS referral_cashback_balance`);
    await queryRunner.query(`DROP TABLE IF EXISTS referral_cashback_config`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_opportunity_primary_referral`);
    await queryRunner.query(`
      ALTER TABLE opportunity DROP COLUMN IF EXISTS c_primary_opportunity_id
    `);
  }
}
