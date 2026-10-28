// controllers/adminAccesoController.js
// AP-001 · Ingreso y salida del panel de administración (/admin/login, /admin/logout).
// Cualquier falla (credenciales malas, cuenta que no es del panel, revocada o desactivada) responde con el
// mismo mensaje genérico. 5 fallos seguidos bloquean ese correo 15 minutos y se avisa al Administrador principal.

const userModel = require('../models/userModel');
const panelModel = require('../models/panelModel');
const actividad = require('../models/actividadModel');
const { notificarUsuario } = require('../models/notificacionModel');
const { pool } = require('../config/db');
const { ACCESO, COOKIE_PANEL } = require('../config/panel');
const { OPCIONES_COOKIE } = require('../middlewares/rolMiddleware');

const MSG_GENERICO = 'Correo o contraseña incorrectos.';
const MSG_BLOQUEADO = `Demasiados intentos fallidos. El acceso quedó bloqueado por ${ACCESO.bloqueoMin} minutos.`;

const AVISOS = {
  inactividad: `Tu sesión del panel se cerró tras ${ACCESO.inactividadMin} minutos sin actividad. Ingresa de nuevo.`,
  salida: 'Cerraste la sesión del panel.',
  'sin-acceso': 'Tu acceso al panel ya no está vigente.',
  contrasena: 'Contraseña guardada. Ya puedes ingresar al panel.',
};

const REGEX_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function render(res, { status = 200, correo = '', error = null, aviso = null } = {}) {
  return res.status(status).render('admin/login', {
    titulo: 'Panel de administración',
    pagina: 'auth',
    correo,
    errores: error ? [error] : [],
    aviso,
  });
}

async function mostrarLogin(req, res, next) {
  try {
    // Con una sesión del panel vigente no hace falta volver a ingresar.
    const token = req.cookies[COOKIE_PANEL];
    if (req.usuario && req.usuario.esAdmin && token && (await panelModel.tocarSesion(token, req.usuario.id)) === 'vigente') {
      return res.redirect('/admin');
    }
    return render(res, { aviso: AVISOS[req.query.msg] || null });
  } catch (err) {
    return next(err);
  }
}

/** Deja constancia del bloqueo y avisa al Administrador principal (si falla, solo se registra en consola). */
async function avisarBloqueo(correo) {
  try {
    await actividad.registrar(pool, {
      admin: null, seccion: 'acceso', accion: 'Bloqueo por intentos fallidos', elementoTipo: 'correo', elemento: correo,
      nuevo: { bloqueadoMinutos: ACCESO.bloqueoMin, intentos: ACCESO.maxFallidos },
    });
    const idPrincipal = await panelModel.idPrincipal();
    if (idPrincipal) {
      await notificarUsuario(idPrincipal, 'moderacion',
        `Se bloqueó por ${ACCESO.bloqueoMin} minutos el acceso al panel de ${correo} tras ${ACCESO.maxFallidos} intentos fallidos seguidos.`,
        '/admin/actividad?seccion=acceso');
    }
  } catch (err) {
    console.error('⚠️  No se pudo avisar el bloqueo del panel:', err.message);
  }
}

async function ingresar(req, res, next) {
  const correo = String(req.body.correo || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  try {
    if (!REGEX_CORREO.test(correo) || !password) {
      return render(res, { status: 400, correo, error: 'Ingresa tu correo y tu contraseña.' });
    }
    if (await panelModel.bloqueado(correo)) return render(res, { status: 429, correo, error: MSG_BLOQUEADO });

    const { data, error } = await userModel.iniciarSesionEnAuth(req.supabase, { correo, password });
    const cuenta = error ? null : await panelModel.cuentaPorAuth(data.user.id);
    if (error || !cuenta || cuenta.estado !== 'activo') {
      if (!error) await userModel.cerrarSesionEnAuth(req.supabase).catch(() => {});
      const recienBloqueado = await panelModel.registrarFallo(correo);
      if (recienBloqueado) await avisarBloqueo(correo);
      return render(res, { status: 401, correo, error: MSG_GENERICO });
    }

    await panelModel.reiniciarFallos(correo);
    const token = await panelModel.abrirSesion(cuenta.id);
    res.cookie(COOKIE_PANEL, token, OPCIONES_COOKIE);
    return res.redirect('/admin');
  } catch (err) {
    return next(err);
  }
}

async function salir(req, res) {
  await panelModel.cerrarSesion(req.cookies[COOKIE_PANEL], 'salida').catch(() => {});
  res.clearCookie(COOKIE_PANEL, OPCIONES_COOKIE);
  const { error } = await userModel.cerrarSesionEnAuth(req.supabase).catch((err) => ({ error: err }));
  if (error) console.error('⚠️  No se pudo revocar la sesión en Supabase:', error.message);
  res.set('Clear-Site-Data', '"cache"');
  return res.redirect('/admin/login?msg=salida');
}

module.exports = { mostrarLogin, ingresar, salir };
