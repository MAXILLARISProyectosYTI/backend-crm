-- Sede de atención (campus de atención): campus donde se atiende al paciente.
-- Independiente de c_campus_id (sede para cola de autoasignación). Por defecto NULL.

ALTER TABLE opportunity
  ADD COLUMN IF NOT EXISTS c_campus_atencion_id integer NULL;

COMMENT ON COLUMN opportunity.c_campus_atencion_id IS 'Sede de atención (campus de atención) donde se atiende al paciente. NULL por defecto.';
