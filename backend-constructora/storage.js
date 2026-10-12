// ============================================================
// Capa de almacenamiento de archivos
//  - Desarrollo (por defecto): disco local, en las mismas carpetas de siempre.
//  - Azure: si existe AZURE_STORAGE_CONNECTION_STRING (o AZURE_STORAGE_ACCOUNT_URL
//    con identidad administrada) los archivos van a Azure Blob Storage, en
//    contenedores PRIVADOS ("expedientes" e "inventario").
// El resto del backend solo usa: guardar, abrir y borrar.
// ============================================================
const fs = require('fs');
const path = require('path');

const usaAzure = () =>
  !!(process.env.AZURE_STORAGE_CONNECTION_STRING || process.env.AZURE_STORAGE_ACCOUNT_URL);

// Carpetas locales (modo desarrollo)
const carpetaLocal = (contenedor) => {
  if (contenedor === 'inventario') {
    return process.env.DOCS_INVENTARIO_DIR || path.join(__dirname, 'storage_privado', 'inventario');
  }
  if (contenedor === 'expedientes') return path.join(__dirname, 'uploads');
  throw new Error(`Contenedor desconocido: ${contenedor}`);
};

// El nombre nunca puede salir de la carpeta/contenedor
const nombreSeguro = (nombre) => {
  const limpio = path.basename(String(nombre || ''));
  if (!limpio || limpio === '.' || limpio === '..') throw new Error('Nombre de archivo inválido');
  return limpio;
};

// ---------- Azure Blob Storage ----------
const contenedoresAzure = {};
const obtenerContenedorAzure = async (nombre) => {
  if (contenedoresAzure[nombre]) return contenedoresAzure[nombre];

  const { BlobServiceClient } = require('@azure/storage-blob');
  let servicio;
  if (process.env.AZURE_STORAGE_CONNECTION_STRING) {
    servicio = BlobServiceClient.fromConnectionString(process.env.AZURE_STORAGE_CONNECTION_STRING);
  } else {
    const { DefaultAzureCredential } = require('@azure/identity');
    servicio = new BlobServiceClient(process.env.AZURE_STORAGE_ACCOUNT_URL, new DefaultAzureCredential());
  }
  const contenedor = servicio.getContainerClient(nombre);
  try {
    await contenedor.createIfNotExists(); // sin acceso público
  } catch (e) {
    // Si el contenedor ya existe y esta identidad no puede crearlo, se continúa
    console.warn(`⚠️ No se pudo verificar el contenedor "${nombre}":`, e.message);
  }
  contenedoresAzure[nombre] = contenedor;
  return contenedor;
};

// ---------- API pública ----------
async function guardar(contenedor, nombre, buffer, mime) {
  const archivo = nombreSeguro(nombre);
  if (usaAzure()) {
    const c = await obtenerContenedorAzure(contenedor);
    await c.getBlockBlobClient(archivo).uploadData(buffer, {
      blobHTTPHeaders: { blobContentType: mime || 'application/octet-stream' }
    });
    return;
  }
  const dir = carpetaLocal(contenedor);
  await fs.promises.mkdir(dir, { recursive: true });
  await fs.promises.writeFile(path.join(dir, archivo), buffer, { flag: 'wx' }); // 'wx': nunca sobrescribe
}

// Devuelve un stream legible, o null si el archivo no existe
async function abrir(contenedor, nombre) {
  const archivo = nombreSeguro(nombre);
  if (usaAzure()) {
    const c = await obtenerContenedorAzure(contenedor);
    const blob = c.getBlobClient(archivo);
    if (!(await blob.exists())) return null;
    const respuesta = await blob.download();
    return respuesta.readableStreamBody;
  }
  const ruta = path.join(carpetaLocal(contenedor), archivo);
  try {
    await fs.promises.access(ruta, fs.constants.R_OK);
  } catch (e) {
    return null;
  }
  return fs.createReadStream(ruta);
}

async function borrar(contenedor, nombre) {
  const archivo = nombreSeguro(nombre);
  if (usaAzure()) {
    const c = await obtenerContenedorAzure(contenedor);
    await c.getBlobClient(archivo).deleteIfExists();
    return;
  }
  try {
    await fs.promises.unlink(path.join(carpetaLocal(contenedor), archivo));
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
  }
}

module.exports = { guardar, abrir, borrar, usaAzure };
