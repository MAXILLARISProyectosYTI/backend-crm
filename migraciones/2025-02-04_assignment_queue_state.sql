-- Estado estable de la cola de asignación por (sede, subcampaña).
-- Única fuente de verdad para "último asignado" y "siguiente", evita derivar de oportunidades.
CREATE TABLE IF NOT EXISTS assignment_queue_state (
  campus_id             integer NOT NULL,
  sub_campaign_id       varchar(17) NOT NULL,
  last_assigned_user_id varchar(17) NOT NULL,
  last_assigned_at      timestamp with time zone NOT NULL DEFAULT (now() AT TIME ZONE 'UTC'),
  last_opportunity_id   varchar(17) NULL,
  updated_at            timestamp with time zone NOT NULL DEFAULT (now() AT TIME ZONE 'UTC'),
  PRIMARY KEY (campus_id, sub_campaign_id)
);

COMMENT ON TABLE assignment_queue_state IS 'Estado de la cola de asignación: último usuario asignado por sede y subcampaña. Se actualiza en cada asignación (crear/reasignar).';

-- Índices para lecturas por campus o subcampaña (opcional)
CREATE INDEX IF NOT EXISTS idx_assignment_queue_state_campus
  ON assignment_queue_state (campus_id);
CREATE INDEX IF NOT EXISTS idx_assignment_queue_state_sub_campaign
  ON assignment_queue_state (sub_campaign_id);

-- Backfill: un registro por (campus_id, sub_campaign_id) con la última asignación conocida desde opportunity
INSERT INTO assignment_queue_state (
  campus_id,
  sub_campaign_id,
  last_assigned_user_id,
  last_assigned_at,
  last_opportunity_id,
  updated_at
)
SELECT
  o.c_campus_id,
  o.c_sub_campaign_id,
  o.assigned_user_id,
  o.created_at,
  o.id,
  o.created_at
FROM (
  SELECT
    o2.c_campus_id,
    o2.c_sub_campaign_id,
    o2.assigned_user_id,
    o2.created_at,
    o2.id,
    ROW_NUMBER() OVER (
      PARTITION BY o2.c_campus_id, o2.c_sub_campaign_id
      ORDER BY o2.created_at DESC, o2.id DESC
    ) AS rn
  FROM opportunity o2
  WHERE o2.assigned_user_id IS NOT NULL
    AND o2.c_sub_campaign_id IS NOT NULL
    AND o2.c_campus_id IS NOT NULL
    AND o2.deleted = false
    AND o2.name NOT ILIKE '%REF-%'
) o
WHERE o.rn = 1
ON CONFLICT (campus_id, sub_campaign_id) DO NOTHING;
