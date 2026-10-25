const userModel = require('../models/userModel');
const cuentaModel = require('../models/cuentaModel');
const { crearClienteServidor } = require('../config/supabase');

const ROLES_INICIO = {
  jugador: '/perfil-jugador',
  equipo: '/mi-equipo',
};

const COOKIES_ANTIGUAS = ['sm_access_token', 'sm_refresh_token'];

function tieneCookieDeSesion(req) {
  return Object.keys(req.cookies || {}).some((nombre) => nombre.startsWith('sb-') && nombre.includes('-auth-token'));
}

async function construirUsuario(usuarioAuth) {
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
    activo: !perfil || perfil.activo !== false,
    esAdmin: Boolean(perfil && /^administrador$/i.test(perfil.rol || '')),
    terminosVersion: perfil ? perfil.terminos_version : null,
    privacidadVersion: perfil ? perfil.privacidad_version : null,
    correoGuardado: perfil ? perfil.correo : null,
  };
}

async function cargarSesion(req, res, next) {
  req.supabase = crearClienteServidor(req, res);
  req.usuario = null;
  res.locals.usuario = null;

  COOKIES_ANTIGUAS.forEach((nombre) => {
    if (req.cookies[nombre]) res.clearCookie(nombre, { path: '/' });
  });

  if (!tieneCookieDeSesion(req)) return next();

  try {
    const { data, error } = await userModel.obtenerUsuarioActual(req.supabase);
    if (error || !data.user) return next();

    const usuario = await construirUsuario(data.user);

    if (!usuario.activo) {
      await userModel.cerrarSesionEnAuth(req.supabase).catch(() => {});
      return req.path === '/login' ? next() : res.redirect('/login?msg=Cuenta_desactivada');
    }

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

function requireAuth(req, res, next) {
  if (!req.usuario) {
    return res.redirect('/login?msg=Debes_iniciar_sesion');
  }
  res.set('Cache-Control', 'no-store');
  return next();
}

function rutaDeInicio(rolInicio) {
  return ROLES_INICIO[rolInicio] ? '/dashboard' : '/select-role';
}

function requireRol(req, res, next) {
  if (!req.usuario.rolInicio) {
    return res.redirect('/select-role');
  }
  return next();
}

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
