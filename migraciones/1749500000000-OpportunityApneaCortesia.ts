import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Flags para la promoción "Apnea de cortesía" en flujo completado (manager_leads).
 * - c_apnea_cortesia_tomada: el ejecutivo solicitó la entrega desde el botón.
 * - c_apnea_cortesia_entregada: la cortesía ya fue entregada físicamente.
 */
export class OpportunityApneaCortesia1749500000000 implements MigrationInterface {
  name = 'OpportunityApneaCortesia1749500000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE opportunity
        ADD COLUMN IF NOT EXISTS c_apnea_cortesia_tomada BOOLEAN NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS c_apnea_cortesia_entregada BOOLEAN NOT NULL DEFAULT false
    `);

    await queryRunner.query(`
      COMMENT ON COLUMN opportunity.c_apnea_cortesia_tomada IS
        'TRUE cuando el ejecutivo hizo clic en ENTREGAR APNEA DE CORTESÍA (solicitud registrada).'
    `);

    await queryRunner.query(`
      COMMENT ON COLUMN opportunity.c_apnea_cortesia_entregada IS
        'TRUE cuando la apnea de cortesía ya fue entregada físicamente al paciente.'
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE opportunity
        DROP COLUMN IF EXISTS c_apnea_cortesia_tomada,
        DROP COLUMN IF EXISTS c_apnea_cortesia_entregada
    `);
  }
}
