-- Tabla: sede (campus) -> equipo. Por defecto sede 1 tiene todos los equipos actuales.
CREATE TABLE IF NOT EXISTS campus_team (
  campus_id integer NOT NULL,
  team_id   varchar(17) NOT NULL,
  PRIMARY KEY (campus_id, team_id)
);

COMMENT ON TABLE campus_team IS 'Equipos que atienden cada sede (campus externo) para cola de autoasignación';

-- Sede 1: todos los equipos actuales (OI, OFM, APNEA + leaders)
INSERT INTO campus_team (campus_id, team_id) VALUES
  (1, '68a9d71d1cfbeae93'),   -- EJ_COMERCIAL_OI
  (1, '68a9d710d5a90f5f4'),   -- EJ_COMERCIAL_APNEA
  (1, '68a60f243afa8a87f'),   -- EJ_COMERCIAL
  (1, '68b75568eb21093ef'),   -- TEAM_FIORELLA
  (1, '68b755a5ae3790763'),   -- TEAM_VERONICA
  (1, '68b7559436bfde575'),   -- TEAM_MICHELL
  (1, '68a9dfbb0e3b13e33')    -- TEAM_LEADERS_COMERCIALES
ON CONFLICT (campus_id, team_id) DO NOTHING;
