-- Script para crear la tabla opportunity_presave en backend-crm
-- Esta tabla almacena TODOS los datos del cliente y facturación
-- El cliente se crea al final cuando se factura, no al principio

-- ========================================
-- TABLA: opportunity_presave
-- ========================================
CREATE TABLE opportunity_presave (
    id SERIAL PRIMARY KEY,
    espo_id VARCHAR(255) NOT NULL UNIQUE,
    
    -- ========================================
    -- DATOS DEL CLIENTE
    -- ========================================
    document_number VARCHAR(20),
    name VARCHAR(255),
    last_name_father VARCHAR(255),
    last_name_mother VARCHAR(255),
    cellphone VARCHAR(20),
    email VARCHAR(255),
    address VARCHAR(500),
    attorney VARCHAR(255),
    invoise_type_document VARCHAR(50),
    invoise_num_document VARCHAR(50),
    
    -- ========================================
    -- DATOS DE FACTURACIÓN
    -- ========================================
    -- IDs de referencia
    doctor_id INTEGER,
    business_line_id INTEGER,
    specialty_id INTEGER,
    tariff_id INTEGER,
    
    -- Datos de pago
    fecha_abono DATE,
    metodo_pago INTEGER,
    cuenta_bancaria INTEGER,
    numero_operacion VARCHAR(100),
    moneda VARCHAR(10),
    monto_pago DECIMAL(12,2),
    
    -- Descripción
    description TEXT,
    
    -- Vouchers como JSON con base64
    vouchers_data TEXT,
    
    -- Historia clínica (si ya se creó el paciente)
    clinic_history VARCHAR(50),
    clinic_history_id INTEGER,
    
    -- ========================================
    -- TIMESTAMPS
    -- ========================================
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Índice para búsqueda por espo_id
CREATE INDEX idx_opportunity_presave_espo_id ON opportunity_presave(espo_id);

-- ========================================
-- COMENTARIOS
-- ========================================
COMMENT ON TABLE opportunity_presave IS 'Almacena todos los datos del cliente y facturación preguardados';

-- Datos del cliente
COMMENT ON COLUMN opportunity_presave.espo_id IS 'ID de la oportunidad en ESPO (uuid-opportunity)';
COMMENT ON COLUMN opportunity_presave.document_number IS 'Número de documento del cliente';
COMMENT ON COLUMN opportunity_presave.name IS 'Nombre del cliente';
COMMENT ON COLUMN opportunity_presave.last_name_father IS 'Apellido paterno del cliente';
COMMENT ON COLUMN opportunity_presave.last_name_mother IS 'Apellido materno del cliente';
COMMENT ON COLUMN opportunity_presave.cellphone IS 'Número de celular del cliente';
COMMENT ON COLUMN opportunity_presave.email IS 'Correo electrónico del cliente';
COMMENT ON COLUMN opportunity_presave.address IS 'Dirección del cliente';
COMMENT ON COLUMN opportunity_presave.attorney IS 'Nombre del apoderado';
COMMENT ON COLUMN opportunity_presave.invoise_type_document IS 'Tipo de documento para facturación';
COMMENT ON COLUMN opportunity_presave.invoise_num_document IS 'Número de documento para facturación';

-- Datos de facturación
COMMENT ON COLUMN opportunity_presave.doctor_id IS 'ID del doctor seleccionado';
COMMENT ON COLUMN opportunity_presave.business_line_id IS 'ID de la línea de negocio';
COMMENT ON COLUMN opportunity_presave.specialty_id IS 'ID de la especialidad';
COMMENT ON COLUMN opportunity_presave.tariff_id IS 'ID del tratamiento/tarifa';
COMMENT ON COLUMN opportunity_presave.fecha_abono IS 'Fecha del abono';
COMMENT ON COLUMN opportunity_presave.metodo_pago IS 'ID del método de pago';
COMMENT ON COLUMN opportunity_presave.cuenta_bancaria IS 'ID de la cuenta bancaria';
COMMENT ON COLUMN opportunity_presave.numero_operacion IS 'Número de operación bancaria';
COMMENT ON COLUMN opportunity_presave.moneda IS 'Moneda del pago (PEN/USD)';
COMMENT ON COLUMN opportunity_presave.monto_pago IS 'Monto del pago';
COMMENT ON COLUMN opportunity_presave.description IS 'Descripción del pago';
COMMENT ON COLUMN opportunity_presave.vouchers_data IS 'Vouchers guardados como JSON con imágenes en base64';
COMMENT ON COLUMN opportunity_presave.clinic_history IS 'Código de historia clínica (si se creó)';
COMMENT ON COLUMN opportunity_presave.clinic_history_id IS 'ID de historia clínica (si se creó)';

-- ========================================
-- COLUMNA: is_presaved en tabla opportunity
-- ========================================
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'opportunity' AND column_name = 'is_presaved'
    ) THEN
        ALTER TABLE opportunity ADD COLUMN is_presaved BOOLEAN DEFAULT false;
    END IF;
END $$;

-- Crear índice para filtrar por is_presaved
CREATE INDEX IF NOT EXISTS idx_opportunity_is_presaved ON opportunity(is_presaved);

-- ========================================
-- COLUMNAS ADICIONALES: paymentType, companyType, exchangeRate
-- ========================================
DO $$ 
BEGIN
    -- Agregar paymentType
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'opportunity_presave' AND column_name = 'payment_type'
    ) THEN
        ALTER TABLE opportunity_presave ADD COLUMN payment_type VARCHAR(50);
    END IF;
    
    -- Agregar companyType
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'opportunity_presave' AND column_name = 'company_type'
    ) THEN
        ALTER TABLE opportunity_presave ADD COLUMN company_type VARCHAR(50);
    END IF;
    
    -- Agregar exchangeRate
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'opportunity_presave' AND column_name = 'exchange_rate'
    ) THEN
        ALTER TABLE opportunity_presave ADD COLUMN exchange_rate DECIMAL(12,4);
    END IF;
END $$;

-- Comentarios para las nuevas columnas
COMMENT ON COLUMN opportunity_presave.payment_type IS 'Tipo de pago';
COMMENT ON COLUMN opportunity_presave.company_type IS 'Tipo de empresa';
COMMENT ON COLUMN opportunity_presave.exchange_rate IS 'Tipo de cambio aplicado';
