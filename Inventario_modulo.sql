-- ============================================================
-- SCRIPT: Inventario_modulo.sql
-- Ejecutar DESPUÉS de Schema.sql e Inventario.sql.
-- Es idempotente (se puede ejecutar varias veces) y NO borra datos.
-- ============================================================

-- ------------------------------------------------------------
-- 1. MANZANAS DIRECTAMENTE BAJO UN FRACCIONAMIENTO (escenario B)
--    Antes: manzana.id_condominio era NOT NULL, por lo que solo existía
--    Fraccionamiento > Condominio > Manzana (se usaba un condominio "N/A").
--    Ahora una manzana pertenece a UN condominio O a UN fraccionamiento.
--    Los registros existentes (todos con id_condominio) cumplen la regla tal cual.
-- ------------------------------------------------------------
ALTER TABLE manzana ADD COLUMN IF NOT EXISTS id_fraccionamiento INT
  REFERENCES fraccionamiento(id_fraccionamiento) ON DELETE CASCADE;
ALTER TABLE manzana ALTER COLUMN id_condominio DROP NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_manzana_ubicacion') THEN
    ALTER TABLE manzana ADD CONSTRAINT ck_manzana_ubicacion
      CHECK (num_nonnulls(id_condominio, id_fraccionamiento) = 1);
  END IF;
END $$;

-- La relación condominio -> fraccionamiento ya es obligatoria en Inventario.sql
-- (id_fraccionamiento INT NOT NULL REFERENCES fraccionamiento). No se modifica.

-- ------------------------------------------------------------
-- 2. RESTRICCIONES ANTI-DUPLICADOS
--    Si ya existen duplicados el índice no se crea y solo se muestra un aviso:
--    corrige los duplicados y vuelve a ejecutar el script.
-- ------------------------------------------------------------
DO $$ BEGIN
  CREATE UNIQUE INDEX IF NOT EXISTS uq_fraccionamiento_nombre
    ON fraccionamiento(id_empresa, LOWER(nombre));
EXCEPTION WHEN unique_violation THEN
  RAISE NOTICE 'Hay fraccionamientos con el mismo nombre; corrígelos y vuelve a ejecutar.';
END $$;

DO $$ BEGIN
  CREATE UNIQUE INDEX IF NOT EXISTS uq_condominio_nombre
    ON condominio(id_fraccionamiento, LOWER(nombre));
EXCEPTION WHEN unique_violation THEN
  RAISE NOTICE 'Hay condominios repetidos dentro de un mismo fraccionamiento; corrígelos y vuelve a ejecutar.';
END $$;

DO $$ BEGIN
  CREATE UNIQUE INDEX IF NOT EXISTS uq_manzana_condominio_num
    ON manzana(id_condominio, num_manzana) WHERE id_condominio IS NOT NULL;
EXCEPTION WHEN unique_violation THEN
  RAISE NOTICE 'Hay manzanas repetidas dentro de un mismo condominio; corrígelas y vuelve a ejecutar.';
END $$;

DO $$ BEGIN
  CREATE UNIQUE INDEX IF NOT EXISTS uq_manzana_fraccionamiento_num
    ON manzana(id_fraccionamiento, num_manzana) WHERE id_fraccionamiento IS NOT NULL;
EXCEPTION WHEN unique_violation THEN
  RAISE NOTICE 'Hay manzanas repetidas dentro de un mismo fraccionamiento; corrígelas y vuelve a ejecutar.';
END $$;

CREATE INDEX IF NOT EXISTS idx_condominio_fraccionamiento ON condominio(id_fraccionamiento);
CREATE INDEX IF NOT EXISTS idx_manzana_condominio ON manzana(id_condominio);
CREATE INDEX IF NOT EXISTS idx_manzana_fraccionamiento ON manzana(id_fraccionamiento);
CREATE INDEX IF NOT EXISTS idx_lote_manzana ON lote(id_manzana);
CREATE INDEX IF NOT EXISTS idx_lote_estado ON lote(estado);

-- ------------------------------------------------------------
-- 3. CÓDIGO DE INVENTARIO GUARDADO EN EL LOTE
--    Se rellena desde el backend (los lotes ya existentes se completan
--    al iniciar el servidor, SIN cambiar el código que ya se mostraba).
--    El índice único impide dos lotes con el mismo código.
-- ------------------------------------------------------------
ALTER TABLE lote ADD COLUMN IF NOT EXISTS codigo_inventario VARCHAR(60);

DO $$ BEGIN
  CREATE UNIQUE INDEX IF NOT EXISTS uq_lote_codigo_inventario
    ON lote(codigo_inventario) WHERE codigo_inventario IS NOT NULL;
EXCEPTION WHEN unique_violation THEN
  RAISE NOTICE 'Hay lotes con el mismo código de inventario; revísalos y vuelve a ejecutar.';
END $$;

-- ------------------------------------------------------------
-- 4. SOLICITUDES DE LOTE (flujo usuario -> administrador)
--    Estados: PENDIENTE | APROBADA | RECHAZADA | CANCELADA
--    Se relaciona con el expediente (proceso_venta), el lote real y el usuario.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS solicitud_lote (
    id_solicitud SERIAL PRIMARY KEY,
    id_proceso INT NOT NULL REFERENCES proceso_venta(id_proceso) ON DELETE CASCADE,
    id_lote INT NOT NULL REFERENCES lote(id_lote) ON DELETE CASCADE,
    id_usuario_solicitante INT REFERENCES usuario(id_usuario) ON DELETE SET NULL,
    estado VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE'
      CHECK (estado IN ('PENDIENTE', 'APROBADA', 'RECHAZADA', 'CANCELADA')),
    comentarios TEXT,
    fecha_solicitud TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    id_usuario_admin INT REFERENCES usuario(id_usuario) ON DELETE SET NULL,
    fecha_resolucion TIMESTAMP,
    motivo_resolucion TEXT
);

-- Un expediente solo puede tener una solicitud pendiente a la vez.
-- Varios expedientes SÍ pueden solicitar el mismo lote: el administrador decide.
CREATE UNIQUE INDEX IF NOT EXISTS uq_solicitud_pendiente_proceso
  ON solicitud_lote(id_proceso) WHERE estado = 'PENDIENTE';
CREATE INDEX IF NOT EXISTS idx_solicitud_lote_lote ON solicitud_lote(id_lote);
CREATE INDEX IF NOT EXISTS idx_solicitud_lote_estado ON solicitud_lote(estado);

-- La asignación registrada puede indicar de qué solicitud proviene
ALTER TABLE asignacion_lote ADD COLUMN IF NOT EXISTS id_solicitud INT
  REFERENCES solicitud_lote(id_solicitud) ON DELETE SET NULL;

-- ------------------------------------------------------------
-- 5. VISTA DE INVENTARIO (resuelve ambos escenarios y la asignación activa)
--    Fraccionamiento > Condominio > Manzana > Lote
--    Fraccionamiento > Manzana > Lote
-- ------------------------------------------------------------
CREATE OR REPLACE VIEW v_lote_inventario AS
SELECT l.id_lote,
       l.num_lote,
       l.m2,
       l.precio,
       l.estado,
       l.codigo_inventario,
       l.created_at,
       m.id_manzana,
       m.num_manzana,
       c.id_condominio,
       c.nombre AS condominio,
       f.id_fraccionamiento,
       f.nombre AS fraccionamiento,
       f.id_empresa,
       pv.id_proceso,
       pv.id_cliente,
       CASE WHEN COALESCE(pv.es_para_tercero, false)
            THEN pv.tercero_nombre_completo
            ELSE NULLIF(TRIM(CONCAT(cl.nombre, ' ', cl.apellido)), '')
       END AS titular_expediente,
       NULLIF(TRIM(CONCAT(cl.nombre, ' ', cl.apellido)), '') AS cliente_cuenta,
       cl.email AS cliente_email
FROM lote l
LEFT JOIN manzana m ON m.id_manzana = l.id_manzana
LEFT JOIN condominio c ON c.id_condominio = m.id_condominio
LEFT JOIN fraccionamiento f ON f.id_fraccionamiento = COALESCE(m.id_fraccionamiento, c.id_fraccionamiento)
LEFT JOIN proceso_venta pv ON pv.id_lote = l.id_lote AND COALESCE(pv.activo, true) = true
LEFT JOIN cliente cl ON cl.id_cliente = pv.id_cliente;

-- ------------------------------------------------------------
-- 6. (OPCIONAL, NO SE EJECUTA SOLO) Convertir condominios "N/A" en manzanas directas
--    Hoy los lotes sin condominio están bajo un condominio llamado "N/A".
--    Siguen funcionando igual (el sistema los trata como "sin condominio" y su
--    código no cambia). Si algún día quieres limpiarlos, descomenta y ejecuta:
--
-- UPDATE manzana m
--    SET id_fraccionamiento = c.id_fraccionamiento, id_condominio = NULL
--   FROM condominio c
--  WHERE c.id_condominio = m.id_condominio
--    AND UPPER(REGEXP_REPLACE(c.nombre, '[^A-Za-z0-9]', '', 'g')) IN ('NA', 'NOAPLICA', 'SINCONDOMINIO');
-- DELETE FROM condominio c
--  WHERE UPPER(REGEXP_REPLACE(c.nombre, '[^A-Za-z0-9]', '', 'g')) IN ('NA', 'NOAPLICA', 'SINCONDOMINIO')
--    AND NOT EXISTS (SELECT 1 FROM manzana m WHERE m.id_condominio = c.id_condominio);
