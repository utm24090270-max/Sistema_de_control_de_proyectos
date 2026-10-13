-- ============================================================
-- SCRIPT: Inventario_documentos.sql  (módulo OPCIONAL)
-- Ejecutar DESPUÉS de Inventario_modulo.sql.
-- Solo CREA una tabla nueva: no modifica ninguna tabla existente
-- y es idempotente (se puede ejecutar varias veces).
-- ============================================================

-- Un documento pertenece a UN solo elemento del inventario, identificado por su ID real:
--   nivel FRACCIONAMIENTO -> id_fraccionamiento
--   nivel CONDOMINIO      -> id_condominio
--   nivel LOTE            -> id_lote
-- El archivo NO se guarda en la base de datos: solo su referencia (archivo_almacenado)
-- hacia la carpeta privada del servidor.
CREATE TABLE IF NOT EXISTS documento_inventario (
    id_documento SERIAL PRIMARY KEY,
    nivel VARCHAR(20) NOT NULL CHECK (nivel IN ('FRACCIONAMIENTO', 'CONDOMINIO', 'LOTE')),
    tipo_documento VARCHAR(40) NOT NULL,
    id_fraccionamiento INT REFERENCES fraccionamiento(id_fraccionamiento) ON DELETE CASCADE,
    id_condominio INT REFERENCES condominio(id_condominio) ON DELETE CASCADE,
    id_lote INT REFERENCES lote(id_lote) ON DELETE CASCADE,
    nombre_original VARCHAR(255) NOT NULL,          -- nombre que el administrador ve y descarga
    archivo_almacenado VARCHAR(255) NOT NULL,       -- referencia de almacenamiento (nombre aleatorio en disco)
    mime_type VARCHAR(100),
    tamano_bytes BIGINT,
    id_usuario_admin INT REFERENCES usuario(id_usuario) ON DELETE SET NULL,  -- quién lo cargó
    fecha_carga TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    activo BOOLEAN NOT NULL DEFAULT TRUE,           -- FALSE = versión reemplazada (queda en el historial)
    reemplazado_en TIMESTAMP,
    -- El nivel debe coincidir con el elemento relacionado (y solo con ese)
    CONSTRAINT ck_documento_inventario_elemento CHECK (
        (nivel = 'FRACCIONAMIENTO' AND id_fraccionamiento IS NOT NULL AND id_condominio IS NULL AND id_lote IS NULL) OR
        (nivel = 'CONDOMINIO'      AND id_condominio IS NOT NULL AND id_fraccionamiento IS NULL AND id_lote IS NULL) OR
        (nivel = 'LOTE'            AND id_lote IS NOT NULL AND id_fraccionamiento IS NULL AND id_condominio IS NULL)
    )
);

-- Solo puede haber UN documento vigente por elemento y tipo (las versiones anteriores quedan inactivas)
CREATE UNIQUE INDEX IF NOT EXISTS uq_doc_inv_fraccionamiento
  ON documento_inventario(id_fraccionamiento, tipo_documento)
  WHERE activo AND id_fraccionamiento IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_doc_inv_condominio
  ON documento_inventario(id_condominio, tipo_documento)
  WHERE activo AND id_condominio IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_doc_inv_lote
  ON documento_inventario(id_lote, tipo_documento)
  WHERE activo AND id_lote IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_doc_inv_fraccionamiento ON documento_inventario(id_fraccionamiento);
CREATE INDEX IF NOT EXISTS idx_doc_inv_condominio ON documento_inventario(id_condominio);
CREATE INDEX IF NOT EXISTS idx_doc_inv_lote ON documento_inventario(id_lote);
