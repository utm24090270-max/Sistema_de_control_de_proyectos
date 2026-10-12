-- ============================================================
-- SCRIPT: Inventario.sql (Integrado con Schema.sql)
-- ============================================================

-- 1. ESTRUCTURA DE JERARQUÍA DE INVENTARIO
CREATE TABLE IF NOT EXISTS fraccionamiento (
    id_fraccionamiento SERIAL PRIMARY KEY,
    id_empresa INT NOT NULL DEFAULT 1 REFERENCES empresa(id_empresa) ON DELETE CASCADE,
    nombre VARCHAR(150) NOT NULL,
    descripcion TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS condominio (
    id_condominio SERIAL PRIMARY KEY,
    id_fraccionamiento INT NOT NULL REFERENCES fraccionamiento(id_fraccionamiento) ON DELETE CASCADE,
    nombre VARCHAR(150) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS manzana (
    id_manzana SERIAL PRIMARY KEY,
    id_condominio INT NOT NULL REFERENCES condominio(id_condominio) ON DELETE CASCADE,
    num_manzana VARCHAR(50) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Actualización/Ampliación para la tabla de terrenos/lotes
CREATE TABLE IF NOT EXISTS lote (
    id_lote SERIAL PRIMARY KEY,
    id_manzana INT REFERENCES manzana(id_manzana) ON DELETE SET NULL,
    num_lote VARCHAR(50) NOT NULL,
    m2 NUMERIC(10, 2),
    precio NUMERIC(12, 2),
    estado VARCHAR(20) DEFAULT 'DISPONIBLE', -- 'DISPONIBLE', 'RESERVADO', 'ASIGNADO', 'VENDIDO'
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. TABLA DE ASIGNACIÓN EXCLUSIVA POR ADMINISTRADOR
CREATE TABLE IF NOT EXISTS asignacion_lote (
    id_asignacion SERIAL PRIMARY KEY,
    id_proceso INT NOT NULL REFERENCES proceso_venta(id_proceso) ON DELETE CASCADE,
    id_lote INT REFERENCES lote(id_lote) ON DELETE CASCADE,          -- jerarquía nueva (opcional)
    id_terreno INT REFERENCES terreno(id_terreno) ON DELETE SET NULL, -- inventario que usa el backend actual
    id_usuario_admin INT NOT NULL REFERENCES usuario(id_usuario), -- Admin que hizo la asignación
    accion VARCHAR(20) DEFAULT 'ASIGNAR',                         -- 'ASIGNAR' | 'LIBERAR'
    fecha_asignacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    observaciones TEXT
);

-- Migración segura si asignacion_lote ya existía con la versión anterior
ALTER TABLE asignacion_lote ALTER COLUMN id_lote DROP NOT NULL;
ALTER TABLE asignacion_lote ADD COLUMN IF NOT EXISTS id_terreno INT REFERENCES terreno(id_terreno) ON DELETE SET NULL;
ALTER TABLE asignacion_lote ADD COLUMN IF NOT EXISTS accion VARCHAR(20) DEFAULT 'ASIGNAR';

-- 3. AJUSTES A LA TABLA PROCESO_VENTA (Observaciones 2 y 3)
-- Ejecutamos alteraciones seguras sobre proceso_venta para no rehacer la tabla.
-- (Idempotente: si Schema.sql ya incluye estas columnas, no pasa nada.)
-- NOTA: debe ejecutarse DESPUÉS de Schema.sql.

-- Quitar valores por defecto para permitir 'Sin asignar' (Observación 3)
ALTER TABLE proceso_venta ALTER COLUMN tipo_construccion DROP DEFAULT;
ALTER TABLE proceso_venta ALTER COLUMN tipo_construccion SET DEFAULT NULL;

ALTER TABLE proceso_venta ALTER COLUMN institucion_financiera DROP DEFAULT;
ALTER TABLE proceso_venta ALTER COLUMN institucion_financiera SET DEFAULT NULL;

-- Agregar campos para compras a nombre de terceros (Observación 2)
ALTER TABLE proceso_venta ADD COLUMN IF NOT EXISTS es_para_tercero BOOLEAN DEFAULT FALSE;
ALTER TABLE proceso_venta ADD COLUMN IF NOT EXISTS tercero_nombre_completo VARCHAR(255) DEFAULT NULL;
ALTER TABLE proceso_venta ADD COLUMN IF NOT EXISTS tercero_telefono VARCHAR(20) DEFAULT NULL;
ALTER TABLE proceso_venta ADD COLUMN IF NOT EXISTS tercero_email VARCHAR(100) DEFAULT NULL;
ALTER TABLE proceso_venta ADD COLUMN IF NOT EXISTS tercero_curp VARCHAR(18) DEFAULT NULL;
ALTER TABLE proceso_venta ADD COLUMN IF NOT EXISTS tercero_rfc VARCHAR(20) DEFAULT NULL;
ALTER TABLE proceso_venta ADD COLUMN IF NOT EXISTS tercero_direccion VARCHAR(255) DEFAULT NULL;

-- 4. ÍNDICES Y RESTRICCIONES ÚTILES
CREATE INDEX IF NOT EXISTS idx_asignacion_lote_proceso ON asignacion_lote(id_proceso);
CREATE INDEX IF NOT EXISTS idx_asignacion_lote_lote ON asignacion_lote(id_lote);

-- Un mismo número de lote no puede repetirse dentro de la misma manzana
CREATE UNIQUE INDEX IF NOT EXISTS uq_lote_manzana_num ON lote(id_manzana, num_lote);
CREATE INDEX IF NOT EXISTS idx_asignacion_lote_terreno ON asignacion_lote(id_terreno);

-- Un terreno no puede estar asignado a dos expedientes activos al mismo tiempo.
-- (Si ya existen duplicados, el índice no se crea y solo se muestra un aviso.)
DO $$
BEGIN
  CREATE UNIQUE INDEX IF NOT EXISTS uq_proceso_terreno_activo
    ON proceso_venta(id_terreno)
    WHERE id_terreno IS NOT NULL AND COALESCE(activo, true) = true;
EXCEPTION WHEN unique_violation THEN
  RAISE NOTICE 'Hay terrenos asignados a más de un expediente activo; corrige los duplicados y vuelve a ejecutar.';
END $$;

-- 5. REFERENCIA AL LOTE ASIGNADO EN EL EXPEDIENTE
-- id_lote guarda la referencia real al lote; num_lote guarda su código de inventario (solo para mostrarlo).
-- Estados de lote usados por el sistema: DISPONIBLE -> ASIGNADO (al asignarlo a un expediente) -> VENDIDO.
ALTER TABLE proceso_venta ADD COLUMN IF NOT EXISTS id_lote INT REFERENCES lote(id_lote) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_proceso_venta_lote ON proceso_venta(id_lote);

-- Un lote no puede estar asignado a dos expedientes activos al mismo tiempo.
DO $$
BEGIN
  CREATE UNIQUE INDEX IF NOT EXISTS uq_proceso_lote_activo
    ON proceso_venta(id_lote)
    WHERE id_lote IS NOT NULL AND COALESCE(activo, true) = true;
EXCEPTION WHEN unique_violation THEN
  RAISE NOTICE 'Hay lotes asignados a más de un expediente activo; corrige los duplicados y vuelve a ejecutar.';
END $$;