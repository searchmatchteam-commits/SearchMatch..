// config/db.js
// Conexión a la base de datos PostgreSQL de Supabase usando un Pool de "pg".
// La configuración se lee desde las variables de entorno definidas en .env

require('dotenv').config();
const { Pool } = require('pg');

// Pool de conexiones: reutiliza conexiones y evita abrir una por cada consulta.
// ssl.rejectUnauthorized: false es necesario para que funcione con Supabase
// (certificados gestionados por ellos, no por una CA local).
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// Si la variable DATABASE_URL no existe, avisamos de inmediato en consola.
if (!process.env.DATABASE_URL) {
  console.warn(
    '⚠️  Falta la variable DATABASE_URL en el archivo .env. ' +
      'Copia .env.example a .env y pega tu cadena de conexión de Supabase.'
  );
}

// Evento que se dispara si una conexión del pool falla después de conectarse.
// Sirve para ver en consola qué salió mal sin tumbar la aplicación.
pool.on('error', (err) => {
  errorDePool(err);
});

// Mensaje de error claro y único para fallos de conexión.
function errorDePool(err) {
  console.error('❌ Error inesperado en el pool de conexiones de PostgreSQL:');
  console.error('   Mensaje:', err.message);
  console.error(
    '   Causa probable: contraseña incorrecta, URL mal copiada o SSL no soportado.'
  );
}

/**
 * Prueba la conexión a la base de datos al iniciar el servidor.
 * NO detiene la aplicación si falla: solo muestra un mensaje claro en consola,
 * para que puedas corregir el .env y reiniciar.
 */
async function probarConexion() {
  // Si no hay cadena de conexión, no tiene sentido intentar conectarse.
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
    // Algunos errores de pg traen el detalle en .detail en vez de .message.
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
