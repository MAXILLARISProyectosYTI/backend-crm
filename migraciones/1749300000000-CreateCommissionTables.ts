import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Crea las tablas del módulo de Comisiones:
 * - commission_type:        catálogo de tipos/montos de comisión (cerradoras)
 * - commission_period:      período mensual por área/sede (meta, parámetros)
 * - commission_record:      resultado por ejecutivo en un período
 * - commission_detail:      detalle línea a línea de cerradoras
 * - commission_closure_tag: etiquetas manuales para contratos (timing/modifier)
 */
export class CreateCommissionTables1749300000000 implements MigrationInterface {
  name = 'CreateCommissionTables1749300000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    // ── 1. commission_type ──────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS commission_type (
        id          SERIAL PRIMARY KEY,
        code        VARCHAR(120) UNIQUE NOT NULL,
        description TEXT NOT NULL,
        area        VARCHAR(30) NOT NULL CHECK (area IN ('CIERRE_TTO', 'OI', 'CONTROLES')),
        tratamiento VARCHAR(30),
        modalidad   VARCHAR(20),
        timing      VARCHAR(20),
        modifier    VARCHAR(20),
        cuota_num   INTEGER,
        amount      DECIMAL(10,2) NOT NULL DEFAULT 0,
        active      BOOLEAN NOT NULL DEFAULT TRUE,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(`COMMENT ON TABLE commission_type IS 'Catálogo de tipos de comisión con sus montos fijos. Cerradoras usan catálogo por tipo de cierre.'`);

    // ── 2. commission_period ────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS commission_period (
        id                    SERIAL PRIMARY KEY,
        year                  INTEGER NOT NULL,
        month                 INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
        area                  VARCHAR(30) NOT NULL CHECK (area IN ('CIERRE_TTO', 'OI', 'CONTROLES')),
        campus_id             INTEGER,
        campus_nombre         VARCHAR(150),
        meta_monto_con_igv    DECIMAL(12,2),
        meta_monto_sin_igv    DECIMAL(12,2),
        meta_cantidad         INTEGER,
        base_fija_con_igv     DECIMAL(12,2),
        n_ejecutivas          INTEGER,
        porcentaje_comision   DECIMAL(6,4),
        db_total              DECIMAL(12,2),
        obj_evaluaciones      INTEGER,
        estado                VARCHAR(20) NOT NULL DEFAULT 'BORRADOR'
                              CHECK (estado IN ('BORRADOR','CERRADO','PAGADO')),
        notas                 TEXT,
        created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_commission_period UNIQUE (year, month, area, campus_id)
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_comm_period_area ON commission_period(area)`);
    await queryRunner.query(`COMMENT ON TABLE commission_period IS 'Período mensual de comisiones por área y sede. Contiene metas, parámetros de cálculo y estado.'`);

    // ── 3. commission_record ────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS commission_record (
        id                       SERIAL PRIMARY KEY,
        period_id                INTEGER NOT NULL REFERENCES commission_period(id) ON DELETE CASCADE,
        user_id                  VARCHAR(50) NOT NULL,
        user_name                VARCHAR(200),
        campus_id                INTEGER,
        campus_nombre            VARCHAR(150),
        monto_facturado_con_igv  DECIMAL(12,2) NOT NULL DEFAULT 0,
        monto_facturado_sin_igv  DECIMAL(12,2) NOT NULL DEFAULT 0,
        cantidad_unidades        INTEGER NOT NULL DEFAULT 0,
        porcentaje_alcanzado     DECIMAL(6,4),
        db_asignada              DECIMAL(12,2),
        factor_especial          DECIMAL(8,6) NOT NULL DEFAULT 1,
        comision_ttos            DECIMAL(10,2) NOT NULL DEFAULT 0,
        comision_evaluaciones    DECIMAL(10,2) NOT NULL DEFAULT 0,
        comision_bono            DECIMAL(10,2) NOT NULL DEFAULT 0,
        comision_total           DECIMAL(10,2) NOT NULL DEFAULT 0,
        estado                   VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE'
                                 CHECK (estado IN ('PENDIENTE','CALCULADO','APROBADO','PAGADO')),
        notas                    TEXT,
        created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_commission_record UNIQUE (period_id, user_id, campus_id)
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_comm_record_period ON commission_record(period_id)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_comm_record_user ON commission_record(user_id)`);
    await queryRunner.query(`COMMENT ON TABLE commission_record IS 'Resultado de comisión por ejecutivo y período. factor_especial=0.01 para Jenny Aguirre.'`);

    // ── 4. commission_detail ────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS commission_detail (
        id                   SERIAL PRIMARY KEY,
        record_id            INTEGER NOT NULL REFERENCES commission_record(id) ON DELETE CASCADE,
        commission_type_id   INTEGER NOT NULL REFERENCES commission_type(id),
        contract_id          INTEGER,
        quotation_id         INTEGER,
        cantidad             INTEGER NOT NULL DEFAULT 0,
        importe_unitario     DECIMAL(10,2) NOT NULL DEFAULT 0,
        importe_total        DECIMAL(10,2) NOT NULL DEFAULT 0,
        created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_comm_detail_record ON commission_detail(record_id)`);
    await queryRunner.query(`COMMENT ON TABLE commission_detail IS 'Detalle línea a línea de comisiones de cerradoras (un registro por tipo de cierre por contrato).'`);

    // ── 5. commission_closure_tag ───────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS commission_closure_tag (
        id                   SERIAL PRIMARY KEY,
        contract_id          INTEGER NOT NULL,
        quotation_id         INTEGER,
        period_id            INTEGER REFERENCES commission_period(id) ON DELETE SET NULL,
        timing               VARCHAR(20) CHECK (timing IN ('MISMO_DIA','DIFERIDO')),
        modifier             VARCHAR(20) CHECK (modifier IN ('DOBLE','MAS_50', NULL)),
        commission_type_id   INTEGER REFERENCES commission_type(id),
        notas                TEXT,
        created_by           VARCHAR(50),
        created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_closure_tag UNIQUE (contract_id)
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_closure_tag_period ON commission_closure_tag(period_id)`);
    await queryRunner.query(`COMMENT ON TABLE commission_closure_tag IS 'Etiquetas manuales para contratos de cerradoras: timing (MISMO_DIA/DIFERIDO) y modifier (DOBLE/MAS_50). Campos que SV no modela aún.'`);

    // ── Seed: catálogo de tipos de comisión ─────────────────────────────────
    await queryRunner.query(`
      INSERT INTO commission_type (code, description, area, tratamiento, modalidad, timing, modifier, cuota_num, amount) VALUES
      -- MARPE CONTADO
      ('MARPE_CONTADO_MISMO_DIA_DOBLE',   'Clínica MARPE - Contado mismo día - Doble',  'CIERRE_TTO', 'MARPE', 'CONTADO', 'MISMO_DIA', 'DOBLE',  NULL, 400.00),
      ('MARPE_CONTADO_MISMO_DIA_MAS50',   'Clínica MARPE - Contado mismo día - +50%',   'CIERRE_TTO', 'MARPE', 'CONTADO', 'MISMO_DIA', 'MAS_50', NULL, 300.00),
      ('MARPE_CONTADO_MISMO_DIA',         'Clínica MARPE - Contado mismo día',           'CIERRE_TTO', 'MARPE', 'CONTADO', 'MISMO_DIA', NULL,     NULL, 200.00),
      ('MARPE_CUOTAS_MISMO_DIA',          'Clínica MARPE - 8 cuotas mismo día',          'CIERRE_TTO', 'MARPE', 'CUOTAS',  'MISMO_DIA', NULL,     8,    70.00),
      ('MARPE_CONTADO_DIFERIDO',          'Clínica MARPE - Contado diferido',            'CIERRE_TTO', 'MARPE', 'CONTADO', 'DIFERIDO',  NULL,     NULL, 110.00),
      ('MARPE_CUOTAS_DIFERIDO',           'Clínica MARPE - 8 cuotas diferido',           'CIERRE_TTO', 'MARPE', 'CUOTAS',  'DIFERIDO',  NULL,     8,    40.00),
      -- MARPE CUOTAS MISMO DIA (escala por número de cuotas C1..C12)
      ('MARPE_CUOTAS_MD_C1',  'MARPE Cuotas mismo día C1',  'CIERRE_TTO', 'MARPE', 'CUOTAS', 'MISMO_DIA', NULL, 1,  170.00),
      ('MARPE_CUOTAS_MD_C2',  'MARPE Cuotas mismo día C2',  'CIERRE_TTO', 'MARPE', 'CUOTAS', 'MISMO_DIA', NULL, 2,  165.00),
      ('MARPE_CUOTAS_MD_C3',  'MARPE Cuotas mismo día C3',  'CIERRE_TTO', 'MARPE', 'CUOTAS', 'MISMO_DIA', NULL, 3,  160.00),
      ('MARPE_CUOTAS_MD_C4',  'MARPE Cuotas mismo día C4',  'CIERRE_TTO', 'MARPE', 'CUOTAS', 'MISMO_DIA', NULL, 4,  155.00),
      ('MARPE_CUOTAS_MD_C5',  'MARPE Cuotas mismo día C5',  'CIERRE_TTO', 'MARPE', 'CUOTAS', 'MISMO_DIA', NULL, 5,  150.00),
      ('MARPE_CUOTAS_MD_C6',  'MARPE Cuotas mismo día C6',  'CIERRE_TTO', 'MARPE', 'CUOTAS', 'MISMO_DIA', NULL, 6,  140.00),
      ('MARPE_CUOTAS_MD_C7',  'MARPE Cuotas mismo día C7',  'CIERRE_TTO', 'MARPE', 'CUOTAS', 'MISMO_DIA', NULL, 7,  130.00),
      ('MARPE_CUOTAS_MD_C8',  'MARPE Cuotas mismo día C8',  'CIERRE_TTO', 'MARPE', 'CUOTAS', 'MISMO_DIA', NULL, 8,  110.00),
      ('MARPE_CUOTAS_MD_C9',  'MARPE Cuotas mismo día C9',  'CIERRE_TTO', 'MARPE', 'CUOTAS', 'MISMO_DIA', NULL, 9,  100.00),
      ('MARPE_CUOTAS_MD_C10', 'MARPE Cuotas mismo día C10', 'CIERRE_TTO', 'MARPE', 'CUOTAS', 'MISMO_DIA', NULL, 10,  85.00),
      ('MARPE_CUOTAS_MD_C11', 'MARPE Cuotas mismo día C11', 'CIERRE_TTO', 'MARPE', 'CUOTAS', 'MISMO_DIA', NULL, 11,  70.00),
      ('MARPE_CUOTAS_MD_C12', 'MARPE Cuotas mismo día C12', 'CIERRE_TTO', 'MARPE', 'CUOTAS', 'MISMO_DIA', NULL, 12,  50.00),
      -- MARPE CUOTAS DIFERIDO (escala C1..C12)
      ('MARPE_CUOTAS_DF_C1',  'MARPE Cuotas diferido C1',  'CIERRE_TTO', 'MARPE', 'CUOTAS', 'DIFERIDO', NULL, 1,  90.00),
      ('MARPE_CUOTAS_DF_C2',  'MARPE Cuotas diferido C2',  'CIERRE_TTO', 'MARPE', 'CUOTAS', 'DIFERIDO', NULL, 2,  85.00),
      ('MARPE_CUOTAS_DF_C3',  'MARPE Cuotas diferido C3',  'CIERRE_TTO', 'MARPE', 'CUOTAS', 'DIFERIDO', NULL, 3,  80.00),
      ('MARPE_CUOTAS_DF_C4',  'MARPE Cuotas diferido C4',  'CIERRE_TTO', 'MARPE', 'CUOTAS', 'DIFERIDO', NULL, 4,  75.00),
      ('MARPE_CUOTAS_DF_C5',  'MARPE Cuotas diferido C5',  'CIERRE_TTO', 'MARPE', 'CUOTAS', 'DIFERIDO', NULL, 5,  70.00),
      ('MARPE_CUOTAS_DF_C6',  'MARPE Cuotas diferido C6',  'CIERRE_TTO', 'MARPE', 'CUOTAS', 'DIFERIDO', NULL, 6,  60.00),
      ('MARPE_CUOTAS_DF_C7',  'MARPE Cuotas diferido C7',  'CIERRE_TTO', 'MARPE', 'CUOTAS', 'DIFERIDO', NULL, 7,  55.00),
      ('MARPE_CUOTAS_DF_C8',  'MARPE Cuotas diferido C8',  'CIERRE_TTO', 'MARPE', 'CUOTAS', 'DIFERIDO', NULL, 8,  50.00),
      ('MARPE_CUOTAS_DF_C9',  'MARPE Cuotas diferido C9',  'CIERRE_TTO', 'MARPE', 'CUOTAS', 'DIFERIDO', NULL, 9,  42.00),
      ('MARPE_CUOTAS_DF_C10', 'MARPE Cuotas diferido C10', 'CIERRE_TTO', 'MARPE', 'CUOTAS', 'DIFERIDO', NULL, 10, 37.00),
      ('MARPE_CUOTAS_DF_C11', 'MARPE Cuotas diferido C11', 'CIERRE_TTO', 'MARPE', 'CUOTAS', 'DIFERIDO', NULL, 11, 30.00),
      ('MARPE_CUOTAS_DF_C12', 'MARPE Cuotas diferido C12', 'CIERRE_TTO', 'MARPE', 'CUOTAS', 'DIFERIDO', NULL, 12, 25.00),
      -- OFM (=AOF en el Excel) CONTADO
      ('OFM_CONTADO_MISMO_DIA_DOBLE',     'Clínica OFM - Contado mismo día - Doble',   'CIERRE_TTO', 'OFM', 'CONTADO', 'MISMO_DIA', 'DOBLE',  NULL, 340.00),
      ('OFM_CONTADO_MISMO_DIA_MAS50',     'Clínica OFM - Contado mismo día - +50%',    'CIERRE_TTO', 'OFM', 'CONTADO', 'MISMO_DIA', 'MAS_50', NULL, 255.00),
      ('OFM_CONTADO_MISMO_DIA',           'Clínica OFM - Contado mismo día',            'CIERRE_TTO', 'OFM', 'CONTADO', 'MISMO_DIA', NULL,     NULL, 170.00),
      ('OFM_CUOTAS_MISMO_DIA_MAS50',      'Clínica OFM - Cuotas mismo día - +50%',     'CIERRE_TTO', 'OFM', 'CUOTAS',  'MISMO_DIA', 'MAS_50', NULL,  97.50),
      ('OFM_CUOTAS_MISMO_DIA',            'Clínica OFM - Cuotas mismo día',             'CIERRE_TTO', 'OFM', 'CUOTAS',  'MISMO_DIA', NULL,     NULL,  65.00),
      ('OFM_CONTADO_DIFERIDO',            'Clínica OFM - Contado diferido',             'CIERRE_TTO', 'OFM', 'CONTADO', 'DIFERIDO',  NULL,     NULL,  90.00),
      ('OFM_CUOTAS_DIFERIDO',             'Clínica OFM - Cuotas diferido',              'CIERRE_TTO', 'OFM', 'CUOTAS',  'DIFERIDO',  NULL,     NULL,  42.00),
      -- OFM/ALINEADORES CUOTAS MISMO DIA (escala C1..C14)
      ('OFM_CUOTAS_MD_C1',  'OFM Cuotas mismo día C1',  'CIERRE_TTO', 'OFM', 'CUOTAS', 'MISMO_DIA', NULL, 1,  170.00),
      ('OFM_CUOTAS_MD_C2',  'OFM Cuotas mismo día C2',  'CIERRE_TTO', 'OFM', 'CUOTAS', 'MISMO_DIA', NULL, 2,  165.00),
      ('OFM_CUOTAS_MD_C3',  'OFM Cuotas mismo día C3',  'CIERRE_TTO', 'OFM', 'CUOTAS', 'MISMO_DIA', NULL, 3,  160.00),
      ('OFM_CUOTAS_MD_C4',  'OFM Cuotas mismo día C4',  'CIERRE_TTO', 'OFM', 'CUOTAS', 'MISMO_DIA', NULL, 4,  155.00),
      ('OFM_CUOTAS_MD_C5',  'OFM Cuotas mismo día C5',  'CIERRE_TTO', 'OFM', 'CUOTAS', 'MISMO_DIA', NULL, 5,  150.00),
      ('OFM_CUOTAS_MD_C6',  'OFM Cuotas mismo día C6',  'CIERRE_TTO', 'OFM', 'CUOTAS', 'MISMO_DIA', NULL, 6,  145.00),
      ('OFM_CUOTAS_MD_C7',  'OFM Cuotas mismo día C7',  'CIERRE_TTO', 'OFM', 'CUOTAS', 'MISMO_DIA', NULL, 7,  142.50),
      ('OFM_CUOTAS_MD_C8',  'OFM Cuotas mismo día C8',  'CIERRE_TTO', 'OFM', 'CUOTAS', 'MISMO_DIA', NULL, 8,  140.00),
      ('OFM_CUOTAS_MD_C9',  'OFM Cuotas mismo día C9',  'CIERRE_TTO', 'OFM', 'CUOTAS', 'MISMO_DIA', NULL, 9,  135.00),
      ('OFM_CUOTAS_MD_C10', 'OFM Cuotas mismo día C10', 'CIERRE_TTO', 'OFM', 'CUOTAS', 'MISMO_DIA', NULL, 10, 130.00),
      ('OFM_CUOTAS_MD_C11', 'OFM Cuotas mismo día C11', 'CIERRE_TTO', 'OFM', 'CUOTAS', 'MISMO_DIA', NULL, 11, 110.00),
      ('OFM_CUOTAS_MD_C12', 'OFM Cuotas mismo día C12', 'CIERRE_TTO', 'OFM', 'CUOTAS', 'MISMO_DIA', NULL, 12, 100.00),
      ('OFM_CUOTAS_MD_C13', 'OFM Cuotas mismo día C13', 'CIERRE_TTO', 'OFM', 'CUOTAS', 'MISMO_DIA', NULL, 13,  97.00),
      ('OFM_CUOTAS_MD_C14', 'OFM Cuotas mismo día C14', 'CIERRE_TTO', 'OFM', 'CUOTAS', 'MISMO_DIA', NULL, 14,  85.00),
      -- OFM/ALINEADORES CUOTAS DIFERIDO (escala C1..C14)
      ('OFM_CUOTAS_DF_C1',  'OFM Cuotas diferido C1',  'CIERRE_TTO', 'OFM', 'CUOTAS', 'DIFERIDO', NULL, 1,  90.00),
      ('OFM_CUOTAS_DF_C2',  'OFM Cuotas diferido C2',  'CIERRE_TTO', 'OFM', 'CUOTAS', 'DIFERIDO', NULL, 2,  85.00),
      ('OFM_CUOTAS_DF_C3',  'OFM Cuotas diferido C3',  'CIERRE_TTO', 'OFM', 'CUOTAS', 'DIFERIDO', NULL, 3,  80.00),
      ('OFM_CUOTAS_DF_C4',  'OFM Cuotas diferido C4',  'CIERRE_TTO', 'OFM', 'CUOTAS', 'DIFERIDO', NULL, 4,  75.00),
      ('OFM_CUOTAS_DF_C5',  'OFM Cuotas diferido C5',  'CIERRE_TTO', 'OFM', 'CUOTAS', 'DIFERIDO', NULL, 5,  70.00),
      ('OFM_CUOTAS_DF_C6',  'OFM Cuotas diferido C6',  'CIERRE_TTO', 'OFM', 'CUOTAS', 'DIFERIDO', NULL, 6,  67.00),
      ('OFM_CUOTAS_DF_C7',  'OFM Cuotas diferido C7',  'CIERRE_TTO', 'OFM', 'CUOTAS', 'DIFERIDO', NULL, 7,  67.00),
      ('OFM_CUOTAS_DF_C8',  'OFM Cuotas diferido C8',  'CIERRE_TTO', 'OFM', 'CUOTAS', 'DIFERIDO', NULL, 8,  67.00),
      ('OFM_CUOTAS_DF_C9',  'OFM Cuotas diferido C9',  'CIERRE_TTO', 'OFM', 'CUOTAS', 'DIFERIDO', NULL, 9,  57.00),
      ('OFM_CUOTAS_DF_C10', 'OFM Cuotas diferido C10', 'CIERRE_TTO', 'OFM', 'CUOTAS', 'DIFERIDO', NULL, 10, 52.00),
      ('OFM_CUOTAS_DF_C11', 'OFM Cuotas diferido C11', 'CIERRE_TTO', 'OFM', 'CUOTAS', 'DIFERIDO', NULL, 11, 37.00),
      ('OFM_CUOTAS_DF_C12', 'OFM Cuotas diferido C12', 'CIERRE_TTO', 'OFM', 'CUOTAS', 'DIFERIDO', NULL, 12, 32.00),
      ('OFM_CUOTAS_DF_C13', 'OFM Cuotas diferido C13', 'CIERRE_TTO', 'OFM', 'CUOTAS', 'DIFERIDO', NULL, 13, 27.00),
      ('OFM_CUOTAS_DF_C14', 'OFM Cuotas diferido C14', 'CIERRE_TTO', 'OFM', 'CUOTAS', 'DIFERIDO', NULL, 14, 22.00),
      -- APNEA / DTM
      ('APNEA_CONTADO_DOBLE',  'APNEA/DTM - Contado doble', 'CIERRE_TTO', 'APNEA', 'CONTADO', 'MISMO_DIA', 'DOBLE',  NULL, 200.00),
      ('APNEA_CONTADO_MAS50',  'APNEA/DTM - Contado +50%',  'CIERRE_TTO', 'APNEA', 'CONTADO', 'MISMO_DIA', 'MAS_50', NULL, 150.00),
      ('APNEA_CONTADO',        'APNEA/DTM - Contado',       'CIERRE_TTO', 'APNEA', 'CONTADO', 'MISMO_DIA', NULL,     NULL, 100.00),
      ('APNEA_CUOTAS',         'APNEA/DTM - Cuotas',        'CIERRE_TTO', 'APNEA', 'CUOTAS',  'MISMO_DIA', NULL,     NULL,  50.00),
      -- CAMBIO DE TTO
      ('CAMBIO_TTO', 'Cambio de tratamiento', 'CIERRE_TTO', NULL, NULL, NULL, NULL, NULL, 40.00)
      ON CONFLICT (code) DO NOTHING
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS commission_closure_tag`);
    await queryRunner.query(`DROP TABLE IF EXISTS commission_detail`);
    await queryRunner.query(`DROP TABLE IF EXISTS commission_record`);
    await queryRunner.query(`DROP TABLE IF EXISTS commission_period`);
    await queryRunner.query(`DROP TABLE IF EXISTS commission_type`);
  }
}
