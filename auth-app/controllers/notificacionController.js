const notificacionModel = require('../models/notificacionModel');
const { idValido } = require('../middlewares/validadoresAdmin');

const AVISOS = {
  todas: 'Marcaste todas tus notificaciones como leídas.',
  'sin-enlace': 'Esta notificación es solo informativa.',
  inexistente: 'Esa notificación ya no existe.',
};

function contadorSinLeer(req, res, next) {
  res.locals.notificacionesSinLeer = req.usuario ? req.usuario.notificacionesSinLeer : 0;
  return next();
}

async function listar(req, res, next) {
  const tipo = Object.prototype.hasOwnProperty.call(notificacionModel.TIPOS, req.query.tipo) ? req.query.tipo : null;
  try {
    const [notificaciones, presentes] = await Promise.all([
      notificacionModel.listar(req.usuario.idAuth, tipo),
      notificacionModel.tiposDeLaCuenta(req.usuario.idAuth),
    ]);
    // Solo las pestañas de tipos que la cuenta tiene (antes salían las 9 siempre), con sus sin leer.
    const tipos = Object.entries(notificacionModel.TIPOS)
      .filter(([clave]) => presentes.has(clave) || clave === tipo)
      .map(([clave, texto]) => ({ clave, texto, sinLeer: presentes.get(clave) || 0 }));
    return res.render('notificaciones/index', {
      titulo: 'Notificaciones',
      pagina: 'equipo',
      notificaciones,
      tipos,
      tipo,
      aviso: AVISOS[req.query.aviso] || null,
    });
  } catch (err) {
    return next(err);
  }
}

function enlaceInterno(enlace) {
  return typeof enlace === 'string' && enlace.startsWith('/') && !enlace.startsWith('//');
}

async function abrir(req, res, next) {
  try {
    const idNotificacion = idValido(req.params.id);
    const notificacion = idNotificacion ? await notificacionModel.abrir(req.usuario.idAuth, idNotificacion) : null;
    if (!notificacion) return res.redirect('/notificaciones?aviso=inexistente');
    if (!enlaceInterno(notificacion.enlace)) return res.redirect('/notificaciones?aviso=sin-enlace');
    return res.redirect(notificacion.enlace);
  } catch (err) {
    return next(err);
  }
}

async function marcarTodas(req, res, next) {
  try {
    await notificacionModel.marcarTodas(req.usuario.idAuth);
    return res.redirect('/notificaciones?aviso=todas');
  } catch (err) {
    return next(err);
  }
}

module.exports = { contadorSinLeer, listar, abrir, marcarTodas };
