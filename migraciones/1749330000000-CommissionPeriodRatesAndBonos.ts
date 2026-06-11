import { MigrationInterface, QueryRunner } from 'typeorm';

export class CommissionPeriodRatesAndBonos1749330000000 implements MigrationInterface {
  name = 'CommissionPeriodRatesAndBonos1749330000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS commission_period_rate (
        id          SERIAL PRIMARY KEY,
        period_id   INTEGER NOT NULL REFERENCES commission_period(id) ON DELETE CASCADE,
        type_code   VARCHAR(120) NOT NULL,
        amount      DECIMAL(10,2) NOT NULL,
        updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_period_rate UNIQUE (period_id, type_code)
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_period_rate_period ON commission_period_rate(period_id)`);

    await queryRunner.query(`
      ALTER TABLE commission_period
        ADD COLUMN IF NOT EXISTS bono_personal_ttos_threshold INTEGER DEFAULT 45,
        ADD COLUMN IF NOT EXISTS bono_personal_amount DECIMAL(10,2) DEFAULT 500.00,
        ADD COLUMN IF NOT EXISTS bono_equipo_ttos_threshold INTEGER DEFAULT 75,
        ADD COLUMN IF NOT EXISTS bono_equipo_amount DECIMAL(10,2) DEFAULT 1000.00
    `);

    await queryRunner.query(`
      INSERT INTO commission_type (code, description, area, tratamiento, modalidad, timing, modifier, cuota_num, amount) VALUES
      ('MARPE_CUOTAS_MD_C12_MAS50', 'MARPE Cuotas mismo día C12 +50%', 'CIERRE_TTO', 'MARPE', 'CUOTAS', 'MISMO_DIA', 'MAS_50', 12, 75.00),
      ('MARPE_CUOTAS_MD_C10_MAS50', 'MARPE Cuotas mismo día C10 +50%', 'CIERRE_TTO', 'MARPE', 'CUOTAS', 'MISMO_DIA', 'MAS_50', 10, 90.00),
      ('OFM_CUOTAS_MD_C12_MAS50', 'OFM Cuotas mismo día C12 +50%', 'CIERRE_TTO', 'OFM', 'CUOTAS', 'MISMO_DIA', 'MAS_50', 12, 67.50),
      ('OFM_CUOTAS_MD_C10_MAS50', 'OFM Cuotas mismo día C10 +50%', 'CIERRE_TTO', 'OFM', 'CUOTAS', 'MISMO_DIA', 'MAS_50', 10, 82.50),
      ('OFM_CUOTAS_MD_C9_MAS50',  'OFM Cuotas mismo día C9 +50%',  'CIERRE_TTO', 'OFM', 'CUOTAS', 'MISMO_DIA', 'MAS_50', 9,  90.00),
      ('OFM_CUOTAS_MD_C4_MAS50',  'OFM Cuotas mismo día C4 +50%',  'CIERRE_TTO', 'OFM', 'CUOTAS', 'MISMO_DIA', 'MAS_50', 4,  127.50),
      ('OFM_CUOTAS_MD_C3_MAS50',  'OFM Cuotas mismo día C3 +50%',  'CIERRE_TTO', 'OFM', 'CUOTAS', 'MISMO_DIA', 'MAS_50', 3,  142.50),
      ('OFM_CUOTAS_MD_C2_MAS50',  'OFM Cuotas mismo día C2 +50%',  'CIERRE_TTO', 'OFM', 'CUOTAS', 'MISMO_DIA', 'MAS_50', 2,  165.00),
      ('OFM_CONTADO_AOF',         'OFM Contado/diferido AOF y alineadores', 'CIERRE_TTO', 'OFM', 'CONTADO', 'MISMO_DIA', NULL, NULL, 130.00),
      ('OFM_CUOTAS_MD_C2_CONTADO','OFM Cuotas C2 / contado AOF', 'CIERRE_TTO', 'OFM', 'CUOTAS', 'MISMO_DIA', NULL, 2, 150.00)
      ON CONFLICT (code) DO NOTHING
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE commission_period
        DROP COLUMN IF EXISTS bono_equipo_amount,
        DROP COLUMN IF EXISTS bono_equipo_ttos_threshold,
        DROP COLUMN IF EXISTS bono_personal_amount,
        DROP COLUMN IF EXISTS bono_personal_ttos_threshold
    `);
    await queryRunner.query(`DROP TABLE IF EXISTS commission_period_rate`);
  }
}
