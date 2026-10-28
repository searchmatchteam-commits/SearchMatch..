// controllers/adminConfigController.js
// Configuración del panel. TO-013: pasarelas de pago (credenciales cifradas, prueba de conexión, activar/desactivar,
// entorno de pruebas o producción y tipo de cambio CLP→USD para PayPal).

const pasarelaModel = require('../models/pasarelaModel');
const pasarelasApi = require('../models/pasarelasApi');
const cifrado = require('../config/cifrado');
const { PASARELAS, ENTORNOS, TIPO_CAMBIO, leerCredenciales, leerTipoCambio } = require('../config/pasarelas');

const AVISOS = {
  guardada: 'Pasarela guardada.',
  'guardada-sin-probar': 'Credenciales guardadas. Prueba la conexión antes de activarla.',
  activada: 'Pasarela activada: ya se ofrece en los pagos nuevos.',
  desactivada: 'Pasarela desactivada: deja de ofrecerse en pagos nuevos. Los pagos ya aprobados no cambian.',
  'sin-probar': 'Primero prueba la conexión con las credenciales guardadas.',
  'sin-tipo-cambio': 'Para activar PayPal define un tipo de cambio CLP a USD mayor a 0.',
  'sin-cambio': 'No hubo cambios.',
  'sin-clave': 'Falta PASARELAS_CLAVE en el .env del servidor: sin ella no se pueden guardar credenciales.',
};

function admin(req) {
  return { id: req.usuario.id, nombre: req.usuario.nombre };
}

function clavePasarela(req) {
  return Object.prototype.hasOwnProperty.call(PASARELAS, req.params.clave) ? req.params.clave : null;
}

async function render(req, res, { status = 200, errores = {}, prueba = null } = {}) {
  return res.status(status).render('admin/pasarelas', {
    titulo: 'Pasarelas de pago',
    pagina: 'equipo',
    seccion: 'configuracion',
    subseccion: 'pasarelas',
    pasarelas: await pasarelaModel.listar(),
    definiciones: PASARELAS,
    entornos: ENTORNOS,
    tipoCambio: TIPO_CAMBIO,
    claveDisponible: cifrado.disponible(),
    errores, // { [clave]: { campo: mensaje } }
    prueba, // { clave, ok, detalle }
    aviso: AVISOS[req.query.aviso] || null,
  });
}

async function mostrar(req, res, next) {
  try {
    return await render(req, res);
  } catch (err) {
    return next(err);
  }
}

async function guardar(req, res, next) {
  try {
    const clave = clavePasarela(req);
    if (!clave) return next();
    if (!cifrado.disponible()) return res.redirect('/admin/configuracion/pasarelas?aviso=sin-clave');
    const actuales = await pasarelaModel.credenciales(clave).catch(() => null);
    const { credenciales, errores, cambiadas } = leerCredenciales(clave, req.body, actuales);
    const entorno = Object.prototype.hasOwnProperty.call(ENTORNOS, req.body.entorno) ? req.body.entorno : null;
    if (!entorno) errores.entorno = 'Elige el entorno.';
    let tipoCambio = null;
    if (clave === 'paypal' && String(req.body.tipo_cambio || '').trim()) {
      tipoCambio = leerTipoCambio(req.body.tipo_cambio);
      if (tipoCambio === null) errores.tipo_cambio = `El tipo de cambio debe ser un número mayor a 0 (entre ${TIPO_CAMBIO.min} y ${TIPO_CAMBIO.max}).`;
    }
    if (Object.keys(errores).length > 0) return await render(req, res, { status: 400, errores: { [clave]: errores } });
    const resultado = await pasarelaModel.guardar(admin(req), clave, { credenciales, cambiadas, entorno, tipoCambio });
    return res.redirect(`/admin/configuracion/pasarelas?aviso=${resultado}#${clave}`);
  } catch (err) {
    return next(err);
  }
}

/** TO-013 c1 · Prueba las credenciales guardadas contra la pasarela real. */
async function probar(req, res, next) {
  try {
    const clave = clavePasarela(req);
    if (!clave) return next();
    const p = await pasarelaModel.obtener(clave);
    if (!p.configurada) return await render(req, res, { status: 400, prueba: { clave, ok: false, detalle: 'Guarda primero las credenciales.' } });
    const credenciales = await pasarelaModel.credenciales(clave);
    const resultado = await pasarelasApi.probarConexion(clave, credenciales, p.entorno);
    await pasarelaModel.registrarPrueba(admin(req), clave, resultado.ok, resultado.detalle);
    return await render(req, res, { prueba: { clave, ...resultado } });
  } catch (err) {
    return next(err);
  }
}

function cambiarActiva(activa) {
  return async (req, res, next) => {
    try {
      const clave = clavePasarela(req);
      if (!clave) return next();
      const resultado = await pasarelaModel.cambiarActiva(admin(req), clave, activa);
      return res.redirect(`/admin/configuracion/pasarelas?aviso=${resultado}#${clave}`);
    } catch (err) {
      return next(err);
    }
  };
}

module.exports = { mostrar, guardar, probar, activar: cambiarActiva(true), desactivar: cambiarActiva(false) };
