import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Raíz del árbol de referidos (titular del núcleo familiar).
 *
 * - c_primary_opportunity_id     → referidor directo (puede ser REF elegible, ej. Megumi)
 * - c_referral_root_opportunity_id → titular raíz del núcleo (ej. Loki), trazabilidad y contactId
 */
export class OpportunityReferralRoot1749540000000 implements MigrationInterface {
  name = 'OpportunityReferralRoot1749540000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE opportunity
        ADD COLUMN IF NOT EXISTS c_referral_root_opportunity_id VARCHAR(17) NULL
    `);

    await queryRunner.query(`
      COMMENT ON COLUMN opportunity.c_primary_opportunity_id IS
        'Referidor directo (opp inmediata que trajo a este paciente). Puede ser REF si ya pagó OFM 100%% y está habilitado.'
    `);

    await queryRunner.query(`
      COMMENT ON COLUMN opportunity.c_referral_root_opportunity_id IS
        'Titular raíz del núcleo familiar (opp no-REF). Mismo contactId para toda la familia; trazabilidad de cadena.'
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_opportunity_referral_root
        ON opportunity (c_referral_root_opportunity_id)
        WHERE c_referral_root_opportunity_id IS NOT NULL
    `);

    // Backfill: raíz = titular no-REF (un salto o dos si ya hubiera cadena)
    await queryRunner.query(`
      UPDATE opportunity child
      SET c_referral_root_opportunity_id = CASE
        WHEN parent.c_is_referral_creation IS DISTINCT FROM true THEN parent.id
        WHEN gp.id IS NOT NULL AND gp.c_is_referral_creation IS DISTINCT FROM true THEN gp.id
        ELSE parent.c_primary_opportunity_id
      END
      FROM opportunity parent
      LEFT JOIN opportunity gp ON gp.id = parent.c_primary_opportunity_id AND gp.deleted = false
      WHERE child.c_is_referral_creation = true
        AND child.c_primary_opportunity_id = parent.id
        AND child.deleted = false
        AND child.c_referral_root_opportunity_id IS NULL
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_opportunity_referral_root`);
    await queryRunner.query(`
      ALTER TABLE opportunity
        DROP COLUMN IF EXISTS c_referral_root_opportunity_id
    `);
  }
}
