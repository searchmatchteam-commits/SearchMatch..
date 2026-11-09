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

// Rutas que canjean un código PKCE por la sesión (Google y confirmación de correo).
// Ahí no se verifica la sesión previa: si era inválida, Supabase la limpia y con ella borra
// los verificadores PKCE (_removeSession), y el canje falla con pkce_code_verifier_not_found.
const RUTAS_CANJE_PKCE = ['/auth/callback', '/auth/confirmar'];

/** ¿La petición trae alguna cookie de sesión de Supabase? (los verificadores PKCE no cuentan) */
function tieneCookieDeSesion(req) {
  return Object.keys(req.cookies || {}).some((nombre) =>
    nombre.startsWith('sb-') && nombre.includes('-auth-token') && !nombre.endsWith('-code-verifier'));
}

/**
 * Arma el objeto "usuario" que usan las vistas. Si el perfil de la tabla
 * jugador aún no existe, se usan los datos guardados en user_metadata.
 */
function leerPerfil(authId) {
  // Si la base de datos falla, la sesión sigue siendo válida: solo usamos los metadatos.
  return userModel.findByAuthId(authId).catch((err) => {
    console.error('⚠️  No se pudo leer el perfil del usuario:', err.message);
    return null;
  });
}

/**
 * Id (sub) del access token guardado en la cookie, SIN verificar. Solo sirve para adelantar la
 * consulta del perfil mientras Supabase valida la sesión; el resultado se usa únicamente si
 * getUser confirma ese mismo id.
 */
async function idSinVerificar(supabase) {
  try {
    const { data } = await supabase.auth.getSession();
    const token = data && data.session && data.session.access_token;
    if (!token) return null;
    const carga = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
    return typeof carga.sub === 'string' ? carga.sub : null;
  } catch {
    return null;
  }
}

async function construirUsuario(usuarioAuth, perfilAdelantado) {
  const perfil = perfilAdelantado !== undefined ? perfilAdelantado : await leerPerfil(usuarioAuth.id);
  const meta = usuarioAuth.user_metadata || {};
  // Rol del panel (Administrador o Superadministrador = Administrador principal). Un administrador puede ser
  // además jugador y capitán: si tiene perfil de jugador sigue usando la app como cualquiera y entra al panel
  // aparte. "Cuenta del panel" (esCuentaPanel) es solo la que NO tiene perfil de jugador (creada en el panel).
  const rolPanel = Boolean(perfil && /^(super)?administrador$/i.test(perfil.rol || ''));
  const esCuentaPanel = rolPanel && !perfil.id_jugador;
  return {
    id: perfil ? perfil.id : null,
    idAuth: usuarioAuth.id,
    nombre: (perfil && (perfil.nombre || perfil.admin_nombre)) || meta.nombre || usuarioAuth.email,
    apellido: (perfil && perfil.apellido) || meta.apellido || '',
    correo: usuarioAuth.email,
    rolInicio: ROLES_INICIO[meta.rol_inicio] ? meta.rol_inicio : null,
    activo: !perfil || perfil.activo !== false, // CORRECCIÓN: regla 7 (sin fila en la BD se asume activa)
    // AP-001: esCuentaPanel = cuenta solo del panel (sin perfil de jugador). esAdmin exige además que su
    // selección no esté revocada (AP-011); vale también para un jugador que es administrador.
    esCuentaPanel,
    esAdmin: rolPanel && !perfil.admin_revocado_en,
    esSuperAdmin: Boolean(rolPanel && /^superadministrador$/i.test(perfil.rol || '') && !perfil.admin_revocado_en),
    terminosVersion: perfil ? perfil.terminos_version : null, // NUEVO: AR-011
    privacidadVersion: perfil ? perfil.privacidad_version : null, // NUEVO: AR-011
    correoGuardado: perfil ? perfil.correo : null, // NUEVO: AR-012 (para sincronizar un cambio de correo)
    // Registro con Google: el perfil de jugador nace sin fecha de nacimiento; se pide (18+) en /aceptar-terminos
    faltaEdad: Boolean(perfil && perfil.id_jugador && !perfil.fecha_nacimiento),
    notificacionesSinLeer: perfil ? perfil.sin_leer : 0, // NT-002: viene con el perfil, sin otra consulta
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
  if (!tieneCookieDeSesion(req) || RUTAS_CANJE_PKCE.includes(req.path)) return next();

  try {
    // getUser valida el token con Supabase. Si el access token expiró, el cliente
    // lo renueva con el refresh token y escribe las cookies nuevas en la respuesta;
    // si la sesión ya no es válida, borra las cookies.
    // Rendimiento: la consulta del perfil (BD) corre a la vez que la verificación con Supabase
    // en vez de esperarla; así cada página ahorra un viaje de ida y vuelta a la base de datos.
    const idPresunto = await idSinVerificar(req.supabase);
    const perfilAdelantado = idPresunto ? leerPerfil(idPresunto) : null;
    const { data, error } = await userModel.obtenerUsuarioActual(req.supabase);
    if (error || !data.user) return next();

    const usuario = await construirUsuario(
      data.user,
      perfilAdelantado && idPresunto === data.user.id ? await perfilAdelantado : undefined
    );

    // CORRECCIÓN: regla 7 — una cuenta desactivada pierde la sesión en su próxima petición
    // (también si un administrador la desactiva mientras navega, AD-012).
    if (!usuario.activo) {
      await userModel.cerrarSesionEnAuth(req.supabase).catch(() => {});
      // AP-001: en el panel, al login del panel (con su sesión del panel cerrada por requireAdmin al no haber usuario).
      if (req.path.startsWith('/admin')) return req.path === '/admin/login' ? next() : res.redirect('/admin/login?msg=sin-acceso');
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
 * Página de inicio de un usuario autenticado: el panel si es una cuenta de administración;
 * si no, la selección de rol si aún no eligió uno, o el dashboard.
 * @param {string|null|undefined} rolInicio - user_metadata.rol_inicio
 * @param {boolean} [esCuentaPanel]
 */
function rutaDeInicio(rolInicio, esCuentaPanel = false) {
  if (esCuentaPanel) return '/admin';
  return ROLES_INICIO[rolInicio] ? '/dashboard' : '/select-role';
}

/**
 * Exige haber elegido rol (va DESPUÉS de requireAuth):
 *   router.get('/dashboard', requireAuth, requireRol, pageController.dashboard);
 */
function requireRol(req, res, next) {
  if (req.usuario.esCuentaPanel) return res.redirect('/admin'); // AP-001: las cuentas del panel no juegan
  if (!req.usuario.rolInicio) {
    return res.redirect('/select-role');
  }
  return next();
}

/** Redirige a su inicio si el usuario ya tiene sesión. Se aplica a /login y /registro. */
function redirectIfAuthenticated(req, res, next) {
  if (req.usuario) {
    return res.redirect(rutaDeInicio(req.usuario.rolInicio, req.usuario.esCuentaPanel));
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
