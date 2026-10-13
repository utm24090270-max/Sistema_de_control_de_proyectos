const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const storage = require('./storage');
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
require('dotenv').config(); // IMPORTANTE: antes de './db' para que db.js vea las variables del .env
const pool = require('./db');

// Validación crítica de JWT_SECRET
if (!process.env.JWT_SECRET) {
  console.error('❌ ERROR CRÍTICO: JWT_SECRET no está configurado en el archivo .env');
  process.exit(1);
}

const app = express();

// Detrás del proxy de Azure App Service (necesario para HTTPS y para limitar por IP real)
app.set('trust proxy', 1);

// Cabeceras de seguridad (npm install helmet). Si no está instalado, el servidor sigue funcionando.
try {
  const helmet = require('helmet');
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
} catch (e) {
  console.warn('⚠️ helmet no está instalado: ejecuta "npm install helmet" antes de desplegar.');
}

// CORS: solo los orígenes permitidos (variable CORS_ORIGIN, separados por coma).
// Sin la variable, solo se permite el frontend local de desarrollo.
const ORIGENES_PERMITIDOS = (process.env.CORS_ORIGIN || 'http://localhost:5173,http://127.0.0.1:5173')
  .split(',').map((o) => o.trim()).filter(Boolean);
app.use(cors({
  origin: (origin, cb) => cb(null, !origin || ORIGENES_PERMITIDOS.includes(origin)) // sin origin = herramientas/servidor
}));
app.use(express.json());

// Límite de intentos en login y registro (npm install express-rate-limit)
let limitarAutenticacion = (req, res, next) => next();
try {
  const { rateLimit } = require('express-rate-limit');
  limitarAutenticacion = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 30,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'Demasiados intentos. Intenta de nuevo en unos minutos.' }
  });
} catch (e) {
  console.warn('⚠️ express-rate-limit no está instalado: ejecuta "npm install express-rate-limit" antes de desplegar.');
}

// En producción no se devuelven detalles internos (mensajes de SQL, etc.) al cliente
const detalleError = (err) => (process.env.NODE_ENV === 'production' ? undefined : err.message);

// ==========================================
// MIDDLEWARES DE SEGURIDAD (JWT Y ROLES)
// ==========================================
const verificarToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Formato: "Bearer TOKEN"

  if (!token) {
    return res.status(401).json({ error: 'Acceso denegado: Token no proporcionado' });
  }

  try {
    const usuarioVerificado = jwt.verify(token, process.env.JWT_SECRET);
    req.usuario = usuarioVerificado;
    next();
  } catch (err) {
    res.status(403).json({ error: 'Token inválido o expirado' });
  }
};

// Middleware para verificar permisos específicos según el rol
const verificarRol = (rolesPermitidos) => {
  return (req, res, next) => {
    const rolUsuario = req.usuario?.rol?.toUpperCase();
    const permitido = rolesPermitidos.some(rol => rol.toUpperCase() === rolUsuario);

    if (!permitido) {
      return res.status(403).json({ error: 'No tienes permisos para realizar esta acción' });
    }
    next();
  };
};

// Asegurar que exista la carpeta de subidas (multer no la crea solo)
const UPLOADS_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const ROLES_STAFF = ['ADMIN', 'ADMINISTRADOR', 'ASESOR'];
const esStaff = (usuario) => ROLES_STAFF.includes(usuario?.rol?.toUpperCase());

// Un CLIENTE solo puede tocar expedientes ligados a su propio id_cliente
const puedeAccederProceso = (usuario, idClienteDelProceso) =>
  esStaff(usuario) || (usuario?.id_cliente && Number(usuario.id_cliente) === Number(idClienteDelProceso));

// ------------------------------------------------------------------
// CÓDIGO DE INVENTARIO DE LOTES
//   [2 letras del fraccionamiento o condominio] - M-[manzana] - L-[lote]
//   Fraccionamiento Las Palmas, manzana 05, lote 12   -> LP-M-05-L-12
//   Condominio Los Encinos,     manzana 03, lote 08   -> LE-M-03-L-08
// ------------------------------------------------------------------
const PALABRAS_TIPO_INMUEBLE = ['FRACCIONAMIENTO', 'FRACC', 'CONDOMINIO', 'COND'];
// Nombres que significan "este lote no pertenece a un condominio"
const NOMBRES_SIN_CONDOMINIO = ['', 'NA', 'N A', 'NO APLICA', 'NINGUNO', 'NINGUNA', 'SIN CONDOMINIO', 'GENERAL', 'UNICO'];

const limpiarTexto = (t) =>
  String(t ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')   // quita acentos
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();

// "Las Palmas" -> LP | "Condominio Los Encinos" -> LE | "Palmas" -> PA
const siglasNombre = (nombre) => {
  const palabras = limpiarTexto(nombre).split(' ').filter(Boolean);
  while (palabras.length > 1 && PALABRAS_TIPO_INMUEBLE.includes(palabras[0])) palabras.shift();
  if (palabras.length === 0) return '';
  if (palabras.length === 1) return palabras[0].slice(0, 2);
  return palabras[0][0] + palabras[1][0];
};

const esCondominioReal = (nombreCondominio) => !NOMBRES_SIN_CONDOMINIO.includes(limpiarTexto(nombreCondominio));

// Números: 5 -> "05" | "05" -> "05" | "M-5" -> "05" | "A" -> "A"
const formatoNumero = (valor, prefijosPermitidos) => {
  let v = String(valor ?? '').trim();
  if (!v) return '';
  const m = v.match(new RegExp(`^(?:${prefijosPermitidos})[\\s.\\-]*(\\d+)$`, 'i'));
  if (m) v = m[1];
  return /^\d+$/.test(v) ? v.padStart(2, '0') : v.toUpperCase();
};

const generarCodigoInventario = ({ fraccionamiento, condominio, num_manzana, num_lote }) => {
  const prefijo = esCondominioReal(condominio) ? siglasNombre(condominio) : siglasNombre(fraccionamiento);
  const manzana = formatoNumero(num_manzana, 'MANZANA|MZA|MZ|M');
  const lote = formatoNumero(num_lote, 'LOTE|LT|L');

  const partes = [];
  if (prefijo) partes.push(prefijo);
  if (manzana) partes.push(`M-${manzana}`);
  if (lote) partes.push(`L-${lote}`);
  return partes.join('-');
};

// ------------------------------------------------------------------
// ASIGNACIÓN DE LOTES (solo ADMIN / ASESOR, siempre desde el inventario)
// ------------------------------------------------------------------
const errorHttp = (status, mensaje) => {
  const e = new Error(mensaje);
  e.status = status;
  return e;
};

// Debe ejecutarse DENTRO de una transacción (recibe un client con BEGIN ya hecho).
//  - idLote = número -> asigna ese lote (debe estar DISPONIBLE) y libera el anterior
//  - idLote = null   -> libera el lote del expediente
// Guarda la referencia (id_lote) y el código de inventario (num_lote, para mostrarlo),
// y registra cada movimiento en asignacion_lote con el administrador que lo hizo.
async function asignarLoteAProceso(client, { idProceso, idLote, idAdmin, observaciones }) {
  const procRes = await client.query(
    'SELECT id_lote, id_terreno FROM proceso_venta WHERE id_proceso = $1 FOR UPDATE',
    [idProceso]
  );
  if (procRes.rows.length === 0) throw errorHttp(404, 'Expediente no encontrado');

  const prevLote = procRes.rows[0].id_lote;
  const prevTerreno = procRes.rows[0].id_terreno; // asignaciones hechas con la versión anterior (tabla terreno)
  const nuevoId = idLote === null || idLote === undefined || idLote === '' ? null : parseInt(idLote, 10);
  if (nuevoId !== null && Number.isNaN(nuevoId)) throw errorHttp(400, 'Lote inválido.');

  // Sin cambios
  if (prevLote === nuevoId) return { id_lote: nuevoId, codigo: null, cambio: false };

  const liberarAnteriores = async () => {
    if (prevLote) {
      await client.query(`UPDATE lote SET estado = 'DISPONIBLE' WHERE id_lote = $1 AND estado = 'ASIGNADO'`, [prevLote]);
    }
    if (prevTerreno) {
      await client.query(`UPDATE terreno SET estado = 'DISPONIBLE' WHERE id_terreno = $1 AND estado = 'RESERVADO'`, [prevTerreno]);
    }
  };

  // Liberar
  if (nuevoId === null) {
    await liberarAnteriores();
    await client.query('UPDATE proceso_venta SET id_lote = NULL, id_terreno = NULL, num_lote = NULL WHERE id_proceso = $1', [idProceso]);
    if (prevLote) {
      await client.query(
        `INSERT INTO asignacion_lote (id_proceso, id_lote, id_usuario_admin, accion, observaciones)
         VALUES ($1, $2, $3, 'LIBERAR', $4)`,
        [idProceso, prevLote, idAdmin, observaciones || null]
      );
    }
    return { id_lote: null, codigo: null, cambio: true };
  }

  // Asignar: se bloquea la fila del lote para evitar que dos admins tomen el mismo a la vez
  const loteRes = await client.query(
    `SELECT l.id_lote, l.num_lote, l.estado, l.codigo_inventario, m.num_manzana,
            c.nombre AS condominio, f.nombre AS fraccionamiento
     FROM lote l
     LEFT JOIN manzana m ON m.id_manzana = l.id_manzana
     LEFT JOIN condominio c ON c.id_condominio = m.id_condominio
     LEFT JOIN fraccionamiento f ON f.id_fraccionamiento = COALESCE(m.id_fraccionamiento, c.id_fraccionamiento)
     WHERE l.id_lote = $1
     FOR UPDATE OF l`,
    [nuevoId]
  );
  if (loteRes.rows.length === 0) throw errorHttp(404, 'El lote seleccionado no existe.');

  const l = loteRes.rows[0];
  const codigo = l.codigo_inventario || generarCodigoInventario(l);
  if (l.estado !== 'DISPONIBLE') {
    throw errorHttp(409, `El lote ${codigo} ya no está disponible.`);
  }

  await liberarAnteriores();
  await client.query(`UPDATE lote SET estado = 'ASIGNADO' WHERE id_lote = $1`, [nuevoId]);
  await client.query(
    'UPDATE proceso_venta SET id_lote = $1, id_terreno = NULL, num_lote = $2 WHERE id_proceso = $3',
    [nuevoId, codigo, idProceso]
  );
  await client.query(
    `INSERT INTO asignacion_lote (id_proceso, id_lote, id_usuario_admin, accion, observaciones)
     VALUES ($1, $2, $3, 'ASIGNAR', $4)`,
    [idProceso, nuevoId, idAdmin, observaciones || null]
  );

  return { id_lote: nuevoId, codigo, cambio: true };
}

// ------------------------------------------------------------------
// MÓDULO DE INVENTARIO: helpers compartidos
// ------------------------------------------------------------------
const ROLES_ADMIN = ['ADMIN', 'ADMINISTRADOR'];
const esAdminInventario = (usuario) => ROLES_ADMIN.includes(usuario?.rol?.toUpperCase());
const empresaDe = (req) => Number(req.usuario?.id_empresa) || null;      // filtro (null = sin filtro)
const empresaAlta = (req) => Number(req.usuario?.id_empresa) || 1;       // empresa al crear registros

// Orden natural: fraccionamiento, condominio, manzana (numérica) y lote (numérico)
const ORDEN_LOTES_SQL = `v.fraccionamiento, v.condominio,
  CASE WHEN v.num_manzana ~ '^[0-9]+$' THEN v.num_manzana::int END, v.num_manzana,
  CASE WHEN v.num_lote ~ '^[0-9]+$' THEN v.num_lote::int END, v.num_lote`;

// Un condominio "N/A" / "Sin condominio" se informa como null; el código se toma del lote o se genera.
const normalizarLote = (r) => {
  const condominio = esCondominioReal(r.condominio) ? r.condominio : null;
  return {
    ...r,
    condominio,
    codigo_inventario: r.codigo_inventario || generarCodigoInventario({ ...r, condominio })
  };
};

const nombreTitular = (r) =>
  r.es_para_tercero && r.tercero_nombre_completo
    ? r.tercero_nombre_completo
    : `${r.cliente_nombre || ''} ${r.cliente_apellido || ''}`.trim();

// Busca otro fraccionamiento/condominio de la misma empresa cuyo identificador de 2 letras sea igual
// (generaría códigos ambiguos, p. ej. "Las Palmas" y "La Pradera" -> LP).
async function buscarConflictoSiglas(db, idEmpresa, nombre) {
  const siglas = siglasNombre(nombre);
  const frs = await db.query('SELECT nombre FROM fraccionamiento WHERE id_empresa = $1', [idEmpresa]);
  const cds = await db.query(
    `SELECT c.nombre FROM condominio c
     JOIN fraccionamiento f ON f.id_fraccionamiento = c.id_fraccionamiento
     WHERE f.id_empresa = $1`, [idEmpresa]);
  const existentes = [...frs.rows.map(r => r.nombre), ...cds.rows.map(r => r.nombre).filter(esCondominioReal)];
  const choque = existentes.find((n) => limpiarTexto(n) !== limpiarTexto(nombre) && siglasNombre(n) === siglas);
  return choque ? { siglas, nombre: choque } : null;
}

// Devuelve la manzana con su ubicación ya resuelta (escenario A o B)
async function cargarManzana(db, idManzana) {
  const r = await db.query(
    `SELECT m.id_manzana, m.num_manzana, m.id_condominio, c.nombre AS condominio,
            f.id_fraccionamiento, f.nombre AS fraccionamiento, f.id_empresa
     FROM manzana m
     LEFT JOIN condominio c ON c.id_condominio = m.id_condominio
     JOIN fraccionamiento f ON f.id_fraccionamiento = COALESCE(m.id_fraccionamiento, c.id_fraccionamiento)
     WHERE m.id_manzana = $1`, [idManzana]);
  if (r.rows.length === 0) return null;
  const m = r.rows[0];
  const real = esCondominioReal(m.condominio);
  return { ...m, id_condominio_real: real ? m.id_condominio : null, condominio: real ? m.condominio : null };
}

const textoObligatorio = (v, campo, max) => {
  const t = String(v ?? '').trim();
  if (!t) throw errorHttp(400, `${campo} es obligatorio.`);
  if (t.length > max) throw errorHttp(400, `${campo} no puede exceder ${max} caracteres.`);
  return t;
};

const responderError = (res, err, mensajeGenerico) => {
  if (err.status) return res.status(err.status).json({ error: err.message });
  if (err.code === '23505') return res.status(409).json({ error: 'Ya existe un registro con esos datos (duplicado).' });
  console.error(`❌ ${mensajeGenerico}:`, err.message);
  return res.status(500).json({ error: mensajeGenerico });
};

// Completa el código de inventario de los lotes que aún no lo tienen (no cambia los ya guardados)
async function completarCodigosInventario() {
  try {
    const r = await pool.query('SELECT * FROM v_lote_inventario WHERE codigo_inventario IS NULL');
    for (const fila of r.rows) {
      if (!fila.fraccionamiento || !fila.num_manzana) continue;
      const codigo = normalizarLote(fila).codigo_inventario;
      try {
        await pool.query('UPDATE lote SET codigo_inventario = $1 WHERE id_lote = $2 AND codigo_inventario IS NULL', [codigo, fila.id_lote]);
      } catch (e) {
        if (e.code === '23505') console.warn(`⚠️ Código ${codigo} repetido (lote ${fila.id_lote}): hay nombres con las mismas siglas. Revisa el inventario.`);
        else throw e;
      }
    }
  } catch (e) {
    console.warn('⚠️ No se pudieron completar los códigos de inventario (¿ejecutaste Inventario_modulo.sql?):', e.message);
  }
}

// IMPORTANTE: la carpeta uploads/ YA NO se sirve de forma pública.
// Los documentos se consultan solo con GET /api/procesos-venta/:id/documento/:tipo (token + permisos).

// ---------- Recepción y validación de archivos (compartido por expedientes e inventario) ----------
const DOC_MAX_BYTES = 10 * 1024 * 1024; // 10 MB
const DOC_FORMATOS = {
  '.pdf': 'application/pdf',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png'
};

// Detecta el tipo REAL del archivo por su contenido (no por el nombre que trae).
// Devuelve '.pdf', '.png', '.jpg' o null si no es ninguno de los permitidos.
// Así un JPG guardado con nombre "documento.pdf" se acepta con su tipo correcto,
// y un ejecutable o una página web renombrados se rechazan.
const detectarExtensionReal = (buffer) => {
  if (!buffer || buffer.length < 8) return null;
  // PDF: la marca %PDF- puede aparecer dentro de los primeros 1024 bytes (así lo acepta Acrobat)
  if (buffer.slice(0, 1024).toString('latin1').includes('%PDF-')) return '.pdf';
  if (buffer.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return '.png';
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return '.jpg';
  return null;
};

const MENSAJE_ARCHIVO_INVALIDO =
  'El archivo no es un PDF, JPG o PNG válido. Si es una página web o un documento de otro tipo, conviértelo a PDF, JPG o PNG e inténtalo de nuevo.';

// El archivo llega en memoria (máx. 10 MB); la capa de almacenamiento decide dónde guardarlo
const recibirEnMemoria = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: DOC_MAX_BYTES, files: 1 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (DOC_FORMATOS[ext] !== file.mimetype) {
      return cb(errorHttp(400, 'Formato no permitido. Solo se aceptan archivos PDF, JPG o PNG.'));
    }
    cb(null, true);
  }
});

const recibirArchivo = (campo) => (req, res, next) =>
  recibirEnMemoria.single(campo)(req, res, (err) => {
    if (!err) return next();
    if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'El archivo excede el tamaño máximo de 10 MB.' });
    if (err.status) return res.status(err.status).json({ error: err.message });
    return res.status(400).json({ error: 'No se pudo recibir el archivo.' });
  });

// ==========================================
// RUTAS DE AUTENTICACIÓN (LOGIN Y REGISTRO)
// ==========================================

// POST: Registrar un nuevo usuario + cliente + expediente inicial de compra
app.post('/api/auth/registro', limitarAutenticacion, async (req, res) => {
  const { nombre, apellido, email, password, telefono, curp, rfc, direccion, tipo_construccion, institucion_financiera, id_empresa } = req.body;
  // El registro público NUNCA asigna lote: lo asigna un ADMIN/ASESOR después
  const id_terreno = null;
  const empresaID = id_empresa || 1;
  
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Encriptar contraseña
    const saltRounds = 10;
    const password_hash = await bcrypt.hash(password, saltRounds);

    // 2. Insertar en la tabla usuario (Rol por defecto: CLIENTE)
    const newUserResult = await client.query(
      `INSERT INTO usuario (id_empresa, nombre, email, password_hash, rol)
       VALUES ($1, $2, $3, $4, 'CLIENTE') 
       RETURNING id_usuario, nombre, email, rol`,
      [empresaID, `${nombre} ${apellido || ''}`.trim(), email, password_hash]
    );
    const nuevoUsuario = newUserResult.rows[0];

    // 3. Insertar en la tabla cliente
    const newClientResult = await client.query(
      `INSERT INTO cliente (id_empresa, id_usuario, nombre, apellido, curp, rfc, direccion, email, telefono)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) 
       RETURNING id_cliente, telefono`,
      [
        empresaID, 
        nuevoUsuario.id_usuario, 
        nombre, 
        apellido || '', 
        curp || null, 
        rfc || null, 
        direccion || null, 
        email, 
        telefono || null
      ]
    );
    const id_cliente = newClientResult.rows[0].id_cliente;

    // 4. Crear expediente inicial en proceso_venta sin forzar tipo ni financiamiento
    await client.query(
      `INSERT INTO proceso_venta (id_cliente, id_terreno, tipo_construccion, institucion_financiera, etapa_actual, rutas_documentos, estados_binarios, activo)
       VALUES ($1, $2, $3, $4, 'Evaluación', '{}'::jsonb, '{}'::jsonb, true)`,
      [
        id_cliente, 
        id_terreno || null, 
        tipo_construccion || null,
        institucion_financiera || null
      ]
    );

    if (id_terreno) {
      await client.query(`UPDATE terreno SET estado = 'RESERVADO' WHERE id_terreno = $1`, [id_terreno]);
    }

    await client.query('COMMIT');

    res.status(201).json({
      mensaje: 'Usuario, cliente y expediente registrados correctamente',
      usuario: nuevoUsuario,
      id_cliente
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Error detallado en registro:', err.message);
    
    let mensajeError = 'Error al registrar el usuario';
    if (err.message.includes('duplicate key') || err.code === '23505') {
      mensajeError = 'El correo electrónico ya está registrado';
    } else if (err.message.includes('violates foreign key constraint') || err.code === '23503') {
      mensajeError = 'Error de referencia en base de datos. Verifica que exista la empresa (id_empresa = 1).';
    }

    res.status(500).json({ error: mensajeError });
  } finally {
    client.release();
  }
});

// POST: Iniciar sesión (Login)
app.post('/api/auth/login', limitarAutenticacion, async (req, res) => {
  const { email, password } = req.body;
  try {
    const userResult = await pool.query(
      `SELECT u.*, 
              COALESCE(c.id_cliente, NULL) AS id_cliente, 
              COALESCE(c.telefono, '') AS telefono, 
              COALESCE(c.curp, '') AS curp, 
              COALESCE(c.rfc, '') AS rfc, 
              COALESCE(c.direccion, '') AS direccion, 
              c.nombre AS cliente_nombre, 
              c.apellido AS cliente_apellido 
       FROM usuario u 
       LEFT JOIN cliente c ON (u.id_usuario = c.id_usuario OR u.email = c.email)
       WHERE u.email = $1`, 
      [email]
    );

    if (userResult.rows.length === 0) {
      return res.status(400).json({ error: 'Credenciales inválidas' });
    }

    const user = userResult.rows[0];

    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return res.status(400).json({ error: 'Credenciales inválidas' });
    }

    const token = jwt.sign(
      { 
        id_usuario: user.id_usuario, 
        id_cliente: user.id_cliente,
        rol: user.rol, 
        id_empresa: user.id_empresa,
        email: user.email
      },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );

    res.json({
      token,
      usuario: {
        id_usuario: user.id_usuario,
        id_cliente: user.id_cliente || null,
        nombre: user.nombre,
        // Nombre completo real: el del cliente (nombre + apellido) si existe; si no, el de la cuenta
        nombre_completo: user.cliente_nombre
          ? `${user.cliente_nombre} ${user.cliente_apellido || ''}`.trim()
          : user.nombre,
        email: user.email,
        telefono: user.telefono || '',
        curp: user.curp || '',
        rfc: user.rfc || '',
        direccion: user.direccion || '',
        rol: user.rol
      }
    });
  } catch (err) {
    console.error('❌ Error en login:', err.message);
    res.status(500).json({ error: 'Error en el inicio de sesión' });
  }
});

// ==========================================
// RUTAS PÚBLICAS / SALUD
// ==========================================

app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'Servidor activo - Constructora Proyecto 20' });
});

// ==========================================
// RUTAS DE CLIENTES
// ==========================================

app.get('/api/clientes', verificarToken, verificarRol(ROLES_STAFF), async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM cliente ORDER BY id_cliente DESC');
    res.json(result.rows);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Error al consultar los clientes' });
  }
});

app.post('/api/clientes', verificarToken, verificarRol(ROLES_STAFF), async (req, res) => {
  const { id_empresa, nombre, apellido, curp, rfc, direccion, email, telefono } = req.body;
  try {
    const newClient = await pool.query(
      `INSERT INTO cliente (id_empresa, nombre, apellido, curp, rfc, direccion, email, telefono)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [id_empresa || 1, nombre, apellido, curp || null, rfc || null, direccion || null, email, telefono || null]
    );
    res.status(201).json(newClient.rows[0]);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Error al registrar el cliente' });
  }
});

app.put('/api/clientes/:id', verificarToken, verificarRol(ROLES_STAFF), async (req, res) => {
  const { id } = req.params;
  const { nombre, apellido, curp, rfc, direccion, email, telefono } = req.body;

  try {
    const updateResult = await pool.query(
      `UPDATE cliente 
       SET nombre = COALESCE(NULLIF($1, ''), nombre),
           apellido = COALESCE(NULLIF($2, ''), apellido),
           curp = COALESCE(NULLIF($3, ''), curp),
           rfc = COALESCE(NULLIF($4, ''), rfc),
           direccion = COALESCE(NULLIF($5, ''), direccion),
           email = COALESCE(NULLIF($6, ''), email),
           telefono = COALESCE(NULLIF($7, ''), telefono)
       WHERE id_cliente = $8 RETURNING *`,
      [nombre, apellido, curp, rfc, direccion, email, telefono, id]
    );

    if (updateResult.rows.length === 0) {
      return res.status(404).json({ error: 'Cliente no encontrado' });
    }

    res.json({
      mensaje: 'Cliente actualizado correctamente',
      cliente: updateResult.rows[0]
    });
  } catch (err) {
    console.error('❌ Error al actualizar cliente:', err.message);
    res.status(500).json({ error: 'Error al actualizar datos del cliente' });
  }
});

// ==========================================
// RUTAS PARA TERRENOS / PROPIEDADES
// ==========================================

app.get('/api/terrenos', verificarToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM terreno ORDER BY manzana ASC, num_lote ASC');
    res.json(result.rows);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Error al consultar terrenos' });
  }
});

// Lotes DISPONIBLES del inventario (fraccionamiento > [condominio] > manzana > lote),
// con su código de inventario. /api/lotes/disponibles: solo ADMIN / ASESOR (asignación directa).
// /api/inventario/disponibles: cualquier usuario autenticado (para solicitar un lote).
const consultarLotesDisponibles = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT v.* FROM v_lote_inventario v
       WHERE v.estado = 'DISPONIBLE'
         AND ($1::int IS NULL OR v.id_empresa = $1)
       ORDER BY ${ORDEN_LOTES_SQL}`,
      [empresaDe(req)]
    );
    res.json(result.rows.map(normalizarLote));
  } catch (err) {
    console.error('❌ Error al consultar lotes disponibles:', err.message);
    res.status(500).json({ error: 'Error al consultar lotes disponibles' });
  }
};
app.get('/api/lotes/disponibles', verificarToken, verificarRol(ROLES_STAFF), consultarLotesDisponibles);

app.post('/api/terrenos', verificarToken, verificarRol(['ADMIN', 'ADMINISTRADOR', 'ASESOR']), async (req, res) => {
  const { id_empresa, num_lote, manzana, m2, precio, estado } = req.body;
  try {
    const newTerreno = await pool.query(
      `INSERT INTO terreno (id_empresa, num_lote, manzana, m2, precio, estado)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [id_empresa || 1, num_lote, manzana, m2, precio, estado || 'DISPONIBLE']
    );
    res.status(201).json(newTerreno.rows[0]);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Error al registrar terreno' });
  }
});

// ==========================================
// RUTAS PARA PROCESOS DE VENTA (EXPEDIENTES)
// ==========================================

app.get('/api/procesos-venta', verificarToken, async (req, res) => {
  try {
    let id_cliente = req.usuario.id_cliente;
    const { rol, id_usuario, email } = req.usuario;
    const esAdmin = ['ADMIN', 'ADMINISTRADOR', 'ASESOR'].includes(rol?.toUpperCase());

    if (!esAdmin && !id_cliente && id_usuario) {
      const cRes = await pool.query('SELECT id_cliente FROM cliente WHERE id_usuario = $1 OR email = $2', [id_usuario, email]);
      if (cRes.rows.length > 0) id_cliente = cRes.rows[0].id_cliente;
    }

    let query = `
      SELECT 
        pv.id_proceso,
        pv.id_cliente,
        pv.id_terreno,
        pv.id_lote,
        lo.estado AS lote_estado,
        c.nombre AS cliente_nombre,
        c.apellido AS cliente_apellido,
        c.email AS cliente_email,
        COALESCE(c.telefono, '') AS cliente_telefono,
        COALESCE(c.telefono, '') AS telefono,
        COALESCE(c.curp, '') AS curp,
        COALESCE(c.rfc, '') AS rfc,
        COALESCE(c.direccion, '') AS direccion,
        COALESCE(pv.num_lote, t.num_lote, '') AS num_lote,
        COALESCE(t.manzana, '') AS manzana,
        pv.tipo_construccion,
        pv.institucion_financiera,
        COALESCE(pv.es_para_tercero, false) AS es_para_tercero,
        pv.tercero_nombre_completo,
        pv.tercero_telefono,
        pv.tercero_email,
        pv.tercero_curp,
        pv.tercero_rfc,
        pv.tercero_direccion,
        COALESCE(pv.etapa_actual, 'Evaluación') AS etapa_actual,
        COALESCE(pv.rutas_documentos, '{}'::jsonb) AS rutas_documentos,
        COALESCE(pv.estados_binarios, '{}'::jsonb) AS estados_binarios,
        COALESCE(pv.observaciones, '') AS observaciones,
        COALESCE(pv.activo, true) AS activo,
        pv.created_at
      FROM proceso_venta pv
      JOIN cliente c ON pv.id_cliente = c.id_cliente
      LEFT JOIN terreno t ON pv.id_terreno = t.id_terreno
      LEFT JOIN lote lo ON lo.id_lote = pv.id_lote
      WHERE COALESCE(pv.activo, true) = true
    `;

    const params = [];

    if (!esAdmin) {
      query += ` AND pv.id_cliente = $1`;
      params.push(id_cliente || 0);
    }

    query += ` ORDER BY pv.id_proceso DESC`;

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error('❌ Error al consultar procesos de venta:', err.message);
    res.status(500).json({ error: 'Error al consultar los procesos de venta' });
  }
});

app.post('/api/procesos-venta/regenerar-cliente', verificarToken, async (req, res) => {
  let id_cliente = req.usuario.id_cliente;
  const { tipo_construccion, institucion_financiera } = req.body;

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    if (!id_cliente && req.usuario.id_usuario) {
      const clienteRes = await client.query(
        `SELECT id_cliente FROM cliente WHERE id_usuario = $1 OR email = $2`,
        [req.usuario.id_usuario, req.usuario.email]
      );
      if (clienteRes.rows.length > 0) {
        id_cliente = clienteRes.rows[0].id_cliente;
      }
    }

    if (!id_cliente) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'No se encontró el perfil de cliente asociado a esta cuenta.' });
    }

    const checkExpediente = await client.query(
      `SELECT id_proceso FROM proceso_venta 
       WHERE id_cliente = $1 AND COALESCE(activo, true) = true`,
      [id_cliente]
    );

    if (checkExpediente.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Ya cuentas con un expediente activo.' });
    }

    const nuevoProceso = await client.query(
      `INSERT INTO proceso_venta (id_cliente, id_terreno, tipo_construccion, institucion_financiera, etapa_actual, rutas_documentos, estados_binarios, activo)
       VALUES ($1, NULL, $2, $3, 'Evaluación', '{}'::jsonb, '{}'::jsonb, true)
       RETURNING *`,
      [
        id_cliente, 
        tipo_construccion || null, 
        institucion_financiera || null
      ]
    );

    await client.query('COMMIT');

    res.status(201).json({
      mensaje: 'Expediente generado exitosamente',
      expediente: nuevoProceso.rows[0]
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Error exacto al regenerar expediente:', err);
    res.status(500).json({ 
      error: 'Error al generar expediente', details: detalleError(err)
    });
  } finally {
    client.release();
  }
});

app.post('/api/procesos-venta/:id/documento', verificarToken, recibirArchivo('documento'), async (req, res) => {
  const { id } = req.params;
  const tipo_documento = String(req.body.tipo_documento || '').trim();
  let nombreNuevo = null;

  try {
    if (!req.file) throw errorHttp(400, 'No se ha adjuntado ningún archivo.');
    if (!tipo_documento || tipo_documento.length > 80 || ['__proto__', 'constructor', 'prototype'].includes(tipo_documento)) {
      throw errorHttp(400, 'Tipo de documento inválido.');
    }

    const procesoRes = await pool.query('SELECT rutas_documentos, id_cliente FROM proceso_venta WHERE id_proceso = $1', [id]);
    if (procesoRes.rows.length === 0) throw errorHttp(404, 'Expediente no encontrado.');
    if (!puedeAccederProceso(req.usuario, procesoRes.rows[0].id_cliente)) {
      throw errorHttp(403, 'No tienes permisos sobre este expediente.');
    }

    const ext = detectarExtensionReal(req.file.buffer);
    if (!ext) throw errorHttp(400, MENSAJE_ARCHIVO_INVALIDO);

    let rutasDocumentos = procesoRes.rows[0].rutas_documentos || {};
    if (typeof rutasDocumentos === 'string') rutasDocumentos = JSON.parse(rutasDocumentos);
    const anterior = rutasDocumentos[tipo_documento];

    // La ruta guardada conserva el formato histórico (/uploads/<archivo>) para no romper expedientes existentes
    nombreNuevo = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`;
    await storage.guardar('expedientes', nombreNuevo, req.file.buffer, DOC_FORMATOS[ext]);

    const rutaArchivo = `/uploads/${nombreNuevo}`;
    rutasDocumentos[tipo_documento] = rutaArchivo;

    await pool.query(
      'UPDATE proceso_venta SET rutas_documentos = $1::jsonb WHERE id_proceso = $2',
      [JSON.stringify(rutasDocumentos), id]
    );

    if (typeof anterior === 'string' && anterior.startsWith('/uploads/')) {
      storage.borrar('expedientes', path.basename(anterior)).catch((e) => console.error('⚠️ No se pudo borrar el archivo anterior:', e.message));
    }

    res.json({
      mensaje: 'Documento subido correctamente',
      tipo_documento,
      ruta: rutaArchivo,
      rutas_documentos: rutasDocumentos
    });
  } catch (err) {
    if (nombreNuevo) storage.borrar('expedientes', nombreNuevo).catch(() => {});
    responderError(res, err, 'Error al procesar el archivo en el servidor');
  }
});

// GET: Consultar un documento de un expediente (token + permisos; ya no hay URL pública)
app.get('/api/procesos-venta/:id/documento/:tipo', verificarToken, async (req, res) => {
  try {
    const r = await pool.query('SELECT rutas_documentos, id_cliente FROM proceso_venta WHERE id_proceso = $1', [parseInt(req.params.id, 10) || 0]);
    if (r.rows.length === 0) throw errorHttp(404, 'Expediente no encontrado.');
    if (!puedeAccederProceso(req.usuario, r.rows[0].id_cliente)) throw errorHttp(403, 'No tienes permisos sobre este expediente.');

    let rutas = r.rows[0].rutas_documentos || {};
    if (typeof rutas === 'string') rutas = JSON.parse(rutas);
    const ruta = Object.prototype.hasOwnProperty.call(rutas, req.params.tipo) ? rutas[req.params.tipo] : null;
    if (typeof ruta !== 'string' || !ruta.startsWith('/uploads/')) throw errorHttp(404, 'Documento no encontrado.');

    const nombre = path.basename(ruta);
    const flujo = await storage.abrir('expedientes', nombre);
    if (!flujo) throw errorHttp(404, 'El archivo ya no está disponible en el servidor.');

    const ext = path.extname(nombre).toLowerCase();
    const mime = DOC_FORMATOS[ext];
    const nombreDescarga = `${req.params.tipo}${ext}`.replace(/[\\/\u0000-\u001f]/g, '_');
    res.setHeader('Content-Type', mime || 'application/octet-stream');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Content-Disposition', `${mime ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(nombreDescarga)}`);
    flujo.on('error', () => { if (!res.headersSent) res.status(500).json({ error: 'No se pudo leer el archivo.' }); else res.destroy(); });
    flujo.pipe(res);
  } catch (err) {
    responderError(res, err, 'Error al consultar el documento');
  }
});

// POST: Crear un nuevo proceso de venta
//  - ADMIN / ASESOR: el expediente se crea a nombre del cliente capturado en el formulario
//    (se busca por email; si no existe, se crea).
//  - CLIENTE: el expediente SIEMPRE queda ligado a su propia cuenta (se ignora cualquier
//    id_cliente del body). Si es para otra persona, se marca es_para_tercero y se guardan
//    los datos del tercero en las columnas tercero_*.
app.post('/api/procesos-venta', verificarToken, async (req, res) => {
  const {
    id_cliente,
    nombre,
    apellido,
    email,
    telefono,
    curp,
    rfc,
    direccion,
    id_lote,
    tipo_construccion,
    institucion_financiera,
    etapa_actual,
    rutas_documentos,
    estados_binarios,
    es_para_tercero,
    tercero_nombre_completo,
    tercero_telefono,
    tercero_email
  } = req.body;

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const staff = esStaff(req.usuario);

    // Solo un ADMIN o ASESOR puede asignar un lote, y siempre desde el inventario
    const loteSolicitado = staff && id_lote ? parseInt(id_lote, 10) : null;

    const tipoConstruccionFinal = tipo_construccion || null;
    const institucionFinancieraFinal = institucion_financiera || null;
    const emailNormalizado = email ? String(email).trim().toLowerCase() : null;

    let clienteIDFinal = null;
    let marcarTercero = false;
    let datosTercero = { nombre: null, telefono: null, email: null, curp: null, rfc: null, direccion: null };

    if (staff) {
      // ---- STAFF: expediente a nombre del cliente capturado ----
      if (id_cliente) {
        const existePorId = await client.query('SELECT id_cliente FROM cliente WHERE id_cliente = $1', [id_cliente]);
        if (existePorId.rows.length === 0) {
          await client.query('ROLLBACK');
          return res.status(404).json({ error: 'El cliente indicado no existe.' });
        }
        clienteIDFinal = existePorId.rows[0].id_cliente;
      } else {
        if (!nombre || !emailNormalizado) {
          await client.query('ROLLBACK');
          return res.status(400).json({ error: 'Debes capturar al menos el nombre y el correo del cliente.' });
        }

        const existeCliente = await client.query('SELECT id_cliente FROM cliente WHERE LOWER(email) = $1', [emailNormalizado]);

        if (existeCliente.rows.length > 0) {
          clienteIDFinal = existeCliente.rows[0].id_cliente;
        } else {
          const nuevoCliente = await client.query(
            `INSERT INTO cliente (id_empresa, nombre, apellido, email, telefono, curp, rfc, direccion)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id_cliente`,
            [
              req.usuario.id_empresa || 1,
              nombre,
              apellido || '',
              emailNormalizado,
              telefono || null,
              curp || null,
              rfc || null,
              direccion || null
            ]
          );
          clienteIDFinal = nuevoCliente.rows[0].id_cliente;
        }
      }
    } else {
      // ---- CLIENTE: siempre su propia cuenta ----
      clienteIDFinal = req.usuario.id_cliente;

      if (!clienteIDFinal && req.usuario.id_usuario) {
        const cRes = await client.query(
          'SELECT id_cliente FROM cliente WHERE id_usuario = $1 OR email = $2',
          [req.usuario.id_usuario, req.usuario.email]
        );
        if (cRes.rows.length > 0) clienteIDFinal = cRes.rows[0].id_cliente;
      }

      if (es_para_tercero === true || es_para_tercero === 'true') {
        marcarTercero = true;
        const nombreCompletoForm = `${nombre || ''} ${apellido || ''}`.trim();
        datosTercero = {
          nombre: tercero_nombre_completo || nombreCompletoForm || null,
          telefono: tercero_telefono || telefono || null,
          email: tercero_email || emailNormalizado || null,
          curp: curp || null,
          rfc: rfc || null,
          direccion: direccion || null
        };

        if (!datosTercero.nombre) {
          await client.query('ROLLBACK');
          return res.status(400).json({ error: 'Debes indicar el nombre completo de la persona a nombre de quien va el expediente.' });
        }
      }
    }

    if (!clienteIDFinal) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'No se pudo asociar o crear el cliente para este expediente.' });
    }

    // Completar datos personales SOLO si el campo estaba vacío y los datos son del propio cliente.
    // Nunca se pisan los datos de la cuenta con los de un tercero.
    if (!marcarTercero && (curp || rfc || direccion || telefono)) {
      await client.query(
        `UPDATE cliente
         SET curp = COALESCE(NULLIF(curp, ''), NULLIF($1, '')),
             rfc = COALESCE(NULLIF(rfc, ''), NULLIF($2, '')),
             direccion = COALESCE(NULLIF(direccion, ''), NULLIF($3, '')),
             telefono = COALESCE(NULLIF(telefono, ''), NULLIF($4, ''))
         WHERE id_cliente = $5`,
        [curp || null, rfc || null, direccion || null, telefono || null, clienteIDFinal]
      );
    }

    const newProceso = await client.query(
      `INSERT INTO proceso_venta
         (id_cliente, id_terreno, num_lote, tipo_construccion, institucion_financiera,
          etapa_actual, rutas_documentos, estados_binarios, activo,
          es_para_tercero, tercero_nombre_completo, tercero_telefono, tercero_email,
          tercero_curp, tercero_rfc, tercero_direccion)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, true, $9, $10, $11, $12, $13, $14, $15)
       RETURNING *`,
      [
        clienteIDFinal,
        null, // el lote se asigna justo abajo con asignarLoteAProceso (valida y registra al admin)
        null,
        tipoConstruccionFinal,
        institucionFinancieraFinal,
        etapa_actual || 'Evaluación',
        '{}', // las rutas de documentos solo se crean al subir archivos, nunca desde el cuerpo de la petición
        JSON.stringify(estados_binarios || {}),
        marcarTercero,
        datosTercero.nombre,
        datosTercero.telefono,
        datosTercero.email,
        datosTercero.curp,
        datosTercero.rfc,
        datosTercero.direccion
      ]
    );

    if (loteSolicitado) {
      await asignarLoteAProceso(client, {
        idProceso: newProceso.rows[0].id_proceso,
        idLote: loteSolicitado,
        idAdmin: req.usuario.id_usuario,
        observaciones: 'Asignado al crear el expediente'
      });
    }

    await client.query('COMMIT');
    res.status(201).json(newProceso.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('❌ Error al crear proceso de venta:', err.message);
    res.status(500).json({ error: 'Error al iniciar el proceso de venta', details: detalleError(err) });
  } finally {
    client.release();
  }
});

// PUT: Asignar / cambiar / liberar el lote de un expediente (solo ADMIN / ASESOR)
// Body: { id_lote: <número> | null, observaciones?: string }
app.put('/api/procesos-venta/:id/lote', verificarToken, verificarRol(ROLES_STAFF), async (req, res) => {
  const { id } = req.params;
  const { id_lote, observaciones } = req.body;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const resultado = await asignarLoteAProceso(client, {
      idProceso: id,
      idLote: id_lote,
      idAdmin: req.usuario.id_usuario,
      observaciones
    });
    await client.query('COMMIT');

    res.json({
      mensaje: resultado.id_lote ? 'Lote asignado correctamente' : 'Lote liberado correctamente',
      id_proceso: Number(id),
      id_lote: resultado.id_lote,
      num_lote: resultado.codigo
    });
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('❌ Error al asignar lote:', err.message);
    res.status(500).json({ error: 'Error al asignar el lote', details: detalleError(err) });
  } finally {
    client.release();
  }
});

app.put('/api/procesos-venta/:id', verificarToken, async (req, res) => {
  const { id } = req.params;
  const { 
    etapa_actual, 
    tipo_construccion, 
    institucion_financiera, 
    estados_binarios, 
    rutas_documentos, 
    curp,
    rfc,
    direccion,
    telefono,
    tercero_nombre_completo,
    tercero_email,
    tercero_telefono,
    tercero_curp,
    tercero_rfc,
    tercero_direccion
  } = req.body;

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const procesoRes = await client.query('SELECT id_cliente, id_terreno, COALESCE(es_para_tercero, false) AS es_para_tercero FROM proceso_venta WHERE id_proceso = $1', [id]);
    if (procesoRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Expediente no encontrado' });
    }
    const { id_cliente, es_para_tercero } = procesoRes.rows[0];

    if (!puedeAccederProceso(req.usuario, id_cliente)) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'No tienes permisos sobre este expediente.' });
    }

    if (es_para_tercero) {
      // Expediente de tercero: los datos personales se guardan en las columnas tercero_* del expediente.
      // Nunca se sobrescriben los datos del cliente principal (cuenta que inició sesión).
      const camposTercero = {
        tercero_nombre_completo: tercero_nombre_completo,
        tercero_email: tercero_email,
        tercero_telefono: tercero_telefono,
        tercero_curp: tercero_curp,
        tercero_rfc: tercero_rfc,
        tercero_direccion: tercero_direccion
      };
      for (const [columna, valor] of Object.entries(camposTercero)) {
        if (valor === undefined) continue;
        const limpio = typeof valor === 'string' ? valor.trim() : valor;
        // El nombre del tercero es obligatorio: si llega vacío se conserva el actual.
        if (columna === 'tercero_nombre_completo' && !limpio) continue;
        // columna proviene de la lista fija de arriba (no de la petición), por eso es seguro interpolarla.
        await client.query(`UPDATE proceso_venta SET ${columna} = $1 WHERE id_proceso = $2`, [limpio || null, id]);
      }
    } else if (curp !== undefined || rfc !== undefined || direccion !== undefined || telefono !== undefined) {
      await client.query(
        `UPDATE cliente 
         SET curp = COALESCE(NULLIF($1, ''), curp),
             rfc = COALESCE(NULLIF($2, ''), rfc),
             direccion = COALESCE(NULLIF($3, ''), direccion),
             telefono = COALESCE(NULLIF($4, ''), telefono)
         WHERE id_cliente = $5`,
        [curp, rfc, direccion, telefono, id_cliente]
      );
    }

    if (tipo_construccion !== undefined) {
      await client.query('UPDATE proceso_venta SET tipo_construccion = $1 WHERE id_proceso = $2', [tipo_construccion || null, id]);
    }

    // El lote (num_lote / id_terreno) NO se modifica aquí. Se asigna únicamente con
    // PUT /api/procesos-venta/:id/lote (solo ADMIN/ASESOR), que valida disponibilidad y deja bitácora.

    if (institucion_financiera !== undefined) {
      await client.query('UPDATE proceso_venta SET institucion_financiera = $1 WHERE id_proceso = $2', [institucion_financiera || null, id]);
    }

    if (etapa_actual !== undefined) {
      await client.query('UPDATE proceso_venta SET etapa_actual = $1 WHERE id_proceso = $2', [etapa_actual, id]);
    }

    if (estados_binarios !== undefined) {
      await client.query('UPDATE proceso_venta SET estados_binarios = $1::jsonb WHERE id_proceso = $2', [JSON.stringify(estados_binarios), id]);
    }

    if (rutas_documentos !== undefined) {
      // Desde aquí solo se pueden QUITAR documentos. Agregar o cambiar una ruta ocurre únicamente
      // al subir un archivo; así nadie puede apuntar su expediente al archivo de otra persona.
      const actualRes = await client.query("SELECT COALESCE(rutas_documentos, '{}'::jsonb) AS rutas FROM proceso_venta WHERE id_proceso = $1", [id]);
      const actuales = actualRes.rows[0]?.rutas || {};
      const conservadas = {};
      for (const [clave, valor] of Object.entries(rutas_documentos || {})) {
        if (Object.prototype.hasOwnProperty.call(actuales, clave) && actuales[clave] === valor) conservadas[clave] = valor;
      }
      await client.query('UPDATE proceso_venta SET rutas_documentos = $1::jsonb WHERE id_proceso = $2', [JSON.stringify(conservadas), id]);
    }

    await client.query('COMMIT');

    const resultActualizado = await pool.query(`
      SELECT 
        pv.id_proceso,
        pv.id_cliente,
        pv.id_terreno,
        pv.id_lote,
        lo.estado AS lote_estado,
        c.nombre AS cliente_nombre,
        c.apellido AS cliente_apellido,
        c.email AS cliente_email,
        COALESCE(c.telefono, '') AS cliente_telefono,
        COALESCE(c.telefono, '') AS telefono,
        COALESCE(c.curp, '') AS curp,
        COALESCE(c.rfc, '') AS rfc,
        COALESCE(c.direccion, '') AS direccion,
        COALESCE(pv.num_lote, t.num_lote, '') AS num_lote,
        COALESCE(t.manzana, '') AS manzana,
        pv.tipo_construccion,
        pv.institucion_financiera,
        COALESCE(pv.es_para_tercero, false) AS es_para_tercero,
        pv.tercero_nombre_completo,
        pv.tercero_telefono,
        pv.tercero_email,
        pv.tercero_curp,
        pv.tercero_rfc,
        pv.tercero_direccion,
        COALESCE(pv.etapa_actual, 'Evaluación') AS etapa_actual,
        COALESCE(pv.rutas_documentos, '{}'::jsonb) AS rutas_documentos,
        COALESCE(pv.estados_binarios, '{}'::jsonb) AS estados_binarios,
        COALESCE(pv.observaciones, '') AS observaciones,
        COALESCE(pv.activo, true) AS activo,
        pv.created_at
      FROM proceso_venta pv
      JOIN cliente c ON pv.id_cliente = c.id_cliente
      LEFT JOIN terreno t ON pv.id_terreno = t.id_terreno
      LEFT JOIN lote lo ON lo.id_lote = pv.id_lote
      WHERE pv.id_proceso = $1
    `, [id]);

    res.json({ 
      mensaje: 'Expediente y cliente actualizados correctamente',
      expediente: resultActualizado.rows[0]
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Error al actualizar expediente:', err.message);
    res.status(500).json({ error: 'Error al actualizar el expediente', details: detalleError(err) });
  } finally {
    client.release();
  }
});

// DELETE: Eliminar expediente (Borrado Lógico) - Solo Admin / Asesor
app.delete('/api/procesos-venta/:id', verificarToken, verificarRol(['ADMIN', 'ADMINISTRADOR', 'ASESOR']), async (req, res) => {
  const { id } = req.params;

  try {
    const procesoRes = await pool.query('SELECT id_terreno, id_lote FROM proceso_venta WHERE id_proceso = $1', [id]);
    if (procesoRes.rows.length > 0 && procesoRes.rows[0].id_lote) {
      await pool.query("UPDATE lote SET estado = 'DISPONIBLE' WHERE id_lote = $1 AND estado = 'ASIGNADO'", [procesoRes.rows[0].id_lote]);
    }
    if (procesoRes.rows.length > 0 && procesoRes.rows[0].id_terreno) {
      await pool.query("UPDATE terreno SET estado = 'DISPONIBLE' WHERE id_terreno = $1", [procesoRes.rows[0].id_terreno]);
    }

    await pool.query('UPDATE proceso_venta SET activo = false WHERE id_proceso = $1', [id]);

    res.json({ mensaje: 'Expediente desactivado correctamente' });
  } catch (err) {
    console.error('❌ Error al desactivar expediente:', err.message);
    res.status(500).json({ error: 'Error al desactivar el expediente' });
  }
});

// POST: Agregar observaciones / mensajes en un expediente
app.post('/api/procesos-venta/:id/comentario', verificarToken, async (req, res) => {
  const { id } = req.params;
  const { comentario } = req.body;

  try {
    const procesoRes = await pool.query('SELECT observaciones, id_cliente FROM proceso_venta WHERE id_proceso = $1', [id]);
    if (procesoRes.rows.length === 0) {
      return res.status(404).json({ error: 'Expediente no encontrado' });
    }
    if (!puedeAccederProceso(req.usuario, procesoRes.rows[0].id_cliente)) {
      return res.status(403).json({ error: 'No tienes permisos sobre este expediente.' });
    }

    const fecha = new Date().toLocaleString('es-MX');
    const mensajeFormateado = `[${fecha}] (${req.usuario.rol}): ${comentario}`;
    const observacionesPrevias = procesoRes.rows[0].observaciones || '';
    const nuevasObservaciones = observacionesPrevias ? `${observacionesPrevias}\n${mensajeFormateado}` : mensajeFormateado;

    await pool.query(
      'UPDATE proceso_venta SET observaciones = $1 WHERE id_proceso = $2',
      [nuevasObservaciones, id]
    );

    res.json({ mensaje: 'Mensaje registrado con éxito', observaciones: nuevasObservaciones });
  } catch (err) {
    console.error('❌ Error al guardar comentario:', err.message);
    res.status(500).json({ error: 'Error al registrar el mensaje' });
  }
});

// ==========================================
// BITÁCORA DE AUDITORÍA
// ==========================================

app.get('/api/bitacora', verificarToken, verificarRol(['ADMIN', 'ADMINISTRADOR']), async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM bitacora_auditoria ORDER BY id_bitacora DESC');
    res.json(result.rows);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Error al consultar la bitácora' });
  }
});

// ==========================================
// MÓDULO DE INVENTARIO (ADMIN) Y SOLICITUDES DE LOTE
// ==========================================

// Estructura completa para los selectores en cascada (fraccionamiento > condominio > manzana)
app.get('/api/inventario/estructura', verificarToken, verificarRol(ROLES_ADMIN), async (req, res) => {
  try {
    const emp = empresaDe(req);
    const fr = await pool.query(
      `SELECT id_fraccionamiento, nombre, descripcion FROM fraccionamiento
       WHERE ($1::int IS NULL OR id_empresa = $1) ORDER BY nombre`, [emp]);
    const cd = await pool.query(
      `SELECT c.id_condominio, c.id_fraccionamiento, c.nombre
       FROM condominio c JOIN fraccionamiento f ON f.id_fraccionamiento = c.id_fraccionamiento
       WHERE ($1::int IS NULL OR f.id_empresa = $1) ORDER BY c.nombre`, [emp]);
    const mz = await pool.query(
      `SELECT m.id_manzana, m.num_manzana, m.id_condominio, c.nombre AS condominio,
              f.id_fraccionamiento
       FROM manzana m
       LEFT JOIN condominio c ON c.id_condominio = m.id_condominio
       JOIN fraccionamiento f ON f.id_fraccionamiento = COALESCE(m.id_fraccionamiento, c.id_fraccionamiento)
       WHERE ($1::int IS NULL OR f.id_empresa = $1)`, [emp]);

    const porNumero = (a, b) => String(a.num_manzana).localeCompare(String(b.num_manzana), 'es', { numeric: true });
    res.json({
      fraccionamientos: fr.rows.map(f => ({ ...f, siglas: siglasNombre(f.nombre) })),
      condominios: cd.rows.filter(c => esCondominioReal(c.nombre)).map(c => ({ ...c, siglas: siglasNombre(c.nombre) })),
      manzanas: mz.rows
        .map(m => ({
          id_manzana: m.id_manzana,
          num_manzana: m.num_manzana,
          id_fraccionamiento: m.id_fraccionamiento,
          id_condominio: esCondominioReal(m.condominio) ? m.id_condominio : null
        }))
        .sort(porNumero)
    });
  } catch (err) {
    responderError(res, err, 'Error al consultar la estructura del inventario');
  }
});

// Inventario completo con la asignación activa (expediente / titular), solo ADMIN
app.get('/api/inventario/lotes', verificarToken, verificarRol(ROLES_ADMIN), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT v.* FROM v_lote_inventario v
       WHERE ($1::int IS NULL OR v.id_empresa = $1)
       ORDER BY ${ORDEN_LOTES_SQL}`, [empresaDe(req)]);
    res.json(result.rows.map(normalizarLote));
  } catch (err) {
    responderError(res, err, 'Error al consultar el inventario');
  }
});

// Lotes disponibles para cualquier usuario autenticado (solicitar un lote)
app.get('/api/inventario/disponibles', verificarToken, consultarLotesDisponibles);

app.post('/api/inventario/fraccionamientos', verificarToken, verificarRol(ROLES_ADMIN), async (req, res) => {
  try {
    const nombre = textoObligatorio(req.body.nombre, 'El nombre del fraccionamiento', 150);
    const descripcion = String(req.body.descripcion ?? '').trim() || null;
    const idEmpresa = empresaAlta(req);

    if (siglasNombre(nombre).length !== 2) {
      throw errorHttp(400, 'El nombre debe tener al menos dos letras o números para generar su identificador de dos letras.');
    }
    const dup = await pool.query(
      'SELECT 1 FROM fraccionamiento WHERE id_empresa = $1 AND LOWER(nombre) = LOWER($2)', [idEmpresa, nombre]);
    if (dup.rows.length) throw errorHttp(409, 'Ya existe un fraccionamiento con ese nombre.');

    const conflicto = await buscarConflictoSiglas(pool, idEmpresa, nombre);
    if (conflicto) {
      throw errorHttp(409, `El identificador "${conflicto.siglas}" ya lo usa "${conflicto.nombre}". Con ambos nombres se generarían códigos de inventario repetidos; usa un nombre con otras iniciales.`);
    }

    const r = await pool.query(
      'INSERT INTO fraccionamiento (id_empresa, nombre, descripcion) VALUES ($1, $2, $3) RETURNING *',
      [idEmpresa, nombre, descripcion]);
    res.status(201).json({ ...r.rows[0], siglas: siglasNombre(nombre) });
  } catch (err) {
    responderError(res, err, 'Error al registrar el fraccionamiento');
  }
});

app.post('/api/inventario/condominios', verificarToken, verificarRol(ROLES_ADMIN), async (req, res) => {
  try {
    const idFracc = parseInt(req.body.id_fraccionamiento, 10);
    if (!idFracc) throw errorHttp(400, 'Debes seleccionar un fraccionamiento para registrar el condominio.');

    const nombre = textoObligatorio(req.body.nombre, 'El nombre del condominio', 150);
    if (!esCondominioReal(nombre)) throw errorHttp(400, 'Ese nombre no es válido para un condominio.');
    if (siglasNombre(nombre).length !== 2) {
      throw errorHttp(400, 'El nombre debe tener al menos dos letras o números para generar su identificador de dos letras.');
    }

    const fr = await pool.query(
      'SELECT id_fraccionamiento, id_empresa FROM fraccionamiento WHERE id_fraccionamiento = $1', [idFracc]);
    if (fr.rows.length === 0 || (empresaDe(req) && fr.rows[0].id_empresa !== empresaDe(req))) {
      throw errorHttp(400, 'Debes seleccionar un fraccionamiento para registrar el condominio.');
    }

    const dup = await pool.query(
      'SELECT 1 FROM condominio WHERE id_fraccionamiento = $1 AND LOWER(nombre) = LOWER($2)', [idFracc, nombre]);
    if (dup.rows.length) throw errorHttp(409, 'Ya existe un condominio con ese nombre en el fraccionamiento.');

    const conflicto = await buscarConflictoSiglas(pool, fr.rows[0].id_empresa, nombre);
    if (conflicto) {
      throw errorHttp(409, `El identificador "${conflicto.siglas}" ya lo usa "${conflicto.nombre}". Con ambos nombres se generarían códigos de inventario repetidos; usa un nombre con otras iniciales.`);
    }

    const r = await pool.query(
      'INSERT INTO condominio (id_fraccionamiento, nombre) VALUES ($1, $2) RETURNING *', [idFracc, nombre]);
    res.status(201).json({ ...r.rows[0], siglas: siglasNombre(nombre) });
  } catch (err) {
    responderError(res, err, 'Error al registrar el condominio');
  }
});

app.post('/api/inventario/manzanas', verificarToken, verificarRol(ROLES_ADMIN), async (req, res) => {
  try {
    const idFracc = parseInt(req.body.id_fraccionamiento, 10);
    const idCondo = req.body.id_condominio ? parseInt(req.body.id_condominio, 10) : null;
    if (!idFracc) throw errorHttp(400, 'Debes seleccionar un fraccionamiento.');

    const numero = formatoNumero(textoObligatorio(req.body.num_manzana, 'El número de manzana', 50), 'MANZANA|MZA|MZ|M');
    if (!numero) throw errorHttp(400, 'El número de manzana es obligatorio.');

    const fr = await pool.query('SELECT id_empresa FROM fraccionamiento WHERE id_fraccionamiento = $1', [idFracc]);
    if (fr.rows.length === 0 || (empresaDe(req) && fr.rows[0].id_empresa !== empresaDe(req))) {
      throw errorHttp(400, 'El fraccionamiento seleccionado no existe.');
    }

    if (idCondo) {
      const cd = await pool.query(
        'SELECT 1 FROM condominio WHERE id_condominio = $1 AND id_fraccionamiento = $2', [idCondo, idFracc]);
      if (cd.rows.length === 0) throw errorHttp(400, 'El condominio no pertenece al fraccionamiento seleccionado.');
    }

    // Duplicado dentro de la MISMA ubicación (el mismo número sí puede existir en otra ubicación)
    const existentes = await pool.query(
      `SELECT m.num_manzana, m.id_condominio, c.nombre AS condominio
       FROM manzana m LEFT JOIN condominio c ON c.id_condominio = m.id_condominio
       WHERE COALESCE(m.id_fraccionamiento, c.id_fraccionamiento) = $1`, [idFracc]);
    const repetida = existentes.rows.some((m) => {
      const condoReal = esCondominioReal(m.condominio) ? m.id_condominio : null;
      return (condoReal || null) === (idCondo || null) && formatoNumero(m.num_manzana, 'MANZANA|MZA|MZ|M') === numero;
    });
    if (repetida) throw errorHttp(409, `La manzana M-${numero} ya existe en esa ubicación.`);

    const r = idCondo
      ? await pool.query('INSERT INTO manzana (id_condominio, num_manzana) VALUES ($1, $2) RETURNING *', [idCondo, numero])
      : await pool.query('INSERT INTO manzana (id_fraccionamiento, num_manzana) VALUES ($1, $2) RETURNING *', [idFracc, numero]);
    res.status(201).json(r.rows[0]);
  } catch (err) {
    responderError(res, err, 'Error al registrar la manzana');
  }
});

app.post('/api/inventario/lotes', verificarToken, verificarRol(ROLES_ADMIN), async (req, res) => {
  try {
    const idManzana = parseInt(req.body.id_manzana, 10);
    if (!idManzana) throw errorHttp(400, 'Debes seleccionar una manzana.');

    const manzana = await cargarManzana(pool, idManzana);
    if (!manzana || (empresaDe(req) && manzana.id_empresa !== empresaDe(req))) {
      throw errorHttp(400, 'La manzana seleccionada no existe.');
    }

    // La jerarquía enviada debe coincidir con la real (sin combinaciones inválidas)
    const idFracc = req.body.id_fraccionamiento ? parseInt(req.body.id_fraccionamiento, 10) : null;
    const idCondo = req.body.id_condominio ? parseInt(req.body.id_condominio, 10) : null;
    if (idFracc && idFracc !== manzana.id_fraccionamiento) {
      throw errorHttp(400, 'La manzana no pertenece al fraccionamiento seleccionado.');
    }
    if ((idCondo || null) !== (manzana.id_condominio_real || null)) {
      throw errorHttp(400, 'La manzana no pertenece al condominio seleccionado.');
    }

    const numero = formatoNumero(textoObligatorio(req.body.num_lote, 'El número de lote', 50), 'LOTE|LT|L');
    const m2 = Number(req.body.m2);
    const precio = Number(req.body.precio);
    if (!(m2 > 0)) throw errorHttp(400, 'Los m² deben ser un número mayor a 0.');
    if (!(precio >= 0) || req.body.precio === '' || req.body.precio === null || req.body.precio === undefined) {
      throw errorHttp(400, 'El precio debe ser un número igual o mayor a 0.');
    }

    // Duplicado dentro de la misma manzana
    const lotes = await pool.query('SELECT num_lote FROM lote WHERE id_manzana = $1', [idManzana]);
    if (lotes.rows.some((l) => formatoNumero(l.num_lote, 'LOTE|LT|L') === numero)) {
      throw errorHttp(409, `El lote L-${numero} ya existe en esa manzana.`);
    }

    const codigo = generarCodigoInventario({
      fraccionamiento: manzana.fraccionamiento, condominio: manzana.condominio,
      num_manzana: manzana.num_manzana, num_lote: numero
    });
    const choque = await pool.query('SELECT 1 FROM lote WHERE codigo_inventario = $1', [codigo]);
    if (choque.rows.length) {
      throw errorHttp(409, `El código ${codigo} ya pertenece a otro lote (hay fraccionamientos o condominios con las mismas iniciales). No se creó el lote; revisa los nombres del inventario.`);
    }

    const r = await pool.query(
      `INSERT INTO lote (id_manzana, num_lote, m2, precio, estado, codigo_inventario)
       VALUES ($1, $2, $3, $4, 'DISPONIBLE', $5) RETURNING id_lote`,
      [idManzana, numero, m2, precio, codigo]);
    res.status(201).json({ id_lote: r.rows[0].id_lote, codigo_inventario: codigo, estado: 'DISPONIBLE' });
  } catch (err) {
    responderError(res, err, 'Error al registrar el lote');
  }
});

// ---------- SOLICITUDES DE LOTE ----------
const idClienteDeUsuario = async (usuario) => {
  if (usuario?.id_cliente) return Number(usuario.id_cliente);
  if (!usuario?.id_usuario) return null;
  const r = await pool.query('SELECT id_cliente FROM cliente WHERE id_usuario = $1 OR email = $2', [usuario.id_usuario, usuario.email]);
  return r.rows[0]?.id_cliente ?? null;
};

const consultarSolicitudes = async (db, { idSolicitud = null, idCliente = null, estado = null, idEmpresa = null }) => {
  const r = await db.query(
    `SELECT s.id_solicitud, s.id_proceso, s.id_lote, s.estado, s.comentarios,
            s.fecha_solicitud, s.fecha_resolucion, s.motivo_resolucion,
            pv.id_cliente, pv.id_lote AS id_lote_expediente,
            COALESCE(pv.es_para_tercero, false) AS es_para_tercero, pv.tercero_nombre_completo,
            c.nombre AS cliente_nombre, c.apellido AS cliente_apellido,
            u.nombre AS solicitante_nombre, u.email AS solicitante_email,
            ua.nombre AS admin_nombre,
            v.num_lote, v.num_manzana, v.condominio, v.fraccionamiento, v.codigo_inventario,
            v.estado AS estado_lote, v.m2, v.precio
     FROM solicitud_lote s
     JOIN proceso_venta pv ON pv.id_proceso = s.id_proceso
     JOIN cliente c ON c.id_cliente = pv.id_cliente
     LEFT JOIN usuario u ON u.id_usuario = s.id_usuario_solicitante
     LEFT JOIN usuario ua ON ua.id_usuario = s.id_usuario_admin
     LEFT JOIN v_lote_inventario v ON v.id_lote = s.id_lote
     WHERE ($1::int IS NULL OR s.id_solicitud = $1)
       AND ($2::int IS NULL OR pv.id_cliente = $2)
       AND ($3::text IS NULL OR s.estado = $3)
       AND ($4::int IS NULL OR v.id_empresa = $4)
     ORDER BY s.id_solicitud DESC`,
    [idSolicitud, idCliente, estado, idEmpresa]);
  return r.rows.map((row) => ({
    ...normalizarLote(row),
    titular_expediente: nombreTitular(row)
  }));
};

// Admin: todas (opcional ?estado=). Usuario: solo las suyas.
app.get('/api/solicitudes-lote', verificarToken, async (req, res) => {
  try {
    const estado = req.query.estado ? String(req.query.estado).toUpperCase() : null;
    if (esAdminInventario(req.usuario)) {
      return res.json(await consultarSolicitudes(pool, { estado, idEmpresa: empresaDe(req) }));
    }
    const idCliente = await idClienteDeUsuario(req.usuario);
    if (!idCliente) return res.json([]);
    res.json(await consultarSolicitudes(pool, { idCliente, estado }));
  } catch (err) {
    responderError(res, err, 'Error al consultar las solicitudes de lote');
  }
});

app.get('/api/solicitudes-lote/:id', verificarToken, async (req, res) => {
  try {
    const idCliente = esAdminInventario(req.usuario) ? null : await idClienteDeUsuario(req.usuario);
    if (!esAdminInventario(req.usuario) && !idCliente) throw errorHttp(403, 'No tienes permisos para consultar esta solicitud.');
    const lista = await consultarSolicitudes(pool, { idSolicitud: parseInt(req.params.id, 10), idCliente });
    if (lista.length === 0) throw errorHttp(404, 'Solicitud no encontrada.');
    res.json(lista[0]);
  } catch (err) {
    responderError(res, err, 'Error al consultar la solicitud');
  }
});

// Usuario: solicitar un lote disponible para uno de sus expedientes
app.post('/api/solicitudes-lote', verificarToken, async (req, res) => {
  try {
    if (esStaff(req.usuario)) {
      throw errorHttp(403, 'El personal asigna lotes directamente desde el inventario; las solicitudes son para clientes.');
    }
    const idProceso = parseInt(req.body.id_proceso, 10);
    const idLote = parseInt(req.body.id_lote, 10);
    if (!idProceso || !idLote) throw errorHttp(400, 'Debes indicar el expediente y el lote.');

    const idCliente = await idClienteDeUsuario(req.usuario);
    const pr = await pool.query(
      'SELECT id_cliente, id_lote, COALESCE(activo, true) AS activo FROM proceso_venta WHERE id_proceso = $1', [idProceso]);
    if (pr.rows.length === 0 || !idCliente || Number(pr.rows[0].id_cliente) !== Number(idCliente)) {
      throw errorHttp(403, 'No tienes permisos sobre este expediente.');
    }
    if (!pr.rows[0].activo) throw errorHttp(409, 'El expediente no está activo.');
    if (pr.rows[0].id_lote) throw errorHttp(409, 'Este expediente ya tiene un lote asignado.');

    const lt = await pool.query('SELECT estado FROM lote WHERE id_lote = $1', [idLote]);
    if (lt.rows.length === 0) throw errorHttp(404, 'El lote seleccionado no existe.');
    if (lt.rows[0].estado !== 'DISPONIBLE') throw errorHttp(409, 'El lote seleccionado ya no está disponible.');

    const comentarios = String(req.body.comentarios ?? '').trim() || null;
    let r;
    try {
      r = await pool.query(
        `INSERT INTO solicitud_lote (id_proceso, id_lote, id_usuario_solicitante, comentarios)
         VALUES ($1, $2, $3, $4) RETURNING id_solicitud, estado`,
        [idProceso, idLote, req.usuario.id_usuario, comentarios]);
    } catch (e) {
      if (e.code === '23505') throw errorHttp(409, 'Este expediente ya tiene una solicitud de lote pendiente.');
      throw e;
    }
    res.status(201).json({ mensaje: 'Solicitud enviada; queda pendiente de autorización.', ...r.rows[0] });
  } catch (err) {
    responderError(res, err, 'Error al registrar la solicitud de lote');
  }
});

// Usuario: cancelar su propia solicitud pendiente
app.put('/api/solicitudes-lote/:id/cancelar', verificarToken, async (req, res) => {
  try {
    const idCliente = await idClienteDeUsuario(req.usuario);
    const propia = (await consultarSolicitudes(pool, { idSolicitud: parseInt(req.params.id, 10), idCliente }))[0];
    if (!propia || !idCliente) throw errorHttp(404, 'Solicitud no encontrada.');
    const r = await pool.query(
      `UPDATE solicitud_lote SET estado = 'CANCELADA', fecha_resolucion = CURRENT_TIMESTAMP
       WHERE id_solicitud = $1 AND estado = 'PENDIENTE' RETURNING id_solicitud`, [propia.id_solicitud]);
    if (r.rows.length === 0) throw errorHttp(409, 'Solo se pueden cancelar solicitudes pendientes.');
    res.json({ mensaje: 'Solicitud cancelada.' });
  } catch (err) {
    responderError(res, err, 'Error al cancelar la solicitud');
  }
});

// Admin: aprobar. Todo ocurre en una transacción con bloqueo de fila (solicitud -> expediente -> lote).
app.put('/api/solicitudes-lote/:id/aprobar', verificarToken, verificarRol(ROLES_ADMIN), async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const sol = await client.query(
      'SELECT id_solicitud, id_proceso, id_lote, estado FROM solicitud_lote WHERE id_solicitud = $1 FOR UPDATE',
      [parseInt(req.params.id, 10)]);
    if (sol.rows.length === 0) throw errorHttp(404, 'Solicitud no encontrada.');
    const s0 = sol.rows[0];
    if (s0.estado !== 'PENDIENTE') throw errorHttp(409, `La solicitud ya está ${s0.estado.toLowerCase()}.`);

    const pr = await client.query(
      'SELECT id_lote, num_lote, COALESCE(activo, true) AS activo FROM proceso_venta WHERE id_proceso = $1 FOR UPDATE',
      [s0.id_proceso]);
    if (pr.rows.length === 0 || !pr.rows[0].activo) throw errorHttp(409, 'El expediente de la solicitud ya no está activo.');
    if (pr.rows[0].id_lote && pr.rows[0].id_lote !== s0.id_lote) {
      throw errorHttp(409, `El expediente ya tiene asignado el lote ${pr.rows[0].num_lote}. Libéralo antes de aprobar esta solicitud.`);
    }

    // Valida disponibilidad (bloquea el lote) y registra la asignación + estado ASIGNADO
    const resultado = await asignarLoteAProceso(client, {
      idProceso: s0.id_proceso,
      idLote: s0.id_lote,
      idAdmin: req.usuario.id_usuario,
      observaciones: `Aprobación de la solicitud #${s0.id_solicitud}`
    });

    await client.query(
      `UPDATE asignacion_lote SET id_solicitud = $1
       WHERE id_asignacion = (SELECT MAX(id_asignacion) FROM asignacion_lote
                              WHERE id_proceso = $2 AND id_lote = $3 AND accion = 'ASIGNAR')`,
      [s0.id_solicitud, s0.id_proceso, s0.id_lote]);
    await client.query(
      `UPDATE solicitud_lote SET estado = 'APROBADA', id_usuario_admin = $1,
              fecha_resolucion = CURRENT_TIMESTAMP, motivo_resolucion = $2
       WHERE id_solicitud = $3`,
      [req.usuario.id_usuario, String(req.body?.motivo ?? '').trim() || null, s0.id_solicitud]);

    await client.query('COMMIT');
    res.json({ mensaje: 'Solicitud aprobada y lote asignado.', id_lote: s0.id_lote, codigo_inventario: resultado.codigo });
  } catch (err) {
    await client.query('ROLLBACK');
    responderError(res, err, 'Error al aprobar la solicitud');
  } finally {
    client.release();
  }
});

// Admin: rechazar (el lote no se toca; las asignaciones de otros usuarios no cambian)
app.put('/api/solicitudes-lote/:id/rechazar', verificarToken, verificarRol(ROLES_ADMIN), async (req, res) => {
  try {
    const r = await pool.query(
      `UPDATE solicitud_lote SET estado = 'RECHAZADA', id_usuario_admin = $1,
              fecha_resolucion = CURRENT_TIMESTAMP, motivo_resolucion = $2
       WHERE id_solicitud = $3 AND estado = 'PENDIENTE' RETURNING id_solicitud`,
      [req.usuario.id_usuario, String(req.body?.motivo ?? '').trim() || null, parseInt(req.params.id, 10)]);
    if (r.rows.length === 0) throw errorHttp(409, 'La solicitud no existe o ya no está pendiente.');
    res.json({ mensaje: 'Solicitud rechazada.' });
  } catch (err) {
    responderError(res, err, 'Error al rechazar la solicitud');
  }
});

// ==========================================
// GESTIÓN DOCUMENTAL DEL INVENTARIO (módulo opcional)
//  - Solo ADMIN / ADMINISTRADOR (validado en cada ruta)
//  - Los archivos se guardan en una carpeta PRIVADA que NO se sirve de forma estática:
//    solo salen por GET /api/inventario/documentos/:id/archivo con token y rol.
//  - En la base de datos solo se guardan los metadatos (tabla documento_inventario).
// ==========================================
// Catálogo de documentos por nivel inmobiliario (columna = FK real hacia el elemento)
const DOCUMENTOS_INVENTARIO = {
  LOTE: {
    columna: 'id_lote',
    tipos: { CEDULA_CONDOMINAL: 'Cédula condominal', PREDIAL: 'Predial', ALINEAMIENTO: 'Alineamiento' }
  },
  CONDOMINIO: {
    columna: 'id_condominio',
    tipos: {
      REGIMEN_PROPIEDAD: 'Régimen de propiedad en condominio',
      FACTIBILIDAD_AGUA: 'Factibilidad de agua potable',
      FACTIBILIDAD_CFE: 'Factibilidad de CFE'
    }
  },
  FRACCIONAMIENTO: {
    columna: 'id_fraccionamiento',
    tipos: { ESCRITURA: 'Escritura', FACTIBILIDAD_AGUA: 'Factibilidad de agua potable', FACTIBILIDAD_CFE: 'Factibilidad de CFE' }
  }
};

const recibirDocInventario = recibirArchivo('archivo');

// Verifica que el elemento exista, sea de la empresa del usuario y admita documentos
async function validarElementoInventario(req, nivel, idElemento) {
  const cfg = DOCUMENTOS_INVENTARIO[nivel];
  if (!cfg) throw errorHttp(400, 'Nivel de documento inválido.');
  const id = parseInt(idElemento, 10);
  if (!id) throw errorHttp(400, 'Elemento del inventario inválido.');
  const emp = empresaDe(req);

  let r;
  if (nivel === 'FRACCIONAMIENTO') {
    r = await pool.query(
      'SELECT nombre FROM fraccionamiento WHERE id_fraccionamiento = $1 AND ($2::int IS NULL OR id_empresa = $2)', [id, emp]);
  } else if (nivel === 'CONDOMINIO') {
    r = await pool.query(
      `SELECT c.nombre FROM condominio c JOIN fraccionamiento f ON f.id_fraccionamiento = c.id_fraccionamiento
       WHERE c.id_condominio = $1 AND ($2::int IS NULL OR f.id_empresa = $2)`, [id, emp]);
  } else {
    r = await pool.query(
      'SELECT num_lote AS nombre FROM v_lote_inventario WHERE id_lote = $1 AND ($2::int IS NULL OR id_empresa = $2)', [id, emp]);
  }
  if (r.rows.length === 0) throw errorHttp(404, 'El elemento del inventario no existe.');
  if (nivel === 'CONDOMINIO' && !esCondominioReal(r.rows[0].nombre)) {
    throw errorHttp(400, 'Ese registro no es un condominio real y no admite documentos.');
  }
  return { cfg, id };
}

const nombreArchivoSeguro = (original) => {
  // multer entrega el nombre en latin1; se recupera el UTF-8 y se limpian rutas/controles
  const nombre = Buffer.from(String(original || ''), 'latin1').toString('utf8')
    .replace(/[\\/\u0000-\u001f]/g, '_').trim();
  return (nombre || 'documento').slice(0, 255);
};

// Resumen: cuántos documentos vigentes tiene cada elemento (para los indicadores de la interfaz)
app.get('/api/inventario/documentos/resumen', verificarToken, verificarRol(ROLES_ADMIN), async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT nivel, COALESCE(id_fraccionamiento, id_condominio, id_lote) AS id, COUNT(*)::int AS cargados
       FROM documento_inventario WHERE activo GROUP BY 1, 2`);
    const salida = { FRACCIONAMIENTO: {}, CONDOMINIO: {}, LOTE: {} };
    r.rows.forEach((f) => { salida[f.nivel][f.id] = f.cargados; });
    res.json(salida);
  } catch (err) {
    responderError(res, err, 'Error al consultar el resumen de documentos');
  }
});

// Documentos de un elemento: todos los tipos del nivel con su estado (CARGADO / PENDIENTE)
app.get('/api/inventario/documentos', verificarToken, verificarRol(ROLES_ADMIN), async (req, res) => {
  try {
    const nivel = String(req.query.nivel || '').toUpperCase();
    const { cfg, id } = await validarElementoInventario(req, nivel, req.query.id);

    const filas = await pool.query(
      `SELECT d.id_documento, d.tipo_documento, d.nombre_original, d.tamano_bytes, d.fecha_carga,
              d.activo, d.reemplazado_en, u.nombre AS cargado_por
       FROM documento_inventario d
       LEFT JOIN usuario u ON u.id_usuario = d.id_usuario_admin
       WHERE d.${cfg.columna} = $1
       ORDER BY d.fecha_carga DESC, d.id_documento DESC`, [id]);

    const resumirDoc = (f) => ({
      id_documento: f.id_documento,
      nombre_archivo: f.nombre_original,
      tamano_bytes: f.tamano_bytes === null ? null : Number(f.tamano_bytes),
      fecha_carga: f.fecha_carga,
      cargado_por: f.cargado_por,
      reemplazado_en: f.reemplazado_en
    });

    const tipos = Object.entries(cfg.tipos).map(([clave, etiqueta]) => {
      const propias = filas.rows.filter((f) => f.tipo_documento === clave);
      const vigente = propias.find((f) => f.activo);
      return {
        tipo_documento: clave,
        etiqueta,
        estado: vigente ? 'CARGADO' : 'PENDIENTE',
        documento: vigente ? resumirDoc(vigente) : null,
        versiones_anteriores: propias.filter((f) => !f.activo).map(resumirDoc)
      };
    });

    res.json({
      nivel,
      id,
      tipos,
      cargados: tipos.filter((t) => t.estado === 'CARGADO').length,
      total: tipos.length
    });
  } catch (err) {
    responderError(res, err, 'Error al consultar los documentos');
  }
});

// Cargar o reemplazar un documento (la versión anterior se conserva como historial)
app.post('/api/inventario/documentos', verificarToken, verificarRol(ROLES_ADMIN), recibirDocInventario, async (req, res) => {
  let nombreAlmacenado = null;
  const descartarArchivo = () => { if (nombreAlmacenado) storage.borrar('inventario', nombreAlmacenado).catch(() => {}); };
  let client = null;
  try {
    if (!req.file) throw errorHttp(400, 'No se ha adjuntado ningún archivo.');

    const nivel = String(req.body.nivel || '').toUpperCase();
    const tipo = String(req.body.tipo_documento || '').toUpperCase();
    const { cfg, id } = await validarElementoInventario(req, nivel, req.body.id_elemento);
    if (!cfg.tipos[tipo]) throw errorHttp(400, 'Ese tipo de documento no corresponde al nivel seleccionado.');

    const ext = detectarExtensionReal(req.file.buffer);
    if (!ext) throw errorHttp(400, MENSAJE_ARCHIVO_INVALIDO);
    const nombreOriginal = nombreArchivoSeguro(req.file.originalname);

    nombreAlmacenado = `${crypto.randomBytes(16).toString('hex')}${ext}`;
    await storage.guardar('inventario', nombreAlmacenado, req.file.buffer, DOC_FORMATOS[ext]);

    client = await pool.connect();
    await client.query('BEGIN');

    const previo = await client.query(
      `SELECT id_documento FROM documento_inventario
       WHERE ${cfg.columna} = $1 AND tipo_documento = $2 AND activo FOR UPDATE`, [id, tipo]);
    if (previo.rows.length) {
      await client.query(
        'UPDATE documento_inventario SET activo = FALSE, reemplazado_en = CURRENT_TIMESTAMP WHERE id_documento = $1',
        [previo.rows[0].id_documento]);
    }

    let nuevo;
    try {
      nuevo = await client.query(
        `INSERT INTO documento_inventario
           (nivel, tipo_documento, ${cfg.columna}, nombre_original, archivo_almacenado, mime_type, tamano_bytes, id_usuario_admin)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id_documento, fecha_carga`,
        [nivel, tipo, id, nombreOriginal, nombreAlmacenado, DOC_FORMATOS[ext], req.file.size, req.usuario.id_usuario || null]);
    } catch (e) {
      if (e.code === '23505') throw errorHttp(409, 'Otro administrador cargó este documento al mismo tiempo. Vuelve a intentarlo.');
      throw e;
    }

    await client.query(
      `INSERT INTO bitacora_auditoria (id_usuario, modulo, accion, id_registro_afectado, descripcion)
       VALUES ($1, 'documento_inventario', $2, $3, $4)`,
      [req.usuario.id_usuario || 1, previo.rows.length ? 'REEMPLAZO' : 'CARGA', nuevo.rows[0].id_documento,
       `${nivel} #${id}: ${cfg.tipos[tipo]} (${nombreOriginal})`]);

    await client.query('COMMIT');
    res.status(201).json({
      mensaje: previo.rows.length
        ? 'Documento reemplazado. La versión anterior se conserva en el historial.'
        : 'Documento cargado correctamente.',
      id_documento: nuevo.rows[0].id_documento
    });
  } catch (err) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    descartarArchivo();
    responderError(res, err, 'Error al guardar el documento');
  } finally {
    if (client) client.release();
  }
});

// Consultar (inline) o descargar un archivo: solo administradores, con token en el encabezado
app.get('/api/inventario/documentos/:id/archivo', verificarToken, verificarRol(ROLES_ADMIN), async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT nivel, id_fraccionamiento, id_condominio, id_lote, nombre_original, archivo_almacenado, mime_type
       FROM documento_inventario WHERE id_documento = $1`, [parseInt(req.params.id, 10) || 0]);
    if (r.rows.length === 0) throw errorHttp(404, 'Documento no encontrado.');
    const d = r.rows[0];

    // Misma validación de empresa que al consultar el elemento
    await validarElementoInventario(req, d.nivel, d[DOCUMENTOS_INVENTARIO[d.nivel].columna]);

    // basename evita que una referencia manipulada salga del contenedor privado
    const flujo = await storage.abrir('inventario', path.basename(d.archivo_almacenado));
    if (!flujo) throw errorHttp(404, 'El archivo ya no está disponible en el servidor.');

    const disposicion = req.query.descargar === '1' ? 'attachment' : 'inline';
    res.setHeader('Content-Type', d.mime_type || 'application/octet-stream');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Content-Disposition', `${disposicion}; filename*=UTF-8''${encodeURIComponent(d.nombre_original)}`);

    flujo.on('error', () => { if (!res.headersSent) res.status(500).json({ error: 'No se pudo leer el archivo.' }); else res.destroy(); });
    flujo.pipe(res);
  } catch (err) {
    responderError(res, err, 'Error al consultar el documento');
  }
});

// ==========================================
// INICIO DEL SERVIDOR
// ==========================================
if (process.env.NODE_ENV === 'production' && !process.env.CORS_ORIGIN) {
  console.warn('⚠️ NODE_ENV=production sin CORS_ORIGIN: ningún navegador externo podrá usar la API.');
}
console.log(`📁 Almacenamiento de documentos: ${storage.usaAzure() ? 'Azure Blob Storage' : 'disco local'}`);

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`🚀 Servidor ejecutándose en http://localhost:${PORT}`);
  completarCodigosInventario();
});