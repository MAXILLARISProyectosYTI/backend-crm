import { MigrationInterface, QueryRunner } from 'typeorm';
import {
  CONTRACT_PRESAVE_COMMENT_SQL,
  CONTRACT_PRESAVE_CREATE_TABLE_SQL,
  CONTRACT_PRESAVE_INDEX_SQL,
  buildEnsureContractPresaveColumnsSql,
} from './schemas/contract-presave.schema';

/**
 * Asegura el esquema completo de contract_presave (idempotente).
 * Reemplaza documentation/contract_presave.sql — ver migraciones/schemas/contract-presave.schema.ts
 */
export class EnsureContractPresaveSchema1749520000000
  implements MigrationInterface
{
  name = 'EnsureContractPresaveSchema1749520000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(CONTRACT_PRESAVE_CREATE_TABLE_SQL);
    for (const sql of buildEnsureContractPresaveColumnsSql()) {
      await queryRunner.query(sql);
    }
    await queryRunner.query(CONTRACT_PRESAVE_INDEX_SQL);
    await queryRunner.query(CONTRACT_PRESAVE_COMMENT_SQL);
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // No revertir: columnas compartidas con migraciones anteriores.
  }
}
