require('dotenv').config();
const { Pool } = require('pg');

// Abrir una conexión a Supabase cuesta mucho más que una consulta (más de 1 s desde Chile, contra ~180 ms):
// por defecto el pool las cierra a los 10 s sin uso y cada navegación tras leer una página las reabría.
// Por eso CONEXIONES_ACTIVAS quedan siempre abiertas (el dashboard usa 5 a la vez). allowExitOnIdle deja
// terminar a los scripts de una sola pasada aunque queden abiertas.
const CONEXIONES_ACTIVAS = 5;

/**
 * Cadena de conexión: DATABASE_URL (.env) o, en Vercel, POSTGRES_URL (la crea la integración de Supabase).
 * Se le quitan sslmode y supa: con sslmode=require, pg exige verificar el certificado de Supabase (que Node no
 * reconoce) e ignora el ssl de abajo, y la conexión falla con "self-signed certificate in certificate chain".
 */
function cadenaDeConexion() {
  const cadena = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!cadena) return undefined;
  try {
    const url = new URL(cadena);
    ['sslmode', 'supa'].forEach((parametro) => url.searchParams.delete(parametro));
    return url.toString();
  } catch {
    return cadena;
  }
}

const pool = new Pool({
  connectionString: cadenaDeConexion(),
  ssl: { rejectUnauthorized: false },
  min: CONEXIONES_ACTIVAS,
  keepAlive: true,
  allowExitOnIdle: true,
});

if (!cadenaDeConexion()) {
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
    // Varias a la vez: deja abiertas las conexiones antes de la primera visita.
    const [resultado] = await Promise.all(
      Array.from({ length: CONEXIONES_ACTIVAS }, () => pool.query('SELECT NOW() AS ahora'))
    );
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
