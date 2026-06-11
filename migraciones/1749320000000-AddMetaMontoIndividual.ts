import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMetaMontoIndividual1749320000000 implements MigrationInterface {
  name = 'AddMetaMontoIndividual1749320000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE commission_record
      ADD COLUMN IF NOT EXISTS meta_monto_individual DECIMAL(12,2)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE commission_record DROP COLUMN IF EXISTS meta_monto_individual`);
  }
}
