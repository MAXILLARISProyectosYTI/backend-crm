import { MigrationInterface, QueryRunner } from 'typeorm';

export class ComisionDemoraAndSolicitudOpportunity1749200000000
  implements MigrationInterface
{
  name = 'ComisionDemoraAndSolicitudOpportunity1749200000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE crm_cerradora_solicitudes
      ADD COLUMN IF NOT EXISTS opportunity_id VARCHAR(17) NULL
    `);
    await queryRunner.query(`
      ALTER TABLE c_oportunidad_cerradora
      ADD COLUMN IF NOT EXISTS comision_demora_aprobada BOOLEAN NOT NULL DEFAULT FALSE
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE c_oportunidad_cerradora
      DROP COLUMN IF EXISTS comision_demora_aprobada
    `);
    await queryRunner.query(`
      ALTER TABLE crm_cerradora_solicitudes
      DROP COLUMN IF EXISTS opportunity_id
    `);
  }
}
