// middlewares/terminosMiddleware.js
// AR-011 · Mientras la cuenta no acepte la versión vigente de los términos y de la política de
// privacidad (config/legal.js), los módulos internos quedan bloqueados: cualquier página lleva a
// /aceptar-terminos. Se monta en app.js justo después de cargarSesion.

const { aceptoVersionesVigentes } = require('../config/legal');

// Páginas que se pueden usar sin haber aceptado: leer los documentos, aceptarlos,
// salir de la cuenta y los flujos de acceso (login, registro, confirmación y recuperación).
const RUTAS_LIBRES = ['/', '/login', '/registro', '/logout', '/terminos', '/privacidad', '/aceptar-terminos'];
const PREFIJOS_LIBRES = ['/auth/', '/recuperar'];

function rutaLibre(ruta) {
  return RUTAS_LIBRES.includes(ruta) || PREFIJOS_LIBRES.some((prefijo) => ruta.startsWith(prefijo));
}

function exigirTerminos(req, res, next) {
  if (!req.usuario || rutaLibre(req.path) || aceptoVersionesVigentes(req.usuario)) return next();
  // Las peticiones de fetch (JSON) reciben un error claro en vez de una redirección.
  if (req.accepts(['html', 'json']) === 'json') {
    return res.status(403).json({ ok: false, error: 'Debes aceptar los términos vigentes para continuar.' });
  }
  return res.redirect('/aceptar-terminos');
}

module.exports = { exigirTerminos };
