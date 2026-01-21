-- Índices para acelerar `getRecordByTargetId` (PostgreSQL)
-- Tabla: action_history_record

CREATE INDEX IF NOT EXISTS idx_action_history_record_target_id
ON action_history_record(target_id);

CREATE INDEX IF NOT EXISTS idx_action_history_record_target_deleted
ON action_history_record(target_id, deleted);

CREATE INDEX IF NOT EXISTS idx_action_history_record_created_at
ON action_history_record(created_at DESC);

-- Verificación rápida
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'action_history_record'
ORDER BY indexname;

-- Script para agregar índices a la tabla action_history_record
-- Estos índices mejorarán significativamente el rendimiento de getRecordByTargetId

-- Índice específico para targetId (usado en la consulta principal)
CREATE INDEX IF NOT EXISTS idx_action_history_record_target_id 
ON action_history_record(target_id);

-- Índice compuesto para targetId + deleted (filtro más común)
CREATE INDEX IF NOT EXISTS idx_action_history_record_target_deleted 
ON action_history_record(target_id, deleted);

-- Índice para createdAt (usado para ordenamiento)
CREATE INDEX IF NOT EXISTS idx_action_history_record_created_at 
ON action_history_record(created_at DESC);

-- Verificar índices existentes
SELECT 
    indexname, 
    indexdef 
FROM pg_indexes 
WHERE tablename = 'action_history_record'
ORDER BY indexname;
