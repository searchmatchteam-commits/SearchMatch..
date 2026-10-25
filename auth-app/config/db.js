require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

if (!process.env.DATABASE_URL) {
  console.warn(
    '⚠️  Falta la variable DATABASE_URL en el archivo .env. ' +
      'Copia .env.example a .env y pega tu cadena de conexión de Supabase.'
  );
}

pool.on('error', (err) => {
  errorDePool(err);
});

function errorDePool(err) {
  console.error('❌ Error inesperado en el pool de conexiones de PostgreSQL:');
  console.error('   Mensaje:', err.message);
  console.error(
    '   Causa probable: contraseña incorrecta, URL mal copiada o SSL no soportado.'
  );
}

async function probarConexion() {
  if (!process.env.DATABASE_URL) {
    console.error('❌ No se pudo probar la conexión: falta DATABASE_URL en .env.');
    console.error('   Copia .env.example a .env y pega la URI de Supabase.');
    return;
  }

  try {
    const resultado = await pool.query('SELECT NOW() AS ahora');
    console.log('✅ Conectado a Supabase (PostgreSQL) correctamente.');
    console.log('   Hora del servidor de la base de datos:', resultado.rows[0].ahora);
  } catch (err) {
    const detalle = err.message || err.detail || JSON.stringify(err) || 'sin detalle';
    console.error('❌ No se pudo conectar a Supabase (PostgreSQL).');
    console.error('   Mensaje:', detalle);
    if (err.code) {
      console.error('   Código pg:', err.code);
    }
    console.error(
      '   Revisa en .env: DATABASE_URL, contraseña y el parámetro ssl { rejectUnauthorized: false }.'
    );
  }
}

module.exports = { pool, probarConexion };
