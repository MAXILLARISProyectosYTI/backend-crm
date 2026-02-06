-- Columnas para autoasignación por sede y metadata de empresa (campus)
-- Ejecutar sobre la tabla opportunity si no usas TypeORM synchronize.
-- Por defecto: Lima / Sede de Miraflores (campusId: 1, company: id=1, code=L, name=Lima).

ALTER TABLE opportunity
  ADD COLUMN IF NOT EXISTS c_campus_id integer NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS c_metadata text NULL DEFAULT '{"campusId":1,"campusName":"Lima","companyId":1,"companyCode":"L","companyName":"Lima"}';

-- Rellenar registros existentes que queden con NULL (por si las columnas ya existían sin DEFAULT)
UPDATE opportunity SET c_campus_id = 1 WHERE c_campus_id IS NULL;
UPDATE opportunity SET c_metadata = '{"campusId":1,"campusName":"Lima","companyId":1,"companyCode":"L","companyName":"Lima"}' WHERE c_metadata IS NULL;

COMMENT ON COLUMN opportunity.c_campus_id IS 'Sede (campus) para cola de autoasignación por sede';
COMMENT ON COLUMN opportunity.c_metadata IS 'Metadata JSON: empresa/sede (campusId, campusName, companyId, companyCode, companyName)';
