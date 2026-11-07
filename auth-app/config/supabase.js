require('dotenv').config();
const { createServerClient } = require('@supabase/ssr');
const { createClient } = require('@supabase/supabase-js');
const { cacheBreve } = require('./cacheBreve');

const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/rest\/v1\/?$/, '').replace(/\/$/, '');

const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.warn('⚠️  Faltan SUPABASE_URL o SUPABASE_ANON_KEY en el archivo .env (ver .env.example).');
}

const OPCIONES_COOKIE = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  path: '/',
};

function crearClienteServidor(req, res) {
  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookieOptions: OPCIONES_COOKIE,
    cookies: {
      getAll() {
        return Object.entries(req.cookies || {}).map(([name, value]) => ({ name, value }));
      },
      setAll(cookies, headers) {
        if (res.headersSent) return;
        cookies.forEach(({ name, value, options }) => {
          const { maxAge, ...resto } = options;
          res.cookie(name, value, maxAge === undefined ? resto : { ...resto, maxAge: maxAge * 1000 });
        });
        if (headers) res.set(headers);
      },
    },
  });
}

const supabaseAdmin = SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    })
  : null;

function crearClienteTemporal() {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

// Proveedores de acceso habilitados en el panel de Supabase (GET /auth/v1/settings → external).
// signInWithOAuth no lo revisa: con Google apagado, Supabase muestra un JSON de error en su propio dominio.
const leerAjustesAuth = cacheBreve(30 * 1000, async () => {
  const respuesta = await fetch(`${SUPABASE_URL}/auth/v1/settings`, { headers: { apikey: SUPABASE_ANON_KEY } });
  if (!respuesta.ok) throw new Error(`/auth/v1/settings respondió ${respuesta.status}`);
  return respuesta.json();
});

/** ¿Está habilitado el proveedor en Supabase? Si no se puede consultar, se asume que sí (no bloquea el acceso). */
async function proveedorHabilitado(proveedor) {
  try {
    const ajustes = await leerAjustesAuth();
    return Boolean(ajustes && ajustes.external && ajustes.external[proveedor]);
  } catch (err) {
    console.error('⚠️  No se pudieron leer los ajustes de Auth de Supabase:', err.message);
    return true;
  }
}

module.exports = { crearClienteServidor, supabaseAdmin, crearClienteTemporal, proveedorHabilitado };
