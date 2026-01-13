-- Script para crear la tabla contract_presave
-- Esta tabla guarda los datos pre-guardados del contrato mientras el usuario completa el formulario

CREATE TABLE IF NOT EXISTS contract_presave (
    id SERIAL PRIMARY KEY,
    
    -- Identificador único: quotationId
    quotation_id INT UNIQUE NOT NULL,
    clinic_history_id INT,
    
    -- Datos de facturación (editables)
    tipo_documento_factura VARCHAR(10), -- DNI o RUC
    nombre_factura VARCHAR(255),
    numero_documento_factura VARCHAR(20),
    
    -- Configuración del contrato
    contract_type VARCHAR(50),
    payment_method VARCHAR(20),
    payments_count INT,
    contract_duration_months INT,
    
    -- Descuentos
    descuento_campana_activo BOOLEAN DEFAULT FALSE,
    descuento_hoy_activo BOOLEAN DEFAULT FALSE,
    descuento_discrecional_activo BOOLEAN DEFAULT FALSE,
    tipo_descuento_discrecional VARCHAR(50),
    monto_descuento_discrecional DECIMAL(12, 2) DEFAULT 0,
    descuento_gerencia_solicitado BOOLEAN DEFAULT FALSE,
    monto_descuento_gerencia DECIMAL(12, 2) DEFAULT 0,
    
    -- Cronograma de pagos (JSON)
    payment_schedule_editable TEXT,
    
    -- Pagos registrados - Paso 2 (JSON)
    registered_payments TEXT,
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Índice para búsquedas rápidas por quotation_id
CREATE INDEX IF NOT EXISTS idx_contract_presave_quotation_id ON contract_presave(quotation_id);

-- Comentario de la tabla
COMMENT ON TABLE contract_presave IS 'Tabla para guardar datos pre-guardados del contrato mientras el usuario completa el formulario';

