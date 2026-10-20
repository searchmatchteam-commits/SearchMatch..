// config/supabase.js
// Clientes de Supabase para el SERVIDOR (nunca se envían al navegador).
// Las claves se leen desde .env con dotenv.
//
//  - crearClienteServidor(req, res): cliente de @supabase/ssr ligado a UNA
//    petición. Lee la sesión desde las cookies de la petición y escribe las
//    cookies nuevas (login, renovación de tokens, logout) en la respuesta.
//    Se crea uno por petición en middlewares/authMiddleware.js (req.supabase).
//  - supabaseAdmin: cliente con SUPABASE_SERVICE_ROLE_KEY (opcional).
//    Solo se usa para deshacer un registro si falla el guardado del perfil.

require('dotenv').config();
const { createServerClient } = require('@supabase/ssr');
const { createClient } = require('@supabase/supabase-js');

// supabase-js necesita la URL base del proyecto (https://xxxx.supabase.co).
// Si en .env quedó la URL de la API REST (/rest/v1/), la recortamos.
const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/rest\/v1\/?$/, '').replace(/\/$/, '');

// Aceptamos el nombre clásico (ANON_KEY) o el nuevo (PUBLISHABLE_KEY).
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.warn('⚠️  Faltan SUPABASE_URL o SUPABASE_ANON_KEY en el archivo .env (ver .env.example).');
}

// Opciones de las cookies de sesión. @supabase/ssr las crea SIN httpOnly por
// defecto (pensando en que el navegador también las lea); aquí solo las usa el
// servidor, así que las dejamos inaccesibles para el JavaScript del navegador.
const OPCIONES_COOKIE = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  path: '/',
};

/**
 * Crea el cliente de Supabase de una petición.
 * @param {import('express').Request} req - Debe pasar antes por cookie-parser.
 * @param {import('express').Response} res
 */
function crearClienteServidor(req, res) {
  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookieOptions: OPCIONES_COOKIE,
    cookies: {
      getAll() {
        return Object.entries(req.cookies || {}).map(([name, value]) => ({ name, value }));
      },
      setAll(cookies, headers) {
        // Una respuesta ya enviada no admite más cookies (no debería pasar:
        // todas las llamadas a Supabase se esperan antes de responder).
        if (res.headersSent) return;
        cookies.forEach(({ name, value, options }) => {
          // @supabase/ssr entrega maxAge en segundos; Express lo espera en milisegundos.
          const { maxAge, ...resto } = options;
          res.cookie(name, value, maxAge === undefined ? resto : { ...resto, maxAge: maxAge * 1000 });
        });
        // Cabeceras que pide Supabase para que ningún caché guarde estas respuestas.
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

module.exports = { crearClienteServidor, supabaseAdmin };
