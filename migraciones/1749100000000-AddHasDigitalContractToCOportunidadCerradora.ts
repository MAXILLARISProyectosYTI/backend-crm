import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddHasDigitalContractToCOportunidadCerradora1749100000000
  implements MigrationInterface
{
  name = 'AddHasDigitalContractToCOportunidadCerradora1749100000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE c_oportunidad_cerradora
      ADD COLUMN IF NOT EXISTS has_digital_contract BOOLEAN DEFAULT false
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE c_oportunidad_cerradora
      DROP COLUMN IF EXISTS has_digital_contract
    `);
  }
}
