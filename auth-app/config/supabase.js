require('dotenv').config();
const { createServerClient } = require('@supabase/ssr');
const { createClient } = require('@supabase/supabase-js');

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

module.exports = { crearClienteServidor, supabaseAdmin, crearClienteTemporal };
