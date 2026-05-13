import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSourceToDerivation1747526400000 implements MigrationInterface {
  name = 'AddSourceToDerivation1747526400000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE opportunity_derivation
        ADD COLUMN IF NOT EXISTS source VARCHAR(20) NULL
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE opportunity_derivation
        DROP COLUMN IF EXISTS source
    `);
  }
}
