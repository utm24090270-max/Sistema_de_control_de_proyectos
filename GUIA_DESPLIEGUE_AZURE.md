# Guía de despliegue en Azure — Constructora Proyecto 20

> Los nombres de menús, versiones y planes de Azure cambian con el tiempo: confirma cada paso en el portal
> (https://portal.azure.com) y usa la calculadora de precios de Azure antes de elegir niveles.
> Todo lo marcado con `<...>` lo defines tú. **Nunca** pegues contraseñas o claves en el chat, en Git ni en el frontend.

## 0. Antes de empezar (en tu equipo)

1. En `backend-constructora`: `npm install helmet express-rate-limit @azure/storage-blob`
   (opcional, solo si usarás identidad administrada: `npm install @azure/identity`).
2. Opcional: `npm uninstall bcryptjs` (no se usa; el servidor usa `bcrypt`).
3. Comprueba que `.env`, `uploads/`, `storage_privado/` e `ine_cliente.jpg` **no** se suban a Git (el `.gitignore` nuevo ya los excluye).
4. Si alguna vez subiste el `.env` o el `ine_cliente.jpg` a un repositorio, cambia esas contraseñas y el `JWT_SECRET`.

## 1. Recursos que debes crear

Crea todo dentro de un mismo **grupo de recursos** y de una misma **región** (la más cercana a tus usuarios).

| Recurso | Notas |
|---|---|
| Azure Database for PostgreSQL – Flexible Server | Elige una versión compatible con la que uses (mis scripts funcionan en versiones anteriores a la 18). Guarda el usuario administrador aparte. |
| Cuenta de almacenamiento (Storage Account) | Rendimiento estándar. Crea dos contenedores **privados**: `expedientes` e `inventario` (el backend también los crea si tiene permiso). |
| App Service (Linux) + plan | Runtime Node 20 LTS o superior. Aquí vive el backend. |
| Static Web Apps | Aquí vive el frontend (ya incluye `staticwebapp.config.json` para que `/inventario` y `/expedientes` funcionen al recargar). |
| Application Insights (opcional) | Registro de errores y rendimiento. |

## 2. Base de datos

1. En el servidor PostgreSQL, **Red / Networking**: agrega una regla de firewall con tu IP pública para poder ejecutar los scripts desde pgAdmin, y permite el acceso desde servicios de Azure (o la IP saliente de tu App Service).
2. Crea la base (por ejemplo `proyecto20`) y conéctate con pgAdmin (SSL activo).
3. Ejecuta **en este orden**, cada uno en un Query Tool nuevo, sin texto seleccionado:
   1. `Schema.sql`
   2. `Inventario.sql`
   3. `Inventario_modulo.sql`
   4. `Inventario_documentos.sql`
4. **No ejecutes `corregir-db.js` en producción**: reescribe valores por defecto y rellena `NULL` con "Residencial" y "C.infonavit", lo que contradice la regla actual de "Sin asignar".
5. Crea un usuario de aplicación con permisos limitados (no uses el administrador del servidor para la app):

```sql
CREATE ROLE app_proyecto20 LOGIN PASSWORD '<contraseña-larga-y-única>';
GRANT CONNECT ON DATABASE <nombre_bd> TO app_proyecto20;
GRANT USAGE ON SCHEMA public TO app_proyecto20;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_proyecto20;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_proyecto20;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_proyecto20;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO app_proyecto20;
```

6. **Primer administrador.** El registro público solo crea clientes. Genera el hash de la contraseña en tu equipo:
   `node -e "require('bcrypt').hash('<contraseña>',10).then(console.log)"`
   y luego inserta el usuario:

```sql
INSERT INTO usuario (id_empresa, nombre, email, password_hash, rol)
VALUES (1, '<Nombre>', '<correo>', '<hash generado>', 'ADMIN');
```

7. Activa y revisa los **respaldos automáticos** del servidor (retención en días).

## 3. Almacenamiento de documentos

1. En la cuenta de almacenamiento, confirma que los contenedores son **privados** (sin acceso anónimo).
2. Si ya tienes documentos de clientes en `backend-constructora/uploads/`, súbelos al contenedor `expedientes` **conservando el mismo nombre de archivo** (Azure Storage Explorer o `az storage blob upload-batch`). Los expedientes existentes guardan rutas como `/uploads/<archivo>` y seguirán funcionando.
3. Los documentos del inventario van al contenedor `inventario` (si usas la carpeta `storage_privado/inventario`, súbelos igual con el mismo nombre).
4. Activa **eliminación temporal (soft delete)** de blobs para poder recuperar borrados accidentales.
5. Copia la **cadena de conexión** de la cuenta (Claves de acceso) solo para pegarla en el paso 4. Para mayor seguridad puedes usar identidad administrada: asigna al App Service el rol *Storage Blob Data Contributor* sobre la cuenta y define `AZURE_STORAGE_ACCOUNT_URL` en lugar de la cadena.

## 4. Backend (App Service)

1. **Configuración → Variables de entorno** (o Application settings). Crea estas variables con valores reales (ver `.env.example`):
   `NODE_ENV=production`, `DB_HOST`, `DB_PORT=5432`, `DB_NAME`, `DB_USER=app_proyecto20`, `DB_PASSWORD`, `DB_SSL=true`,
   `JWT_SECRET` (nuevo, distinto al de desarrollo), `CORS_ORIGIN=https://<tu-frontend>`, `AZURE_STORAGE_CONNECTION_STRING`.
   Si prefieres Key Vault, guarda ahí los secretos y haz referencia a ellos desde estas variables.
2. **Comando de inicio:** `npm start`.
3. Despliega el contenido de `backend-constructora` **sin** `node_modules`, `.env`, `uploads/` ni `storage_privado/` (por ejemplo con la extensión de Azure para VS Code o GitHub Actions). Activa la compilación en el servidor para que ejecute `npm install`.
4. Activa **solo HTTPS** y TLS mínimo 1.2.
5. Comprueba `https://<tu-api>.azurewebsites.net/api/health`. En el registro (Log stream) debe aparecer:
   `Almacenamiento de documentos: Azure Blob Storage` y ningún aviso `⚠️`.

## 5. Frontend (Static Web Apps)

1. Crea el archivo `.env.production` (no se sube a Git) con: `VITE_API_URL=https://<tu-api>.azurewebsites.net/api`
2. `npm run build` genera la carpeta `dist`. Despliégala (GitHub Actions o la extensión de VS Code), cuidando que el build use esa variable.
3. Vuelve al backend y verifica que `CORS_ORIGIN` coincida **exactamente** con la URL del frontend (con `https://` y sin `/` final).

## 6. Prueba final en producción

- Registrar un cliente, iniciar sesión y abrir su expediente.
- Subir un PDF al expediente, abrirlo con "Ver" y comprobar que desde otra cuenta de cliente no se puede abrir.
- Como administrador: crear fraccionamiento, condominio, manzana y lote, cargar un documento del inventario, solicitar y aprobar un lote.
- Abrir directamente la URL de un documento antiguo (`.../uploads/<archivo>`): debe responder 404.
- Intentar iniciar sesión más de 30 veces seguidas con una contraseña incorrecta: debe bloquear temporalmente.

## 7. Pendientes que NO cubre este paquete

- Revisar que un cliente no pueda marcar por sí mismo los estados de aprobación de un expediente (`estados_binarios`) desde la API: hoy la restricción "Solo Admin" parece estar solo en la interfaz.
- Pruebas automáticas y monitoreo con alertas.
- Política de retención y consentimiento para los datos personales (INE, CURP, RFC) conforme a la normativa aplicable.
