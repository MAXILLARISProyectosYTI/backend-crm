import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Unicidad por (cotizacion_id, h_c_patient) en lugar de solo cotizacion_id.
 * Así un paciente puede entrar a cerradoras con su cotización aunque otro paciente
 * tenga una fila histórica con el mismo ID (dato contaminado).
 */
export class UniqueCerradoraQuotationByPatient1749550000000 implements MigrationInterface {
  name = 'UniqueCerradoraQuotationByPatient1749550000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS uniq_c_oportunidad_cerradora_cotizacion_id
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uniq_c_oportunidad_cerradora_cot_hist
      ON c_oportunidad_cerradora (cotizacion_id, h_c_patient)
      WHERE deleted = false
        AND cotizacion_id IS NOT NULL
        AND TRIM(cotizacion_id) <> ''
        AND h_c_patient IS NOT NULL
        AND TRIM(h_c_patient) <> ''
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS uniq_c_oportunidad_cerradora_cot_hist
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uniq_c_oportunidad_cerradora_cotizacion_id
      ON c_oportunidad_cerradora (cotizacion_id)
      WHERE deleted = false
        AND cotizacion_id IS NOT NULL
        AND TRIM(cotizacion_id) <> ''
    `);
  }
}
