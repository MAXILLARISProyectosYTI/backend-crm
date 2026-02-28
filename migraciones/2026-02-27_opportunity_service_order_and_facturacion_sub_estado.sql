-- Órdenes de servicio (O.S) asociadas a una oportunidad.
-- Se consulta GET invoice-mifact-v3/service-order/:serviceOrderId/invoice-status.
-- Cuando facturado=true se descargan las URLs y se completa el cierre ganado.

CREATE TABLE IF NOT EXISTS opportunity_service_order (
  id SERIAL PRIMARY KEY,
  opportunity_id varchar(17) NOT NULL,
  service_order_id integer NOT NULL,
  metadata text NULL,
  facturado boolean NULL DEFAULT false,
  invoice_result_head_id integer NULL,
  url_soles text NULL,
  url_dolares text NULL,
  last_checked_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_opportunity_service_order_opportunity_id
  ON opportunity_service_order (opportunity_id);
CREATE INDEX IF NOT EXISTS idx_opportunity_service_order_service_order_id
  ON opportunity_service_order (service_order_id);

COMMENT ON TABLE opportunity_service_order IS 'Órdenes de servicio asociadas a una oportunidad; se consulta invoice-status hasta que esté facturada.';

-- Sub-estado de facturación cuando stage = Cierre ganado (factura_directa | orden_servicio_pendiente_factura).

ALTER TABLE opportunity
  ADD COLUMN IF NOT EXISTS c_facturacion_sub_estado varchar(60) NULL;

COMMENT ON COLUMN opportunity.c_facturacion_sub_estado IS 'Sub-estado de facturación: factura_directa, orden_servicio_pendiente_factura o NULL.';
