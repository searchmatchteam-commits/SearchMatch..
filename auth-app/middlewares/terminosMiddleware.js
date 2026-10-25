const { aceptoVersionesVigentes } = require('../config/legal');

const RUTAS_LIBRES = ['/', '/login', '/registro', '/logout', '/terminos', '/privacidad', '/aceptar-terminos'];
const PREFIJOS_LIBRES = ['/auth/', '/recuperar'];

function rutaLibre(ruta) {
  return RUTAS_LIBRES.includes(ruta) || PREFIJOS_LIBRES.some((prefijo) => ruta.startsWith(prefijo));
}

function exigirTerminos(req, res, next) {
  if (!req.usuario || rutaLibre(req.path) || aceptoVersionesVigentes(req.usuario)) return next();
  if (req.accepts(['html', 'json']) === 'json') {
    return res.status(403).json({ ok: false, error: 'Debes aceptar los términos vigentes para continuar.' });
  }
  return res.redirect('/aceptar-terminos');
}

module.exports = { exigirTerminos };
