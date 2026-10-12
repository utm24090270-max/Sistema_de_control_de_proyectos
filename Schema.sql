-- 1. EMPRESA
CREATE TABLE IF NOT EXISTS empresa (
  id_empresa SERIAL PRIMARY KEY,
  nombre VARCHAR(100) NOT NULL,
  rfc VARCHAR(13) UNIQUE NOT NULL,
  direccion TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insertar empresa por defecto si no existe
INSERT INTO empresa (id_empresa, nombre, rfc, direccion) 
VALUES (1, 'Constructora Proyecto 20 S.A. de C.V.', 'CPR200101ABC', 'Av. Principal #123')
ON CONFLICT (id_empresa) DO NOTHING;

-- Como se insertó id_empresa = 1 de forma explícita, se sincroniza la secuencia
-- para evitar colisiones en futuros INSERT sin id.
SELECT setval(pg_get_serial_sequence('empresa', 'id_empresa'), GREATEST((SELECT MAX(id_empresa) FROM empresa), 1));

-- 2. USUARIO
CREATE TABLE IF NOT EXISTS usuario (
    id_usuario SERIAL PRIMARY KEY,
    id_empresa INT NOT NULL REFERENCES empresa(id_empresa) ON DELETE CASCADE,
    nombre VARCHAR(100) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    rol VARCHAR(20) DEFAULT 'CLIENTE', -- 'ADMIN', 'ASESOR', 'CLIENTE'
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. CLIENTE (Nombre en singular para coincidir con tu server.js)
CREATE TABLE IF NOT EXISTS cliente (
   id_cliente SERIAL PRIMARY KEY,
   id_empresa INT NOT NULL DEFAULT 1 REFERENCES empresa(id_empresa) ON DELETE CASCADE,
   id_usuario INT UNIQUE REFERENCES usuario(id_usuario) ON DELETE CASCADE,
   nombre VARCHAR(100) NOT NULL,
   apellido VARCHAR(100) NOT NULL,
   curp VARCHAR(18),
   rfc VARCHAR(20),
   direccion VARCHAR(255),
   email VARCHAR(100),
   telefono VARCHAR(20),
   created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 4. TERRENO / PROPIEDAD
CREATE TABLE IF NOT EXISTS terreno (
    id_terreno SERIAL PRIMARY KEY,
    id_empresa INT NOT NULL DEFAULT 1 REFERENCES empresa(id_empresa) ON DELETE CASCADE,
    num_lote VARCHAR(50) NOT NULL,
    manzana VARCHAR(50),
    m2 NUMERIC(10, 2) NOT NULL,
    precio NUMERIC(12, 2) NOT NULL,
    estado VARCHAR(20) DEFAULT 'DISPONIBLE', -- 'DISPONIBLE', 'RESERVADO', 'VENDIDO'
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 5. PROCESO DE VENTA (Expediente digital)
CREATE TABLE IF NOT EXISTS proceso_venta (
    id_proceso SERIAL PRIMARY KEY,
    id_cliente INT NOT NULL REFERENCES cliente(id_cliente) ON DELETE CASCADE,
    id_terreno INT REFERENCES terreno(id_terreno) ON DELETE SET NULL,
    num_lote VARCHAR(100),
    tipo_construccion VARCHAR(50) DEFAULT NULL,        -- NULL = 'Sin asignar'
    institucion_financiera VARCHAR(50) DEFAULT NULL,   -- NULL = 'Sin asignar'
    etapa_actual VARCHAR(50) DEFAULT 'Evaluación',
    rutas_documentos JSONB DEFAULT '{}'::jsonb,
    estados_binarios JSONB DEFAULT '{}'::jsonb,
    observaciones TEXT DEFAULT '',
    activo BOOLEAN DEFAULT true,
    -- Expedientes a nombre de terceros (el expediente queda ligado a id_cliente del solicitante)
    es_para_tercero BOOLEAN DEFAULT FALSE,
    tercero_nombre_completo VARCHAR(255) DEFAULT NULL,
    tercero_telefono VARCHAR(20) DEFAULT NULL,
    tercero_email VARCHAR(100) DEFAULT NULL,
    tercero_curp VARCHAR(18) DEFAULT NULL,
    tercero_rfc VARCHAR(20) DEFAULT NULL,
    tercero_direccion VARCHAR(255) DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 6. BITÁCORA DE AUDITORÍA
CREATE TABLE IF NOT EXISTS bitacora_auditoria (
    id_bitacora SERIAL PRIMARY KEY,
    id_usuario INT DEFAULT 1,
    modulo VARCHAR(50) NOT NULL,
    accion VARCHAR(50) NOT NULL,
    id_registro_afectado INT,
    descripcion TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 7. TRIGGER DE AUDITORÍA ROBUSTO
CREATE OR REPLACE FUNCTION fn_auditar_movimiento()
RETURNS TRIGGER AS $$
DECLARE
  v_id INT := 0;
BEGIN
  IF (TG_TABLE_NAME = 'cliente') THEN
    v_id := COALESCE(NEW.id_cliente, OLD.id_cliente);
  ELSIF (TG_TABLE_NAME = 'usuario') THEN
    v_id := COALESCE(NEW.id_usuario, OLD.id_usuario);
  ELSIF (TG_TABLE_NAME = 'proceso_venta') THEN
    v_id := COALESCE(NEW.id_proceso, OLD.id_proceso);
  ELSIF (TG_TABLE_NAME = 'terreno') THEN
    v_id := COALESCE(NEW.id_terreno, OLD.id_terreno);
  END IF;

  INSERT INTO bitacora_auditoria (
    id_usuario,
    modulo,
    accion,
    id_registro_afectado,
    descripcion
  )
  VALUES (
    1,
    TG_TABLE_NAME,
    TG_OP,
    v_id,
    CONCAT('Movimiento automático (', TG_OP, ') en la tabla ', TG_TABLE_NAME)
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Asignación de Triggers
DROP TRIGGER IF EXISTS tr_auditoria_proceso_venta ON proceso_venta;
CREATE TRIGGER tr_auditoria_proceso_venta
AFTER INSERT OR UPDATE OR DELETE ON proceso_venta
FOR EACH ROW EXECUTE FUNCTION fn_auditar_movimiento();

DROP TRIGGER IF EXISTS tr_auditoria_cliente ON cliente;
CREATE TRIGGER tr_auditoria_cliente
AFTER INSERT OR UPDATE OR DELETE ON cliente
FOR EACH ROW EXECUTE FUNCTION fn_auditar_movimiento();

-- ============================================================
-- MIGRACIÓN SEGURA (bases de datos ya creadas): idempotente
-- ============================================================
ALTER TABLE proceso_venta ALTER COLUMN tipo_construccion SET DEFAULT NULL;
ALTER TABLE proceso_venta ALTER COLUMN institucion_financiera SET DEFAULT NULL;
ALTER TABLE proceso_venta ADD COLUMN IF NOT EXISTS es_para_tercero BOOLEAN DEFAULT FALSE;
ALTER TABLE proceso_venta ADD COLUMN IF NOT EXISTS tercero_nombre_completo VARCHAR(255) DEFAULT NULL;
ALTER TABLE proceso_venta ADD COLUMN IF NOT EXISTS tercero_telefono VARCHAR(20) DEFAULT NULL;
ALTER TABLE proceso_venta ADD COLUMN IF NOT EXISTS tercero_email VARCHAR(100) DEFAULT NULL;
ALTER TABLE proceso_venta ADD COLUMN IF NOT EXISTS tercero_curp VARCHAR(18) DEFAULT NULL;
ALTER TABLE proceso_venta ADD COLUMN IF NOT EXISTS tercero_rfc VARCHAR(20) DEFAULT NULL;
ALTER TABLE proceso_venta ADD COLUMN IF NOT EXISTS tercero_direccion VARCHAR(255) DEFAULT NULL;

-- Búsqueda rápida de expedientes por cliente y evita clientes duplicados por correo
CREATE INDEX IF NOT EXISTS idx_proceso_venta_cliente ON proceso_venta(id_cliente);
CREATE INDEX IF NOT EXISTS idx_cliente_email_lower ON cliente (LOWER(email));