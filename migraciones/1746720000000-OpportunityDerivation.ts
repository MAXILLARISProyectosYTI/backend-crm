import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Derivación OFM/APNEA → OI.
 * - Nueva tabla opportunity_derivation: registra a qué ejecutivo OI fue asignada la derivación.
 * - Nueva columna c_derived_to_oi en opportunity: flag de acceso rápido desde el frontend.
 */
export class OpportunityDerivation1746720000000 implements MigrationInterface {
  name = 'OpportunityDerivation1746720000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS opportunity_derivation (
        id               SERIAL PRIMARY KEY,
        opportunity_id   VARCHAR(17)  NOT NULL,
        derived_to       VARCHAR(10)  NOT NULL DEFAULT 'OI',
        assigned_user_id VARCHAR(17)  NOT NULL,
        campus_id        INTEGER,
        created_by_id    VARCHAR(17),
        status           VARCHAR(20)  NOT NULL DEFAULT 'active',
        created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_opportunity_derivation_opportunity UNIQUE (opportunity_id)
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_opportunity_derivation_opportunity_id
        ON opportunity_derivation (opportunity_id)
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_opportunity_derivation_assigned_user
        ON opportunity_derivation (assigned_user_id)
    `);

    await queryRunner.query(`
      ALTER TABLE opportunity
        ADD COLUMN IF NOT EXISTS c_derived_to_oi BOOLEAN NOT NULL DEFAULT FALSE
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE opportunity DROP COLUMN IF EXISTS c_derived_to_oi`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_opportunity_derivation_assigned_user`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_opportunity_derivation_opportunity_id`);
    await queryRunner.query(`DROP TABLE IF EXISTS opportunity_derivation`);
  }
}
