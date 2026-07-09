import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Vencimiento de cashback referidos (default 3 meses desde acreditación).
 */
export class ReferralCashbackExpiration1749530100000 implements MigrationInterface {
  name = 'ReferralCashbackExpiration1749530100000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE referral_cashback_config
        ADD COLUMN IF NOT EXISTS expiration_months INTEGER NOT NULL DEFAULT 3
    `);

    await queryRunner.query(`
      COMMENT ON COLUMN referral_cashback_config.expiration_months IS
        'Meses de vigencia del saldo acreditado; si no se usa, expira.'
    `);

    await queryRunner.query(`
      ALTER TABLE referral_cashback_ledger
        ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ NULL
    `);

    await queryRunner.query(`
      ALTER TABLE referral_cashback_ledger
        DROP CONSTRAINT IF EXISTS referral_cashback_ledger_entry_type_check
    `);

    await queryRunner.query(`
      ALTER TABLE referral_cashback_ledger
        ADD CONSTRAINT referral_cashback_ledger_entry_type_check
        CHECK (entry_type IN ('EARNED', 'USED', 'ADJUSTMENT', 'EXPIRED'))
    `);

    await queryRunner.query(`
      UPDATE referral_cashback_ledger
      SET expires_at = created_at + INTERVAL '3 months'
      WHERE entry_type = 'EARNED' AND expires_at IS NULL
    `);

    await queryRunner.query(`
      UPDATE referral_cashback_ledger
      SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('remainingAmount', amount)
      WHERE entry_type = 'EARNED'
        AND (metadata IS NULL OR metadata->>'remainingAmount' IS NULL)
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_referral_cashback_ledger_expires
        ON referral_cashback_ledger (balance_id, expires_at)
        WHERE entry_type = 'EARNED' AND expires_at IS NOT NULL
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_referral_cashback_ledger_expires`);
    await queryRunner.query(`
      ALTER TABLE referral_cashback_ledger
        DROP CONSTRAINT IF EXISTS referral_cashback_ledger_entry_type_check
    `);
    await queryRunner.query(`
      ALTER TABLE referral_cashback_ledger
        ADD CONSTRAINT referral_cashback_ledger_entry_type_check
        CHECK (entry_type IN ('EARNED', 'USED', 'ADJUSTMENT'))
    `);
    await queryRunner.query(`
      ALTER TABLE referral_cashback_ledger DROP COLUMN IF EXISTS expires_at
    `);
    await queryRunner.query(`
      ALTER TABLE referral_cashback_config DROP COLUMN IF EXISTS expiration_months
    `);
  }
}
