-- Script para crear la tabla opportunity_presave en backend-crm
-- Esta tabla almacena datos parciales de clientes relacionados con oportunidades
-- cuando el usuario presiona "Preguardar" sin completar todo el formulario

-- ========================================
-- TABLA: opportunity_presave
-- ========================================
CREATE TABLE IF NOT EXISTS opportunity_presave (
    id SERIAL PRIMARY KEY,
    espo_id VARCHAR(255) NOT NULL UNIQUE,
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
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Índice para búsqueda por espo_id
CREATE INDEX IF NOT EXISTS idx_opportunity_presave_espo_id ON opportunity_presave(espo_id);

-- Comentarios de la tabla
COMMENT ON TABLE opportunity_presave IS 'Almacena datos parciales de clientes preguardados antes de completar el flujo';
COMMENT ON COLUMN opportunity_presave.espo_id IS 'ID de la oportunidad en ESPO (uuid-opportunity)';
COMMENT ON COLUMN opportunity_presave.document_number IS 'Número de documento del cliente';
COMMENT ON COLUMN opportunity_presave.name IS 'Nombre del cliente';
COMMENT ON COLUMN opportunity_presave.last_name_father IS 'Apellido paterno del cliente';
COMMENT ON COLUMN opportunity_presave.last_name_mother IS 'Apellido materno del cliente';
COMMENT ON COLUMN opportunity_presave.cellphone IS 'Número de celular del cliente';
COMMENT ON COLUMN opportunity_presave.email IS 'Correo electrónico del cliente';
COMMENT ON COLUMN opportunity_presave.address IS 'Dirección del cliente';
COMMENT ON COLUMN opportunity_presave.attorney IS 'Nombre del apoderado (si aplica)';
COMMENT ON COLUMN opportunity_presave.invoise_type_document IS 'Tipo de documento para facturación';
COMMENT ON COLUMN opportunity_presave.invoise_num_document IS 'Número de documento para facturación';

-- ========================================
-- COLUMNA: is_presaved en tabla opportunity
-- ========================================
-- Agregar columna is_presaved a la tabla opportunity (si no existe)
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
