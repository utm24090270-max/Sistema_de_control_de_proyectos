#!/usr/bin/env node
// ============================================================================
// LIMPIEZA CONTROLADA de datos operativos: expedientes e inventario de lotes.
//
// Qué hace:   vacía expedientes, solicitudes y asignaciones de lote, documentos del
//             inventario, lotes, manzanas, condominios y fraccionamientos.
// Qué NO toca: usuarios, clientes, empresa, tablas, columnas, índices, restricciones,
//             contraseñas, roles ni código. Tampoco la tabla "terreno" ni la bitácora de auditoría.
//
// Uso (desde la carpeta backend-constructora, con el servidor DETENIDO):
//   node limpieza-controlada.js --revisar                 Solo lee: muestra qué se borraría (no cambia nada)
//   node limpieza-controlada.js --ejecutar --respaldo-bd "C:\ruta\respaldo.backup"
//                                                         Borra, con respaldo verificado y confirmación
//   node limpieza-controlada.js --ejecutar --respaldo-bd "..." --reiniciar-folios
//                                                         Igual, y además los folios/IDs vuelven a empezar en 1
//   node limpieza-controlada.js --verificar               Solo lee: confirma cómo quedó todo
//
// Se conecta a la base definida en el archivo .env (db.js). Muestra a cuál antes de borrar.
// ============================================================================
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const pool = require('./db');
const storage = require('./storage');

const args = process.argv.slice(2);
const tiene = (bandera) => args.includes(bandera);
const valorDe = (bandera) => {
  const i = args.indexOf(bandera);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : null;
};

// Orden de borrado: primero lo que depende de otras tablas (se respetan todas las llaves foráneas)
const TABLAS_A_LIMPIAR = [
  { tabla: 'solicitud_lote', modulo: 'Solicitudes de lote', pk: 'id_solicitud' },
  { tabla: 'asignacion_lote', modulo: 'Asignaciones de lote', pk: 'id_asignacion' },
  { tabla: 'proceso_venta', modulo: 'Expedientes', pk: 'id_proceso' },
  { tabla: 'documento_inventario', modulo: 'Documentos del inventario', pk: 'id_documento' },
  { tabla: 'lote', modulo: 'Lotes', pk: 'id_lote' },
  { tabla: 'manzana', modulo: 'Manzanas', pk: 'id_manzana' },
  { tabla: 'condominio', modulo: 'Condominios', pk: 'id_condominio' },
  { tabla: 'fraccionamiento', modulo: 'Fraccionamientos', pk: 'id_fraccionamiento' }
];
// Tablas que deben quedar EXACTAMENTE igual
const TABLAS_INTACTAS = ['usuario', 'cliente', 'empresa', 'terreno'];
// Solo se informa (no se borra): historial de auditoría
const TABLA_BITACORA = 'bitacora_auditoria';

const sello = () => new Date().toISOString().replace(/[:.]/g, '-');
const linea = (t = '') => console.log(t);
const titulo = (t) => { linea(); linea(`=== ${t} ===`); };

const existeTabla = async (db, tabla) => (await db.query('SELECT to_regclass($1) IS NOT NULL AS ok', [`public.${tabla}`])).rows[0].ok;
const contar = async (db, tabla) => (await db.query(`SELECT COUNT(*)::int AS n FROM ${tabla}`)).rows[0].n;

const preguntar = (texto) =>
  new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(texto, (r) => { rl.close(); resolve(r.trim()); });
  });

// ---------- Revisión (solo lectura) ----------
async function revisar(db) {
  const info = (await db.query('SELECT current_database() AS bd, current_user AS usuario')).rows[0];
  const estado = { base: info.bd, usuario: info.usuario, host: process.env.DB_HOST || '(sin host en .env)', tablas: {}, ausentes: [], intactas: {}, bitacora: null };

  for (const t of TABLAS_A_LIMPIAR) {
    if (await existeTabla(db, t.tabla)) estado.tablas[t.tabla] = await contar(db, t.tabla);
    else estado.ausentes.push(t.tabla);
  }
  for (const t of TABLAS_INTACTAS) {
    if (await existeTabla(db, t)) estado.intactas[t] = await contar(db, t);
  }
  if (await existeTabla(db, TABLA_BITACORA)) estado.bitacora = await contar(db, TABLA_BITACORA);

  // Tablas que dependen de las que se van a limpiar y que NO están en la lista (no deben existir)
  const existentes = Object.keys(estado.tablas).map((t) => `public.${t}`);
  const deps = await db.query(
    `SELECT conrelid::regclass::text AS tabla_hija, confrelid::regclass::text AS tabla_padre, conname
     FROM pg_constraint
     WHERE contype = 'f' AND confrelid IN (SELECT to_regclass(n) FROM unnest($1::text[]) AS n)`,
    [existentes]
  );
  const limpia = (n) => String(n).replace(/^public\./, '').replace(/"/g, '');
  const conocidas = new Set(TABLAS_A_LIMPIAR.map((t) => t.tabla));
  estado.dependenciasInesperadas = deps.rows.filter((d) => !conocidas.has(limpia(d.tabla_hija)));
  return estado;
}

function imprimirRevision(e) {
  titulo('Base de datos a la que está conectado este script');
  linea(`  Base: ${e.base}   Usuario: ${e.usuario}   Servidor: ${e.host}`);
  titulo('Registros que se ELIMINARÍAN');
  for (const t of TABLAS_A_LIMPIAR) {
    if (t.tabla in e.tablas) linea(`  ${t.modulo.padEnd(28)} (${t.tabla}): ${e.tablas[t.tabla]}`);
    else linea(`  ${t.modulo.padEnd(28)} (${t.tabla}): la tabla no existe en esta base (se omite)`);
  }
  titulo('Registros que se CONSERVAN sin cambios');
  for (const [t, n] of Object.entries(e.intactas)) linea(`  ${t.padEnd(28)} ${n}`);
  if (e.bitacora !== null) linea(`  ${TABLA_BITACORA.padEnd(28)} ${e.bitacora}  (historial de auditoría; no se borra)`);
  if (e.dependenciasInesperadas.length) {
    titulo('ALTO: hay tablas que dependen de estos datos y no están contempladas');
    for (const d of e.dependenciasInesperadas) linea(`  ${d.tabla_hija} -> ${d.tabla_padre} (${d.conname})`);
    linea('  La limpieza se bloquea hasta revisar estas tablas.');
  }
}

// ---------- Archivos físicos ----------
async function construirManifiesto(db) {
  const manifiesto = { expedientes: [], inventario: [], referenciasNoReconocidas: [] };

  const exp = await db.query(
    `SELECT DISTINCT d.value AS ruta
     FROM proceso_venta p, LATERAL jsonb_each_text(COALESCE(p.rutas_documentos, '{}'::jsonb)) AS d`
  );
  for (const f of exp.rows) {
    const ruta = String(f.ruta || '');
    if (ruta.startsWith('/uploads/') && path.basename(ruta) === ruta.slice('/uploads/'.length)) {
      manifiesto.expedientes.push(path.basename(ruta));
    } else if (ruta) {
      manifiesto.referenciasNoReconocidas.push(ruta); // no se toca: no se puede verificar su pertenencia
    }
  }
  if (await existeTabla(db, 'documento_inventario')) {
    const inv = await db.query('SELECT DISTINCT archivo_almacenado FROM documento_inventario');
    for (const f of inv.rows) if (f.archivo_almacenado) manifiesto.inventario.push(path.basename(f.archivo_almacenado));
  }
  manifiesto.expedientes = [...new Set(manifiesto.expedientes)];
  manifiesto.inventario = [...new Set(manifiesto.inventario)];
  return manifiesto;
}

// Archivos de la carpeta local que no pertenecen a ningún expediente (solo se informan)
function archivosSinReferencia(manifiesto) {
  if (storage.usaAzure()) return null; // con Azure no se lista el contenedor desde aquí
  const dir = path.join(__dirname, 'uploads');
  if (!fs.existsSync(dir)) return [];
  const referenciados = new Set(manifiesto.expedientes);
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isFile() && !referenciados.has(d.name))
    .map((d) => d.name);
}

async function copiarAlRespaldo(contenedor, nombre, carpetaDestino) {
  const flujo = await storage.abrir(contenedor, nombre);
  if (!flujo) return false;
  fs.mkdirSync(carpetaDestino, { recursive: true });
  await new Promise((ok, fallo) => {
    const salida = fs.createWriteStream(path.join(carpetaDestino, nombre), { flags: 'wx' });
    flujo.on('error', fallo);
    salida.on('error', fallo);
    salida.on('finish', ok);
    flujo.pipe(salida);
  });
  return true;
}

// ---------- Validación del respaldo de la base de datos ----------
function validarRespaldoBD(ruta) {
  if (!ruta) return 'Falta indicar el archivo de respaldo: --respaldo-bd "C:\\ruta\\respaldo.backup"';
  if (!fs.existsSync(ruta)) return `No existe el archivo de respaldo: ${ruta}`;
  const st = fs.statSync(ruta);
  if (!st.isFile() || st.size < 2048) return 'El archivo de respaldo está vacío o es demasiado pequeño; el respaldo no parece válido.';
  if (Date.now() - st.mtimeMs > 24 * 60 * 60 * 1000) return 'El respaldo tiene más de 24 horas. Genera uno nuevo justo antes de limpiar.';
  const fd = fs.openSync(ruta, 'r');
  const buf = Buffer.alloc(4096);
  const n = fs.readSync(fd, buf, 0, 4096, 0);
  fs.closeSync(fd);
  const cabecera = buf.slice(0, n).toString('latin1');
  const esCustom = cabecera.startsWith('PGDMP');
  const esPlano = cabecera.includes('PostgreSQL database dump');
  if (!esCustom && !esPlano) return 'El archivo no parece un respaldo de PostgreSQL (formato Custom o Plain generado por pgAdmin / pg_dump).';
  return null;
}

// ---------- Ejecución ----------
async function ejecutar() {
  const rutaRespaldo = valorDe('--respaldo-bd');
  const problema = validarRespaldoBD(rutaRespaldo);
  if (problema) { console.error(`\n❌ ${problema}`); return 1; }

  const estado = await revisar(pool);
  imprimirRevision(estado);
  if (estado.dependenciasInesperadas.length) return 1;

  const manifiesto = await construirManifiesto(pool);
  const sinReferencia = archivosSinReferencia(manifiesto);
  titulo('Archivos físicos');
  linea(`  Documentos de expedientes a eliminar: ${manifiesto.expedientes.length}`);
  linea(`  Documentos del inventario a eliminar: ${manifiesto.inventario.length}`);
  if (manifiesto.referenciasNoReconocidas.length) linea(`  Referencias no reconocidas (NO se tocan): ${manifiesto.referenciasNoReconocidas.length}`);
  if (sinReferencia && sinReferencia.length) linea(`  Archivos en uploads/ sin expediente (NO se tocan): ${sinReferencia.length}`);

  titulo('Confirmación');
  linea(`  Respaldo de la base verificado: ${rutaRespaldo}`);
  const escrito = await preguntar(`  Para continuar escribe el nombre de la base de datos (${estado.base}) y pulsa Enter: `);
  if (escrito !== estado.base) { linea('\nNo coincide. No se borró nada.'); return 1; }

  // 1) Copia de los archivos que se van a eliminar
  const sello1 = sello();
  const carpetaRespaldo = path.join(__dirname, 'respaldos', `limpieza_${sello1}`);
  const informe = { fecha: new Date().toISOString(), base: estado.base, respaldoBD: rutaRespaldo, carpetaRespaldo, eliminados: {}, archivos: { respaldados: 0, eliminados: 0, noEncontrados: [], errores: [] }, conservados: {}, foliosReiniciados: false };
  fs.mkdirSync(carpetaRespaldo, { recursive: true });
  fs.writeFileSync(path.join(carpetaRespaldo, 'manifiesto.json'), JSON.stringify(manifiesto, null, 2));

  titulo('Copia de seguridad de los archivos a eliminar');
  const faltantes = [];
  for (const n of manifiesto.expedientes) {
    try { if (await copiarAlRespaldo('expedientes', n, path.join(carpetaRespaldo, 'expedientes'))) informe.archivos.respaldados++; else faltantes.push({ contenedor: 'expedientes', nombre: n }); }
    catch (e) { console.error(`❌ No se pudo copiar ${n}: ${e.message}. Se cancela antes de borrar.`); return 1; }
  }
  for (const n of manifiesto.inventario) {
    try { if (await copiarAlRespaldo('inventario', n, path.join(carpetaRespaldo, 'inventario'))) informe.archivos.respaldados++; else faltantes.push({ contenedor: 'inventario', nombre: n }); }
    catch (e) { console.error(`❌ No se pudo copiar ${n}: ${e.message}. Se cancela antes de borrar.`); return 1; }
  }
  linea(`  Archivos copiados a: ${carpetaRespaldo}  (${informe.archivos.respaldados})`);
  if (faltantes.length) linea(`  Referenciados en la base pero ya inexistentes: ${faltantes.length}`);

  // 2) Borrado de la base de datos en UNA transacción, con verificaciones
  titulo('Borrado en la base de datos (transacción)');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const antes = {};
    for (const t of TABLAS_INTACTAS) if (await existeTabla(client, t)) antes[t] = await contar(client, t);

    for (const t of TABLAS_A_LIMPIAR) {
      if (!(t.tabla in estado.tablas)) continue;
      const r = await client.query(`DELETE FROM ${t.tabla}`);
      informe.eliminados[t.tabla] = r.rowCount;
      linea(`  ${t.modulo.padEnd(28)} eliminados: ${r.rowCount}`);
    }

    for (const t of TABLAS_A_LIMPIAR) {
      if (!(t.tabla in estado.tablas)) continue;
      const n = await contar(client, t.tabla);
      if (n !== 0) throw new Error(`Verificación fallida: ${t.tabla} aún tiene ${n} registros.`);
    }
    for (const t of Object.keys(antes)) {
      const n = await contar(client, t);
      informe.conservados[t] = n;
      if (n !== antes[t]) throw new Error(`Verificación fallida: la tabla ${t} cambió (${antes[t]} -> ${n}). Se revierte todo.`);
    }
    await client.query('COMMIT');
    linea('  ✅ Transacción confirmada.');
  } catch (e) {
    await client.query('ROLLBACK');
    console.error(`\n❌ ${e.message}\n   Se revirtió la transacción: la base de datos quedó como estaba.`);
    informe.error = e.message;
    fs.writeFileSync(path.join(carpetaRespaldo, 'informe.json'), JSON.stringify(informe, null, 2));
    return 1;
  } finally {
    client.release();
  }

  // 3) Reinicio opcional de folios (solo si se pidió)
  if (tiene('--reiniciar-folios')) {
    for (const t of TABLAS_A_LIMPIAR) {
      if (!(t.tabla in estado.tablas)) continue;
      await pool.query('SELECT setval(pg_get_serial_sequence($1, $2), 1, false)', [`public.${t.tabla}`, t.pk]);
    }
    informe.foliosReiniciados = true;
    linea('  ✅ Los folios e IDs volverán a empezar en 1.');
  }

  // 4) Eliminación de los archivos verificados (solo los del manifiesto)
  titulo('Eliminación de archivos verificados');
  const lista = [
    ...manifiesto.expedientes.map((n) => ({ contenedor: 'expedientes', nombre: n })),
    ...manifiesto.inventario.map((n) => ({ contenedor: 'inventario', nombre: n }))
  ];
  for (const f of lista) {
    try {
      if (faltantes.some((x) => x.contenedor === f.contenedor && x.nombre === f.nombre)) { informe.archivos.noEncontrados.push(`${f.contenedor}/${f.nombre}`); continue; }
      await storage.borrar(f.contenedor, f.nombre);
      informe.archivos.eliminados++;
    } catch (e) {
      informe.archivos.errores.push(`${f.contenedor}/${f.nombre}: ${e.message}`);
    }
  }
  linea(`  Eliminados: ${informe.archivos.eliminados}   No encontrados: ${informe.archivos.noEncontrados.length}   Errores: ${informe.archivos.errores.length}`);

  informe.noTocados = {
    referenciasNoReconocidas: manifiesto.referenciasNoReconocidas,
    archivosSinExpediente: sinReferencia,
    terreno: estado.intactas.terreno ?? null,
    bitacoraAuditoria: estado.bitacora
  };
  fs.writeFileSync(path.join(carpetaRespaldo, 'informe.json'), JSON.stringify(informe, null, 2));
  titulo('Listo');
  linea(`  Informe y copia de archivos en: ${carpetaRespaldo}`);
  linea('  Ahora ejecuta:  node limpieza-controlada.js --verificar');
  return 0;
}

async function verificar() {
  const e = await revisar(pool);
  imprimirRevision(e);
  titulo('Resultado de la verificación');
  let bien = true;
  for (const t of TABLAS_A_LIMPIAR) {
    if (!(t.tabla in e.tablas)) { linea(`  ⚠️ ${t.tabla}: no existe en esta base`); continue; }
    const vacia = e.tablas[t.tabla] === 0;
    if (!vacia) bien = false;
    linea(`  ${vacia ? '✅' : '❌'} ${t.tabla}: ${e.tablas[t.tabla]} registros`);
  }
  linea(e.dependenciasInesperadas.length ? '  ⚠️ Hay dependencias no contempladas (ver arriba).' : '  ✅ Las llaves foráneas siguen definidas y sin tablas dependientes inesperadas.');
  linea(`  ✅ Usuarios: ${e.intactas.usuario ?? '—'}   Clientes: ${e.intactas.cliente ?? '—'} (no se tocan)`);
  return bien ? 0 : 1;
}

(async () => {
  let codigo = 1;
  try {
    if (tiene('--ejecutar')) codigo = await ejecutar();
    else if (tiene('--verificar')) codigo = await verificar();
    else if (tiene('--revisar')) {
      const e = await revisar(pool);
      imprimirRevision(e);
      const m = await construirManifiesto(pool);
      const sin = archivosSinReferencia(m);
      titulo('Archivos físicos asociados');
      linea(`  Documentos de expedientes: ${m.expedientes.length}   Documentos del inventario: ${m.inventario.length}`);
      if (m.referenciasNoReconocidas.length) linea(`  Referencias no reconocidas (no se tocarían): ${m.referenciasNoReconocidas.length}`);
      if (sin) linea(`  Archivos en uploads/ sin expediente (no se tocarían): ${sin.length}`);
      linea('\nNo se modificó nada. Para limpiar usa --ejecutar (lee las instrucciones al inicio de este archivo).');
      codigo = e.dependenciasInesperadas.length ? 1 : 0;
    } else {
      linea('Indica una opción: --revisar | --ejecutar --respaldo-bd "<archivo>" | --verificar');
    }
  } catch (e) {
    console.error(`\n❌ Error inesperado: ${e.message}`);
    codigo = 1;
  } finally {
    await pool.end().catch(() => {});
  }
  process.exit(codigo);
})();
