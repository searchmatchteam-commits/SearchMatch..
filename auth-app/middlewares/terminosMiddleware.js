const { aceptoVersionesVigentes } = require('../config/legal');

const RUTAS_LIBRES = ['/', '/login', '/registro', '/logout', '/terminos', '/privacidad', '/aceptar-terminos'];
const PREFIJOS_LIBRES = ['/auth/', '/recuperar'];

function rutaLibre(ruta) {
  return RUTAS_LIBRES.includes(ruta) || PREFIJOS_LIBRES.some((prefijo) => ruta.startsWith(prefijo));
}

function exigirTerminos(req, res, next) {
  // Las cuentas del panel (AP-001) no son de jugador: no aceptan los términos de los usuarios.
  if (!req.usuario || req.usuario.esCuentaPanel || rutaLibre(req.path) || aceptoVersionesVigentes(req.usuario)) return next();
  if (req.accepts(['html', 'json']) === 'json') {
    return res.status(403).json({ ok: false, error: 'Debes aceptar los términos vigentes para continuar.' });
  }
  return res.redirect('/aceptar-terminos');
}

module.exports = { exigirTerminos };
