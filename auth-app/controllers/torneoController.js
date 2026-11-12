// controllers/torneoController.js
// Sección Torneos de los jugadores: ver torneos, inscribir o retirar un equipo (solo su capitán)
// y ver el fixture, la tabla (liga) o la llave (eliminación directa). Los organiza la administración desde el
// panel; los borradores no se muestran.

const torneoModel = require('../models/torneoModel');
const equipoModel = require('../models/equipoModel');
const { idValido } = require('../middlewares/validadoresAdmin');
const { partirPremio, MINUTOS_RESERVA_PAGO, formatoCLP } = require('../config/torneos');
const pasarelaModel = require('../models/pasarelaModel');
const cifrado = require('../config/cifrado');
const { webpayCrear, webpayConfirmar } = require('../models/pasarelasApi');
const { urlApp, origenPropio } = require('../config/urlApp');

const AVISOS = {
  inscrito: '¡Equipo inscrito! Te avisaremos cuando empiece el torneo.',
  retirado: 'Retiraste a tu equipo del torneo.',
  cerrado: 'Las inscripciones de este torneo ya cerraron.',
  lleno: 'El torneo ya no tiene cupos.',
  'no-capitan': 'Solo el capitán que creó el equipo puede inscribirlo.',
  modalidad: 'Tu equipo no juega la modalidad de este torneo.',
  'ya-inscrito': 'Ese equipo ya está inscrito.',
  inexistente: 'Ese torneo ya no existe.',
  reglas: 'Debes aceptar las reglas del torneo para inscribir a tu equipo.',
  'modalidad-agregada': 'Listo: tu equipo ya juega esta modalidad. Ahora puedes inscribirlo.',
  'con-pago': 'Este torneo tiene costo de inscripción: elige pagar con Webpay.',
  pagado: '¡Pago aprobado! Tu equipo quedó inscrito. Te avisaremos cuando empiece el torneo.',
  'pago-rechazado': 'El pago fue rechazado, así que el cupo se liberó. Puedes intentarlo de nuevo con otra tarjeta.',
  'pago-anulado': 'El pago no se completó (lo anulaste o se acabó el tiempo), así que el cupo se liberó. Puedes intentarlo de nuevo.',
  'pago-error': 'No pudimos conectar con Webpay. No se hizo ningún cobro; inténtalo de nuevo en unos minutos.',
  'pago-verificacion': 'Recibimos tu pago, pero el cupo ya no estaba disponible. La administración lo revisará para reembolsarlo.',
  'pago-inexistente': 'No encontramos ese pago. Si se hizo un cobro, escríbenos con el comprobante.',
  'sin-medio': 'El pago en línea de este torneo no está disponible por ahora. Inténtalo más tarde.',
  gratuito: 'Este torneo es gratuito: inscríbete sin pagar.',
};

async function listar(req, res, next) {
  try {
    const [torneos, misTorneos, capitan] = await Promise.all([
      torneoModel.listar(),
      torneoModel.idsMisTorneos(req.usuario.idAuth),
      torneoModel.resumenCapitan(req.usuario.idAuth),
    ]);
    return res.render('torneos', {
      titulo: 'Torneos',
      pagina: 'equipo',
      torneoLista: true, // carga torneos-lista.css/.js (cartas y pestañas)
      torneos,
      misTorneos,
      capitan,
      partirPremio,
      aviso: AVISOS[req.query.aviso] || null,
    });
  } catch (err) {
    return next(err);
  }
}

async function detalle(req, res, next) {
  try {
    const torneo = await torneoModel.obtener(idValido(req.params.id));
    if (!torneo) return res.redirect('/torneos?aviso=inexistente');
    const [misEquipos, habilitadas] = await Promise.all([
      torneoModel.equiposDelCapitan(req.usuario.idAuth, torneo.id),
      torneo.precio > 0 ? pasarelaModel.habilitadas() : {},
    ]);
    // Modal de victoria: el torneo terminó y lo ganó un equipo del que el usuario es capitán
    const equipoCampeon = torneo.campeon && misEquipos.find((e) => e.id === torneo.campeon.id);
    const victoria = equipoCampeon
      ? { equipo: equipoCampeon.nombre, monto: torneo.premios ? partirPremio(torneo.premios).monto : '' }
      : null;
    return res.render('torneos/detalle', {
      titulo: torneo.nombre,
      pagina: 'equipo',
      torneoDetalle: true, // carga torneo-detalle.css/.js (pestañas, cuadrante, rejilla)
      torneo,
      misEquipos,
      victoria,
      // Con precio: se paga con Webpay si el torneo lo acepta y la pasarela está activa.
      pagoDisponible: torneo.precio > 0 && torneo.mediosPago.includes('webpay') && Boolean(habilitadas.webpay) && cifrado.disponible(),
      minutosReserva: MINUTOS_RESERVA_PAGO,
      aviso: AVISOS[req.query.aviso] || null,
    });
  } catch (err) {
    return next(err);
  }
}

async function inscribir(req, res, next) {
  try {
    const idTorneo = idValido(req.params.id);
    const idEquipo = idValido(req.body.id_equipo);
    // El modal de inscripción pide aceptar las reglas antes de enviar.
    if (req.body.acepto_reglas !== 'si') return res.redirect(`/torneos/${idTorneo}?aviso=reglas`);
    if (!idTorneo || !idEquipo) return res.redirect(`/torneos/${idTorneo}?aviso=no-capitan`);
    const resultado = await torneoModel.inscribir(req.usuario.idAuth, idTorneo, idEquipo);
    if (resultado === 'con-pago') return await pagarConWebpay(req, res, idTorneo, idEquipo);
    return res.redirect(`/torneos/${idTorneo}?aviso=${resultado}`);
  } catch (err) {
    return next(err);
  }
}

// ---------- Inscripción con pago: Webpay Plus ----------

/**
 * Credenciales de Webpay descifradas, o null si no se pueden leer. Fallan si en el servidor falta PASARELAS_CLAVE
 * o no es la misma con la que se guardaron en el panel: eso no debe terminar en un error 500 al pagar.
 */
async function credencialesWebpay() {
  try {
    return await pasarelaModel.credenciales('webpay');
  } catch (err) {
    console.error('⚠️  No se pudieron descifrar las credenciales de Webpay (revisa PASARELAS_CLAVE en el servidor):', err.message);
    return null;
  }
}

/** Reserva el cupo, crea la transacción en Webpay y manda al capitán a pagar (formulario que se envía solo). */
async function pagarConWebpay(req, res, idTorneo, idEquipo) {
  const volver = (aviso) => res.redirect(`/torneos/${idTorneo}?aviso=${aviso}#inscripcion`);
  if (req.body.medio_pago && req.body.medio_pago !== 'webpay') return volver('sin-medio');
  const webpay = (await pasarelaModel.habilitadas()).webpay;
  const credenciales = webpay ? await credencialesWebpay() : null;
  if (!credenciales) return volver('sin-medio');

  const reserva = await torneoModel.reservarParaPago(req.usuario.idAuth, idTorneo, idEquipo, 'webpay', webpay.entorno);
  if (reserva.resultado !== 'reservado') return volver(reserva.resultado);

  let transaccion;
  try {
    transaccion = await webpayCrear(credenciales, webpay.entorno, {
      ordenCompra: reserva.ordenCompra,
      sesion: String(reserva.idPago),
      monto: reserva.monto,
      urlRetorno: `${origenPropio(req) || urlApp()}/torneos/pagos/webpay/retorno`,
    });
  } catch (err) {
    transaccion = { ok: false, error: err.message };
  }
  if (!transaccion.ok) {
    console.error('⚠️  Webpay no creó la transacción:', transaccion.error);
    await torneoModel.rechazarPago(reserva.idPago, `Webpay no creó la transacción (${transaccion.error}).`);
    return volver('pago-error');
  }
  await torneoModel.guardarTokenPago(reserva.idPago, transaccion.token);
  res.set('Cache-Control', 'no-store');
  return res.render('torneos/pago-webpay', { url: transaccion.url, token: transaccion.token, monto: formatoCLP(reserva.monto) });
}

/**
 * Vuelta desde Webpay (GET o POST, sin exigir sesión: Transbank vuelve con un POST desde su sitio y el navegador
 * no envía la cookie de sesión). Se reconoce el pago por su token y se confirma con Transbank:
 *  - token_ws solo: el capitán terminó en el formulario → se confirma (commit) y se aprueba o rechaza.
 *  - TBK_TOKEN: anuló el pago en Webpay.  - Solo TBK_ORDEN_COMPRA: se agotó el tiempo del formulario.
 */
async function retornoWebpay(req, res, next) {
  try {
    const p = { ...req.query, ...(req.body || {}) };
    const tokenWs = p.token_ws ? String(p.token_ws) : null;
    const tbkToken = p.TBK_TOKEN ? String(p.TBK_TOKEN) : null;
    const irA = (pago, aviso) => res.redirect(pago ? `/torneos/${pago.id_torneo}?aviso=${aviso}#inscripcion` : `/torneos?aviso=${aviso}`);

    if (tokenWs && !tbkToken) {
      const pago = await torneoModel.pagoPorToken(tokenWs);
      if (!pago) return irA(null, 'pago-inexistente');
      if (pago.estado !== 'iniciado') {
        // Recarga o intento reemplazado: no se vuelve a confirmar (un intento viejo nunca se cobra).
        return irA(pago, { aprobado: 'pagado', en_verificacion: 'pago-verificacion' }[pago.estado] || 'pago-anulado');
      }
      const credenciales = await credencialesWebpay();
      let r;
      try {
        r = credenciales ? await webpayConfirmar(credenciales, pago.entorno, tokenWs) : { ok: false, error: 'sin credenciales' };
      } catch (err) {
        r = { ok: false, error: err.message };
      }
      if (!r.ok) {
        console.error('⚠️  Webpay no confirmó la transacción:', r.error);
        await torneoModel.rechazarPago(pago.id, `No se pudo confirmar con Webpay (${r.error}).`);
        return irA(pago, 'pago-error');
      }
      if (!r.aprobada) {
        await torneoModel.rechazarPago(pago.id, `Rechazado por Webpay (código ${r.datos.response_code}).`, r.datos);
        return irA(pago, 'pago-rechazado');
      }
      const resultado = await torneoModel.aprobarPago(pago.id, {
        monto: Number(r.datos.amount), autorizacion: r.datos.authorization_code || null, datos: r.datos,
      });
      return irA(pago, resultado === 'pagado' ? 'pagado' : resultado === 'verificacion' ? 'pago-verificacion' : 'pago-anulado');
    }

    // Anulado por el usuario (TBK_TOKEN) o tiempo agotado (solo la orden de compra)
    const pago = tbkToken ? await torneoModel.pagoPorToken(tbkToken) : await torneoModel.pagoPorOrden(p.TBK_ORDEN_COMPRA);
    if (!pago) return irA(null, 'pago-inexistente');
    await torneoModel.rechazarPago(pago.id, tbkToken ? 'Pago anulado en Webpay.' : 'Se agotó el tiempo para pagar en Webpay.');
    return irA(pago, 'pago-anulado');
  } catch (err) {
    return next(err);
  }
}

// POST /torneos/:id/habilitar-modalidad → suma la modalidad del torneo al equipo (botón del panel de inscripción)
async function habilitarModalidad(req, res, next) {
  try {
    const torneo = await torneoModel.obtener(idValido(req.params.id));
    if (!torneo) return res.redirect('/torneos?aviso=inexistente');
    if (!torneo.conInscripciones || torneo.inscripcionVencida) return res.redirect(`/torneos/${torneo.id}?aviso=cerrado`);
    const idEquipo = idValido(req.body.id_equipo);
    const resultado = idEquipo ? await equipoModel.agregarModalidad(req.usuario.idAuth, idEquipo, torneo.idModalidad) : 'sin-permiso';
    return res.redirect(`/torneos/${torneo.id}?aviso=${resultado === 'actualizadas' ? 'modalidad-agregada' : 'no-capitan'}`);
  } catch (err) {
    return next(err);
  }
}

async function retirar(req, res, next) {
  try {
    const idTorneo = idValido(req.params.id);
    const idEquipo = idValido(req.params.idEquipo);
    const retirado = idTorneo && idEquipo ? await torneoModel.retirar(req.usuario.idAuth, idTorneo, idEquipo) : false;
    return res.redirect(`/torneos/${idTorneo}?aviso=${retirado ? 'retirado' : 'cerrado'}`);
  } catch (err) {
    return next(err);
  }
}

function servirImagen(leer) {
  return async (req, res, next) => {
    try {
      const id = idValido(req.params.id);
      const imagen = id ? await leer(id) : null;
      if (!imagen) return next();
      res.set({
        'Content-Type': imagen.tipo,
        'Cache-Control': 'private, max-age=86400',
        'X-Content-Type-Options': 'nosniff',
      });
      return res.send(imagen.datos);
    } catch (err) {
      return next(err);
    }
  };
}

module.exports = {
  listar, detalle, inscribir, retirar, habilitarModalidad, retornoWebpay,
  foto: servirImagen(torneoModel.obtenerFoto),
  logo: servirImagen(torneoModel.obtenerLogo),
};
