import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Demoras cerradoras: vincular solicitud → oportunidad y flag de comisión aprobada.
 * Requerido por OpportunitiesClosers.comisionDemoraAprobada y CrmCerradoraSolicitud.opportunityId.
 */
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
      CREATE INDEX IF NOT EXISTS idx_crm_cerradora_solicitudes_opportunity_id
      ON crm_cerradora_solicitudes (opportunity_id)
      WHERE opportunity_id IS NOT NULL
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
      DROP INDEX IF EXISTS idx_crm_cerradora_solicitudes_opportunity_id
    `);

    await queryRunner.query(`
      ALTER TABLE crm_cerradora_solicitudes
      DROP COLUMN IF EXISTS opportunity_id
    `);
  }
}
