// middlewares/rolMiddleware.js
// AP-001 · Acceso al panel de administración.
//  - requireAdmin: exige una cuenta del panel vigente (no revocada ni desactivada) y una sesión del panel
//    abierta en /admin/login (cookie sm_admin) con actividad en los últimos 30 minutos. Si falta algo,
//    cierra lo que haya y manda al login del panel. Se aplica a todo el router /admin.
//  - requirePrincipal: además exige ser el Administrador principal (rol superadministrador, AP-011).

const panelModel = require('../models/panelModel');
const alertaModel = require('../models/alertaModel');
const userModel = require('../models/userModel');
const { COOKIE_PANEL, seccionesPara } = require('../config/panel');

const OPCIONES_COOKIE = {
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
  path: '/admin',
};

function quiereJSON(req) {
  return req.accepts(['html', 'json']) === 'json';
}

/** Cierra la sesión del panel y la de Supabase y manda al login del panel con un aviso. */
async function expulsar(req, res, msg) {
  const token = req.cookies[COOKIE_PANEL];
  if (token) await panelModel.cerrarSesion(token, msg).catch(() => {});
  res.clearCookie(COOKIE_PANEL, OPCIONES_COOKIE);
  if (req.usuario) await userModel.cerrarSesionEnAuth(req.supabase).catch(() => {});
  if (quiereJSON(req)) return res.status(401).json({ ok: false, error: 'Tu sesión del panel terminó. Ingresa de nuevo.' });
  return res.redirect(`/admin/login${msg ? `?msg=${msg}` : ''}`);
}

async function requireAdmin(req, res, next) {
  try {
    res.set('Cache-Control', 'no-store');
    const token = req.cookies[COOKIE_PANEL];
    if (!req.usuario || !token) {
      if (quiereJSON(req)) return res.status(401).json({ ok: false, error: 'Debes ingresar al panel.' });
      return res.redirect('/admin/login');
    }
    // Revocada o desactivada (cargarSesion ya expulsa a las desactivadas): fuera, aunque tenga cookie.
    if (!req.usuario.esAdmin) return await expulsar(req, res, 'sin-acceso');
    const estado = await panelModel.tocarSesion(token, req.usuario.id);
    if (estado === 'vencida') return await expulsar(req, res, 'inactividad');
    if (estado !== 'vigente') return await expulsar(req, res, null);

    res.locals.seccionesPanel = seccionesPara(req.usuario.esSuperAdmin);
    res.locals.alertasPendientes = await alertaModel.contar().catch((err) => {
      console.error('⚠️  No se pudieron contar las alertas del panel:', err.message);
      return 0;
    });
    return next();
  } catch (err) {
    return next(err);
  }
}

function requirePrincipal(req, res, next) {
  if (!req.usuario || !req.usuario.esSuperAdmin) {
    if (quiereJSON(req)) return res.status(403).json({ ok: false, error: 'Solo el Administrador principal puede hacer esto.' });
    return res.status(403).render('admin/sin-permiso', {
      titulo: 'Sin permiso',
      pagina: 'equipo',
      seccion: null,
      mensaje: 'Esta sección es solo para el Administrador principal de SearchMatch.',
    });
  }
  return next();
}

module.exports = { requireAdmin, requirePrincipal, requireSuperAdmin: requirePrincipal, OPCIONES_COOKIE };
