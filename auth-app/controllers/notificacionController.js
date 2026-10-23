// controllers/notificacionController.js
// Bandeja de notificaciones (Fase 4):
//  NT-002 GET  /notificaciones?tipo=...            → lista, filtro por tipo y estado vacío
//  NT-004 GET  /notificaciones/:id/abrir           → la marca como leída y lleva al elemento
//  NT-003 POST /notificaciones/leidas              → marca todas como leídas
// contadorSinLeer es un middleware (app.js) que deja en las vistas cuántas hay sin leer (campana).

const notificacionModel = require('../models/notificacionModel');
const { idValido } = require('../middlewares/validadoresAdmin');

const AVISOS = {
  todas: 'Marcaste todas tus notificaciones como leídas.',
  'sin-enlace': 'Esta notificación es solo informativa.',
  inexistente: 'Esa notificación ya no existe.',
};

/** Middleware: res.locals.notificacionesSinLeer para la campana (0 sin sesión o si la base falla). */
async function contadorSinLeer(req, res, next) {
  res.locals.notificacionesSinLeer = 0;
  if (!req.usuario || req.method !== 'GET') return next();
  try {
    res.locals.notificacionesSinLeer = await notificacionModel.contarSinLeer(req.usuario.idAuth);
  } catch (err) {
    console.error('⚠️  No se pudo contar las notificaciones:', err.message);
  }
  return next();
}

// GET /notificaciones
async function listar(req, res, next) {
  const tipo = Object.prototype.hasOwnProperty.call(notificacionModel.TIPOS, req.query.tipo) ? req.query.tipo : null;
  try {
    const notificaciones = await notificacionModel.listar(req.usuario.idAuth, tipo);
    return res.render('notificaciones/index', {
      titulo: 'Notificaciones',
      pagina: 'equipo',
      notificaciones,
      tipos: notificacionModel.TIPOS,
      tipo,
      aviso: AVISOS[req.query.aviso] || null,
    });
  } catch (err) {
    return next(err);
  }
}

/** Solo rutas internas de la app (evita que una notificación lleve a otro sitio). */
function enlaceInterno(enlace) {
  return typeof enlace === 'string' && enlace.startsWith('/') && !enlace.startsWith('//');
}

// GET /notificaciones/:id/abrir
async function abrir(req, res, next) {
  try {
    const idNotificacion = idValido(req.params.id);
    const notificacion = idNotificacion ? await notificacionModel.abrir(req.usuario.idAuth, idNotificacion) : null;
    if (!notificacion) return res.redirect('/notificaciones?aviso=inexistente');
    // El destino (desafío, partido, reserva...) informa si el elemento ya no existe o no hay permiso.
    if (!enlaceInterno(notificacion.enlace)) return res.redirect('/notificaciones?aviso=sin-enlace');
    return res.redirect(notificacion.enlace);
  } catch (err) {
    return next(err);
  }
}

// POST /notificaciones/leidas
async function marcarTodas(req, res, next) {
  try {
    await notificacionModel.marcarTodas(req.usuario.idAuth);
    return res.redirect('/notificaciones?aviso=todas');
  } catch (err) {
    return next(err);
  }
}

module.exports = { contadorSinLeer, listar, abrir, marcarTodas };
