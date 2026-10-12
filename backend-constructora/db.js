const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
  // Azure Database for PostgreSQL exige SSL: define DB_SSL=true en el servidor (en local no hace falta).
  // Solo si hay un problema con la cadena de certificados: DB_SSL_REJECT_UNAUTHORIZED=false (menos seguro).
  ssl: process.env.DB_SSL === 'true'
    ? { rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false' }
    : false,
});

pool.on('connect', () => {
  console.log(' Conexión exitosa a la base de datos PostgreSQL');
});

module.exports = pool;