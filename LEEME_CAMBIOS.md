# Cambios incluidos en este paquete

Copia estos archivos sobre tu proyecto conservando las rutas (no borra nada tuyo):

backend-constructora/
- server.js         Documentos de expedientes privados con descarga autenticada; validación de archivos;
                    CORS por variable; límite de intentos en login/registro; helmet; errores sin detalles internos
                    en producción; las rutas de documentos ya no se pueden alterar desde el cliente.
- storage.js        NUEVO. Almacenamiento en disco (desarrollo) o Azure Blob Storage (si hay variables de Azure).
- db.js             Soporte de SSL para Azure PostgreSQL (DB_SSL=true).
- package.json      Script "start", "main" correcto y versión mínima de Node.
- .env.example      NUEVO. Lista de variables (sin valores).
- .gitignore        NUEVO. Excluye .env, uploads/, storage_privado/, node_modules.

frontend-constructora/
- src/api/axios.js                  La URL del API sale de VITE_API_URL (por defecto sigue siendo localhost).
- src/pages/Expedientes.jsx         "Ver" documento ahora pide el archivo con el token (ya no hay URL pública).
- public/staticwebapp.config.json   NUEVO. Hace que las rutas del SPA funcionen al recargar en Azure.
- .env.example                      NUEVO.
- .gitignore                        Ahora ignora .env.

Después de copiar, en backend-constructora ejecuta:
    npm install helmet express-rate-limit @azure/storage-blob
Y reinicia el servidor. En local todo sigue funcionando como antes (guarda en disco).
Lee GUIA_DESPLIEGUE_AZURE.md para crear los recursos y desplegar.

IMPORTANTE (local): los documentos que ya tienes en uploads/ siguen funcionando, pero ya no se abren escribiendo
su URL en el navegador; se abren con el botón "Ver" dentro de la aplicación, con sesión iniciada.
