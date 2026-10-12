const db = require('./db');

async function corregirDatosFaltantes() {
  try {
    console.log('🔄 Verificando y corrigiendo datos faltantes en la base de datos...');

    // 1. Asegurar que la tabla proceso_venta tenga los campos necesarios
    await db.query(`
      ALTER TABLE proceso_venta 
      ADD COLUMN IF NOT EXISTS num_lote VARCHAR(50),
      ADD COLUMN IF NOT EXISTS tipo_construccion VARCHAR(50) DEFAULT 'Residencial',
      ADD COLUMN IF NOT EXISTS institucion_financiera VARCHAR(50) DEFAULT 'C.infonavit',
      ADD COLUMN IF NOT EXISTS etapa_actual VARCHAR(50) DEFAULT 'Evaluación',
      ADD COLUMN IF NOT EXISTS rutas_documentos JSONB DEFAULT '{}'::jsonb,
      ADD COLUMN IF NOT EXISTS estados_binarios JSONB DEFAULT '{}'::jsonb,
      ADD COLUMN IF NOT EXISTS observaciones TEXT,
      ADD COLUMN IF NOT EXISTS activo BOOLEAN DEFAULT true;
    `);

    // 2. Corregir registros existentes que tengan campos en NULL
    await db.query(`
      UPDATE proceso_venta 
      SET 
        tipo_construccion = COALESCE(tipo_construccion, 'Residencial'),
        institucion_financiera = COALESCE(institucion_financiera, 'C.infonavit'),
        etapa_actual = COALESCE(etapa_actual, 'Evaluación'),
        rutas_documentos = COALESCE(rutas_documentos, '{}'::jsonb),
        estados_binarios = COALESCE(estados_binarios, '{}'::jsonb),
        activo = COALESCE(activo, true)
      WHERE tipo_construccion IS NULL 
         OR institucion_financiera IS NULL 
         OR etapa_actual IS NULL 
         OR rutas_documentos IS NULL 
         OR estados_binarios IS NULL 
         OR activo IS NULL;
    `);

    console.log('✅ Datos faltantes corregidos con éxito.');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error al corregir datos:', error);
    process.exit(1);
  }
}

corregirDatosFaltantes();