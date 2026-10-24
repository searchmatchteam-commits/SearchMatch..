// middlewares/authMiddleware.js
// Sesión del usuario con @supabase/ssr: los tokens viven en cookies httpOnly
// (sb-<proyecto>-auth-token) que el propio cliente de Supabase lee, renueva y borra.
//  - cargarSesion: crea el cliente de la petición (req.supabase), verifica la
//    sesión con Supabase y deja el usuario en req.usuario y res.locals.usuario.
//  - requireAuth: protege rutas (solo accesibles con sesión iniciada).
//  - requireRol: manda a /select-role a quien aún no eligió cómo usar la app.
//  - redirectIfAuthenticated: evita que un usuario logueado vea login/registro.
//  - rutaDeInicio: a dónde va un usuario recién autenticado.

const userModel = require('../models/userModel');
const cuentaModel = require('../models/cuentaModel'); // NUEVO: AR-012
const { crearClienteServidor } = require('../config/supabase');

// Roles de la pantalla "¿Cómo quieres empezar?" y el siguiente paso de cada uno.
const ROLES_INICIO = {
  jugador: '/perfil-jugador',
  equipo: '/mi-equipo', // sin equipo todavía → lista vacía con "Crear mi primer equipo"
};

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
    rolInicio: ROLES_INICIO[meta.rol_inicio] ? meta.rol_inicio : null,
    activo: !perfil || perfil.activo !== false, // CORRECCIÓN: regla 7 (sin fila en la BD se asume activa)
    esAdmin: Boolean(perfil && /^administrador$/i.test(perfil.rol || '')), // NUEVO: AR-004
    terminosVersion: perfil ? perfil.terminos_version : null, // NUEVO: AR-011
    privacidadVersion: perfil ? perfil.privacidad_version : null, // NUEVO: AR-011
    correoGuardado: perfil ? perfil.correo : null, // NUEVO: AR-012 (para sincronizar un cambio de correo)
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

    const usuario = await construirUsuario(data.user);

    // CORRECCIÓN: regla 7 — una cuenta desactivada pierde la sesión en su próxima petición
    // (también si un administrador la desactiva mientras navega, AD-012).
    if (!usuario.activo) {
      await userModel.cerrarSesionEnAuth(req.supabase).catch(() => {});
      return req.path === '/login' ? next() : res.redirect('/login?msg=Cuenta_desactivada');
    }

    // NUEVO: AR-012 — si el usuario confirmó un correo principal nuevo (Supabase ya lo cambió),
    // se copia a la tabla usuario para que búsquedas y validaciones usen el correo vigente.
    if (usuario.correoGuardado && usuario.correo && usuario.correoGuardado !== usuario.correo) {
      await cuentaModel.sincronizarCorreo(usuario.idAuth, usuario.correo).catch((err) => {
        console.error('⚠️  No se pudo sincronizar el correo nuevo:', err.message);
      });
    }

    req.usuario = usuario;
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
  // Páginas privadas: el navegador no las guarda, así "Atrás" tras cerrar sesión
  // o cambiar de cuenta no muestra datos de la cuenta anterior.
  res.set('Cache-Control', 'no-store');
  return next();
}

/**
 * Página de inicio de un usuario autenticado: la selección de rol si aún no
 * eligió uno, o el dashboard si ya lo hizo.
 * @param {string|null|undefined} rolInicio - user_metadata.rol_inicio
 */
function rutaDeInicio(rolInicio) {
  return ROLES_INICIO[rolInicio] ? '/dashboard' : '/select-role';
}

/**
 * Exige haber elegido rol (va DESPUÉS de requireAuth):
 *   router.get('/dashboard', requireAuth, requireRol, pageController.dashboard);
 */
function requireRol(req, res, next) {
  if (!req.usuario.rolInicio) {
    return res.redirect('/select-role');
  }
  return next();
}

/** Redirige a su inicio si el usuario ya tiene sesión. Se aplica a /login y /registro. */
function redirectIfAuthenticated(req, res, next) {
  if (req.usuario) {
    return res.redirect(rutaDeInicio(req.usuario.rolInicio));
  }
  return next();
}

module.exports = {
  cargarSesion,
  requireAuth,
  requireRol,
  redirectIfAuthenticated,
  rutaDeInicio,
  ROLES_INICIO,
};
