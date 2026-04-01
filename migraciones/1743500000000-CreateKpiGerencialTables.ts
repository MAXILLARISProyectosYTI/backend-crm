import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Crea las tablas para el módulo KPI Gerencial:
 * - meta_gerencial: metas mensuales por área/sede
 * - kpi_snapshot: congelado diario de métricas
 */
export class CreateKpiGerencialTables1743500000000 implements MigrationInterface {
  name = 'CreateKpiGerencialTables1743500000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS meta_gerencial (
        id SERIAL PRIMARY KEY,
        area VARCHAR(100) NOT NULL,
        campus_id INTEGER,
        campus_nombre VARCHAR(150),
        fecha_inicio DATE NOT NULL,
        fecha_fin DATE NOT NULL,
        dias_habiles INTEGER NOT NULL DEFAULT 22,
        meta_monto DECIMAL(12,2) NOT NULL DEFAULT 0,
        meta_cantidad INTEGER NOT NULL DEFAULT 0,
        moneda VARCHAR(5) NOT NULL DEFAULT 'PEN',
        notas TEXT,
        activo BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_meta_gerencial_area ON meta_gerencial(area)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_meta_gerencial_campus ON meta_gerencial(campus_id)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_meta_gerencial_fecha ON meta_gerencial(fecha_inicio, fecha_fin)
    `);
    await queryRunner.query(`
      COMMENT ON TABLE meta_gerencial IS 'Metas gerenciales mensuales por área y sede. Controla objetivos de facturación, asistencias, etc.'
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS kpi_snapshot (
        id SERIAL PRIMARY KEY,
        fecha DATE NOT NULL,
        campus_id INTEGER,
        tipo_kpi VARCHAR(100) NOT NULL,
        datos JSONB NOT NULL DEFAULT '{}',
        meta_gerencial_id INTEGER REFERENCES meta_gerencial(id) ON DELETE SET NULL,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_kpi_snapshot_fecha_campus_tipo UNIQUE (fecha, campus_id, tipo_kpi)
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_kpi_snapshot_fecha ON kpi_snapshot(fecha)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_kpi_snapshot_tipo ON kpi_snapshot(tipo_kpi)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_kpi_snapshot_campus ON kpi_snapshot(campus_id)
    `);
    await queryRunner.query(`
      COMMENT ON TABLE kpi_snapshot IS 'Congelado diario de KPIs. Cada registro es inmutable una vez creado; las resincronizaciones se controlan explícitamente.'
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS kpi_snapshot`);
    await queryRunner.query(`DROP TABLE IF EXISTS meta_gerencial`);
  }
}
