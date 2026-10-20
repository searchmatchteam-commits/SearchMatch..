// middlewares/authMiddleware.js
// Sesión del usuario con @supabase/ssr: los tokens viven en cookies httpOnly
// (sb-<proyecto>-auth-token) que el propio cliente de Supabase lee, renueva y borra.
//  - cargarSesion: crea el cliente de la petición (req.supabase), verifica la
//    sesión con Supabase y deja el usuario en req.usuario y res.locals.usuario.
//  - requireAuth: protege rutas (solo accesibles con sesión iniciada).
//  - redirectIfAuthenticated: evita que un usuario logueado vea login/registro.

const userModel = require('../models/userModel');
const { crearClienteServidor } = require('../config/supabase');

// Cookies de la versión anterior (tokens guardados a mano). Se borran si aparecen.
const COOKIES_ANTIGUAS = ['sm_access_token', 'sm_refresh_token'];

/** ¿La petición trae alguna cookie de sesión de Supabase? */
function tieneCookieDeSesion(req) {
  return Object.keys(req.cookies || {}).some((nombre) => nombre.startsWith('sb-') && nombre.includes('-auth-token'));
}

/**
 * Arma el objeto "usuario" que usan las vistas. Si el perfil de la tabla
 * jugador aún no existe, se usan los datos guardados en user_metadata.
 */
async function construirUsuario(usuarioAuth) {
  // Si la base de datos falla, la sesión sigue siendo válida: solo usamos los metadatos.
  const perfil = await userModel.findByAuthId(usuarioAuth.id).catch((err) => {
    console.error('⚠️  No se pudo leer el perfil del usuario:', err.message);
    return null;
  });
  const meta = usuarioAuth.user_metadata || {};
  return {
    id: perfil ? perfil.id : null,
    idAuth: usuarioAuth.id,
    nombre: (perfil && perfil.nombre) || meta.nombre || usuarioAuth.email,
    apellido: (perfil && perfil.apellido) || meta.apellido || '',
    correo: usuarioAuth.email,
  };
}

/**
 * Verifica la sesión en cada petición de página.
 * Nunca corta la petición: si no hay sesión válida, req.usuario queda en null.
 */
async function cargarSesion(req, res, next) {
  req.supabase = crearClienteServidor(req, res);
  req.usuario = null;
  res.locals.usuario = null;

  COOKIES_ANTIGUAS.forEach((nombre) => {
    if (req.cookies[nombre]) res.clearCookie(nombre, { path: '/' });
  });

  // Sin cookie de sesión no hay nada que verificar (ahorra una llamada a Supabase).
  if (!tieneCookieDeSesion(req)) return next();

  try {
    // getUser valida el token con Supabase. Si el access token expiró, el cliente
    // lo renueva con el refresh token y escribe las cookies nuevas en la respuesta;
    // si la sesión ya no es válida, borra las cookies.
    const { data, error } = await userModel.obtenerUsuarioActual(req.supabase);
    if (error || !data.user) return next();

    req.usuario = await construirUsuario(data.user);
    res.locals.usuario = req.usuario;
    return next();
  } catch (err) {
    return next(err);
  }
}

/**
 * Protege una ruta: si no hay sesión, redirige al login.
 *   router.get('/dashboard', requireAuth, pageController.dashboard);
 */
function requireAuth(req, res, next) {
  if (!req.usuario) {
    return res.redirect('/login?msg=Debes_iniciar_sesion');
  }
  return next();
}

/** Redirige al dashboard si el usuario ya tiene sesión. Se aplica a /login y /registro. */
function redirectIfAuthenticated(req, res, next) {
  if (req.usuario) {
    return res.redirect('/dashboard');
  }
  return next();
}

module.exports = {
  cargarSesion,
  requireAuth,
  redirectIfAuthenticated,
};
