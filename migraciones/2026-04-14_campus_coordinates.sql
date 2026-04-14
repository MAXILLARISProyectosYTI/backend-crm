-- Tabla auxiliar para coordenadas geográficas de sedes (campus).
-- Los datos maestros de campus vienen del servicio SV; aquí solo se almacenan
-- latitude/longitude para envío de templates WhatsApp con header LOCATION.

CREATE TABLE IF NOT EXISTS campus_coordinates (
  campus_id   INTEGER PRIMARY KEY,
  latitude    DECIMAL(10, 7),
  longitude   DECIMAL(10, 7)
);

-- Coordenadas reales de las clínicas existentes
INSERT INTO campus_coordinates (campus_id, latitude, longitude) VALUES
  (1,  -12.046374, -77.042793),   -- Lima
  (15, -16.409047, -71.537451)    -- Arequipa
ON CONFLICT (campus_id) DO NOTHING;
