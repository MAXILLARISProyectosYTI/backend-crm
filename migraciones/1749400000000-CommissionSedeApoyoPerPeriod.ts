import { MigrationInterface, QueryRunner } from 'typeorm';

/** Apoyo entre sedes cerradoras: configuración por período (mes). */
export class CommissionSedeApoyoPerPeriod1749400000000 implements MigrationInterface {
  name = 'CommissionSedeApoyoPerPeriod1749400000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE commission_cerradora_sede_apoyo
        ADD COLUMN IF NOT EXISTS period_id INTEGER REFERENCES commission_period(id) ON DELETE CASCADE
    `);
    await queryRunner.query(`
      ALTER TABLE commission_cerradora_sede_apoyo
        DROP CONSTRAINT IF EXISTS uq_cerradora_sede_apoyo
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_cerradora_sede_apoyo_period
        ON commission_cerradora_sede_apoyo (period_id, user_id, campus_id)
        WHERE period_id IS NOT NULL
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_cerradora_sede_apoyo_legacy
        ON commission_cerradora_sede_apoyo (user_id, campus_id)
        WHERE period_id IS NULL
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_cerradora_sede_apoyo_period
        ON commission_cerradora_sede_apoyo (period_id)
        WHERE activo = TRUE
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_cerradora_sede_apoyo_period`);
    await queryRunner.query(`DROP INDEX IF EXISTS uq_cerradora_sede_apoyo_legacy`);
    await queryRunner.query(`DROP INDEX IF EXISTS uq_cerradora_sede_apoyo_period`);
    await queryRunner.query(`
      ALTER TABLE commission_cerradora_sede_apoyo DROP COLUMN IF EXISTS period_id
    `);
    await queryRunner.query(`
      ALTER TABLE commission_cerradora_sede_apoyo
        ADD CONSTRAINT uq_cerradora_sede_apoyo UNIQUE (user_id, campus_id)
    `);
  }
}
