import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Corrige tarifas MARPE 8 cuotas según Excel:
 * - 8 cuotas mismo día = S/ 70
 * - 8 cuotas diferido  = S/ 40
 */
export class FixMarpe8CuotasCommission1749310000000 implements MigrationInterface {
  name = 'FixMarpe8CuotasCommission1749310000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE commission_type
      SET
        description = 'Clínica MARPE - 8 cuotas mismo día',
        cuota_num = 8,
        amount = 70.00
      WHERE code = 'MARPE_CUOTAS_MISMO_DIA'
    `);
    await queryRunner.query(`
      UPDATE commission_type
      SET
        description = 'Clínica MARPE - 8 cuotas diferido',
        cuota_num = 8,
        amount = 40.00
      WHERE code = 'MARPE_CUOTAS_DIFERIDO'
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE commission_type
      SET description = 'Clínica MARPE - Cuotas mismo día', cuota_num = NULL, amount = 70.00
      WHERE code = 'MARPE_CUOTAS_MISMO_DIA'
    `);
    await queryRunner.query(`
      UPDATE commission_type
      SET description = 'Clínica MARPE - Cuotas diferido', cuota_num = NULL, amount = 65.00
      WHERE code = 'MARPE_CUOTAS_DIFERIDO'
    `);
  }
}
