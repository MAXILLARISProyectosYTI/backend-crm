import { MigrationInterface, QueryRunner } from 'typeorm';

export class DedupeCerradorasByQuotation1749430000000 implements MigrationInterface {
  name = 'DedupeCerradorasByQuotation1749430000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      WITH ranked AS (
        SELECT id,
          ROW_NUMBER() OVER (
            PARTITION BY cotizacion_id
            ORDER BY
              CASE WHEN LOWER(TRIM(status)) IN ('win', 'ganado', 'cierre ganado') THEN 0 ELSE 1 END,
              CASE WHEN contract_id IS NOT NULL AND TRIM(contract_id) <> '' THEN 0 ELSE 1 END,
              CASE WHEN factura_id IS NOT NULL AND TRIM(factura_id) <> '' THEN 0 ELSE 1 END,
              created_at ASC
          ) AS rn
        FROM c_oportunidad_cerradora
        WHERE deleted = false
          AND cotizacion_id IS NOT NULL
          AND TRIM(cotizacion_id) <> ''
      )
      UPDATE c_oportunidad_cerradora op
      SET deleted = true,
          modified_at = NOW()
      FROM ranked r
      WHERE op.id = r.id
        AND r.rn > 1
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uniq_c_oportunidad_cerradora_cotizacion_id
      ON c_oportunidad_cerradora (cotizacion_id)
      WHERE deleted = false
        AND cotizacion_id IS NOT NULL
        AND TRIM(cotizacion_id) <> ''
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS uniq_c_oportunidad_cerradora_cotizacion_id
    `);
  }
}
