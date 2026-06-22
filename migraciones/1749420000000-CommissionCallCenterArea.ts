import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Permite área CALL_CENTER en commission_period y commission_type.
 * Sin esto, POST /commissions/periods con area=CALL_CENTER falla con CHECK violation (500).
 */
export class CommissionCallCenterArea1749420000000 implements MigrationInterface {
  name = 'CommissionCallCenterArea1749420000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE commission_period
        DROP CONSTRAINT IF EXISTS commission_period_area_check
    `);
    await queryRunner.query(`
      ALTER TABLE commission_period
        ADD CONSTRAINT commission_period_area_check
        CHECK (area IN ('CIERRE_TTO', 'OI', 'CONTROLES', 'CALL_CENTER'))
    `);

    await queryRunner.query(`
      ALTER TABLE commission_type
        DROP CONSTRAINT IF EXISTS commission_type_area_check
    `);
    await queryRunner.query(`
      ALTER TABLE commission_type
        ADD CONSTRAINT commission_type_area_check
        CHECK (area IN ('CIERRE_TTO', 'OI', 'CONTROLES', 'CALL_CENTER'))
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM commission_period WHERE area = 'CALL_CENTER'
    `);
    await queryRunner.query(`
      DELETE FROM commission_type WHERE area = 'CALL_CENTER'
    `);

    await queryRunner.query(`
      ALTER TABLE commission_period
        DROP CONSTRAINT IF EXISTS commission_period_area_check
    `);
    await queryRunner.query(`
      ALTER TABLE commission_period
        ADD CONSTRAINT commission_period_area_check
        CHECK (area IN ('CIERRE_TTO', 'OI', 'CONTROLES'))
    `);

    await queryRunner.query(`
      ALTER TABLE commission_type
        DROP CONSTRAINT IF EXISTS commission_type_area_check
    `);
    await queryRunner.query(`
      ALTER TABLE commission_type
        ADD CONSTRAINT commission_type_area_check
        CHECK (area IN ('CIERRE_TTO', 'OI', 'CONTROLES'))
    `);
  }
}
