import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Índices trigram para la búsqueda de cerradoras por nombre / historia clínica.
 *
 * La búsqueda usa `ILIKE '%texto%'`, que ningún índice btree puede aprovechar:
 * el plan era un Seq Scan sobre las ~76k filas de la tabla, y se ejecutaba dos
 * veces por petición (una para el count y otra para el listado).
 *
 * Medido en crm_dev con el término "JOSE": 85 ms -> 3.6 ms por consulta.
 *
 * Requiere pg_trgm; el índice GIN con gin_trgm_ops es el que hace indexable el
 * patrón con comodín inicial.
 */
export class CerradorasSearchTrigramIndex1749560000000 implements MigrationInterface {
  name = 'CerradorasSearchTrigramIndex1749560000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm`);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_c_oportunidad_cerradora_name_trgm
      ON c_oportunidad_cerradora USING gin (name gin_trgm_ops)
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_c_oportunidad_cerradora_hc_trgm
      ON c_oportunidad_cerradora USING gin (h_c_patient gin_trgm_ops)
    `);

    // Sin ANALYZE el planificador sigue con las estimaciones viejas y puede
    // ignorar los índices recién creados.
    await queryRunner.query(`ANALYZE c_oportunidad_cerradora`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_c_oportunidad_cerradora_hc_trgm`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_c_oportunidad_cerradora_name_trgm`);
    // pg_trgm no se elimina: otras cosas podrían depender de la extensión.
  }
}
