import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Cerradoras: apoyo entre sedes (% configurable) + comisión OI (2% facturación).
 */
export class CerradorasSedeApoyoAndOiCommission1749350000000 implements MigrationInterface {
  name = 'CerradorasSedeApoyoAndOiCommission1749350000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS commission_cerradora_sede_apoyo (
        id          SERIAL PRIMARY KEY,
        user_id     VARCHAR(50) NOT NULL,
        campus_id   INTEGER NOT NULL,
        porcentaje  DECIMAL(6,4) NOT NULL DEFAULT 0.2000,
        activo      BOOLEAN NOT NULL DEFAULT TRUE,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_cerradora_sede_apoyo UNIQUE (user_id, campus_id)
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_cerradora_sede_apoyo_user
        ON commission_cerradora_sede_apoyo (user_id)
        WHERE activo = TRUE
    `);

    await queryRunner.query(`
      ALTER TABLE commission_period
        ADD COLUMN IF NOT EXISTS porcentaje_comision_oi DECIMAL(6,4) DEFAULT 0.0200
    `);

    await queryRunner.query(`
      ALTER TABLE commission_record
        ADD COLUMN IF NOT EXISTS comision_oi DECIMAL(10,2) NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS monto_facturado_oi_con_igv DECIMAL(12,2) NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS porcentaje_sede_apoyo DECIMAL(6,4)
    `);

    await queryRunner.query(`
      INSERT INTO commission_type (code, description, area, amount, active)
      VALUES ('OI_FACTURACION_CERRADORAS', 'Comisión % facturación OI (cerradoras)', 'CIERRE_TTO', 0, TRUE)
      ON CONFLICT (code) DO NOTHING
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM commission_type WHERE code = 'OI_FACTURACION_CERRADORAS'
    `);
    await queryRunner.query(`
      ALTER TABLE commission_record
        DROP COLUMN IF EXISTS porcentaje_sede_apoyo,
        DROP COLUMN IF EXISTS monto_facturado_oi_con_igv,
        DROP COLUMN IF EXISTS comision_oi
    `);
    await queryRunner.query(`
      ALTER TABLE commission_period
        DROP COLUMN IF EXISTS porcentaje_comision_oi
    `);
    await queryRunner.query(`DROP TABLE IF EXISTS commission_cerradora_sede_apoyo`);
  }
}
