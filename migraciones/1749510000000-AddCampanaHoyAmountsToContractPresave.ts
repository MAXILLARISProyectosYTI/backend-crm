import { MigrationInterface, QueryRunner } from 'typeorm';
import { buildEnsureContractPresaveColumnsSql } from './schemas/contract-presave.schema';

export class AddCampanaHoyAmountsToContractPresave1749510000000
  implements MigrationInterface
{
  name = 'AddCampanaHoyAmountsToContractPresave1749510000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const campanaHoySql = buildEnsureContractPresaveColumnsSql().filter((sql) =>
      sql.includes('monto_descuento_campana') || sql.includes('monto_descuento_hoy'),
    );
    for (const sql of campanaHoySql) {
      await queryRunner.query(sql);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE contract_presave
      DROP COLUMN IF EXISTS monto_descuento_campana,
      DROP COLUMN IF EXISTS monto_descuento_hoy
    `);
  }
}
