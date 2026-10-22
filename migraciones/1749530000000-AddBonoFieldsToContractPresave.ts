import { MigrationInterface, QueryRunner } from 'typeorm';
import { buildEnsureContractPresaveColumnsSql } from './schemas/contract-presave.schema';

export class AddBonoFieldsToContractPresave1749530000000
  implements MigrationInterface
{
  name = 'AddBonoFieldsToContractPresave1749530000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const bonoSql = buildEnsureContractPresaveColumnsSql().filter((sql) =>
      sql.includes('ofm_contrato_bono') ||
      sql.includes('monto_descuento_bono') ||
      sql.includes('ofm_bono_confirmado'),
    );
    for (const sql of bonoSql) {
      await queryRunner.query(sql);
    }
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // Columnas opcionales; no se eliminan en down.
  }
}
