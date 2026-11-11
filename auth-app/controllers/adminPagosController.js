// controllers/adminPagosController.js
// Panel · Pagos (/admin/pagos): pagos de inscripción a torneos, con los que esperan revisión primero.
// Acciones: reembolsar (Webpay), confirmar la inscripción de un pago en verificación y marcar como reembolsado
// a mano (cuando el dinero se devolvió por otro medio tras un reembolso fallido).

const adminPagosModel = require('../models/adminPagosModel');
const pasarelaModel = require('../models/pasarelaModel');
const { webpayReembolsar } = require('../models/pasarelasApi');
const { idValido, leerMotivo, MSG_MOTIVO } = require('../middlewares/validadoresAdmin');

const BASE = '/admin/pagos';

const AVISOS = {
  reembolsado: 'Reembolso hecho en Webpay. Se le avisó al capitán; el banco puede tardar unos días hábiles en reflejarlo.',
  'marcado-reembolsado': 'Pago marcado como reembolsado. Se le avisó al capitán.',
  fallido: 'Webpay no hizo el reembolso: revisa el motivo en el pago. Puedes reintentarlo o, si lo devolviste por otro medio, marcarlo como reembolsado.',
  confirmado: 'Inscripción confirmada: el pago quedó aprobado y se le avisó al capitán.',
  'sin-cupo': 'El torneo no tiene cupo libre: no se puede confirmar la inscripción. Reembolsa el pago.',
  'no-permitido': 'Ese pago cambió de estado o no admite esa acción. Revisa su situación actual.',
  inexistente: 'Ese pago no existe.',
  'sin-credenciales': 'Webpay no tiene credenciales guardadas: configúralas en Configuración → Pasarelas de pago.',
  motivo: MSG_MOTIVO,
};

function admin(req) {
  return { id: req.usuario.id, nombre: req.usuario.nombre };
}

function fechaHora(fecha) {
  return fecha ? new Intl.DateTimeFormat('es-CL', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'America/Santiago',
  }).format(fecha) : '';
}

async function listar(req, res, next) {
  const texto = String(req.query.texto || '').trim().slice(0, 100);
  const filtro = adminPagosModel.FILTROS[req.query.estado] ? req.query.estado : 'resolver';
  const pagina = Math.max(1, Number.parseInt(req.query.pagina, 10) || 1);
  try {
    const { pagos, total, conteo } = await adminPagosModel.listar({ texto, filtro, pagina });
    const paginas = Math.max(1, Math.ceil(total / adminPagosModel.POR_PAGINA));
    const enlace = (cambios) => {
      const p = new URLSearchParams({ texto, estado: filtro, pagina: String(pagina), ...cambios });
      if (!p.get('texto')) p.delete('texto');
      if (p.get('estado') === 'resolver') p.delete('estado');
      if (p.get('pagina') === '1') p.delete('pagina');
      return `${BASE}${p.toString() ? `?${p}` : ''}`;
    };
    return res.render('admin/pagos', {
      titulo: 'Pagos',
      pagina: 'equipo',
      seccion: 'pagos',
      pagos: pagos.map((p) => ({ ...p, fechaTexto: fechaHora(p.aprobado_en || p.creado_en), actualizadoTexto: fechaHora(p.actualizado_en) })),
      texto,
      filtro,
      volverA: enlace({}),
      filtros: Object.entries(adminPagosModel.FILTROS).map(([clave, f]) => ({
        clave, nombre: f.nombre, cantidad: conteo[clave] || 0, href: enlace({ estado: clave, pagina: '1' }),
      })),
      paginaActual: pagina,
      paginas,
      anterior: pagina > 1 ? enlace({ pagina: String(pagina - 1) }) : null,
      siguiente: pagina < paginas ? enlace({ pagina: String(pagina + 1) }) : null,
      total,
      aviso: AVISOS[req.query.aviso] || null,
      tipoAviso: ['fallido', 'sin-cupo', 'no-permitido', 'inexistente', 'sin-credenciales', 'motivo'].includes(req.query.aviso) ? 'error' : 'exito',
    });
  } catch (err) {
    return next(err);
  }
}

/** Vuelve al listado con los filtros que traía el formulario (campo "volver"). */
function redirigir(req, res, aviso) {
  const volver = String(req.body.volver || '');
  const destino = volver.startsWith(`${BASE}`) && !volver.includes('//') ? volver : BASE;
  return res.redirect(`${destino}${destino.includes('?') ? '&' : '?'}aviso=${aviso}`);
}

/** Reembolso total por Webpay: primero queda "en curso", luego se llama a Transbank y se guarda el resultado. */
async function reembolsar(req, res, next) {
  try {
    const idPago = idValido(req.params.id);
    const motivo = leerMotivo(req.body.motivo);
    if (!idPago) return redirigir(req, res, 'inexistente');
    if (!motivo) return redirigir(req, res, 'motivo');
    const credenciales = await pasarelaModel.credenciales('webpay');
    if (!credenciales) return redirigir(req, res, 'sin-credenciales');

    const inicio = await adminPagosModel.iniciarReembolso(admin(req), idPago, motivo);
    if (inicio.resultado !== 'listo') return redirigir(req, res, inicio.resultado);
    const { pago } = inicio;
    let r;
    try {
      r = await webpayReembolsar(credenciales, pago.entorno, pago.id_pasarela, pago.monto);
    } catch (err) {
      r = { ok: false, error: err.name === 'TimeoutError' ? 'Webpay no respondió a tiempo' : err.message };
    }
    const resultado = await adminPagosModel.terminarReembolso(admin(req), idPago, r.ok
      ? { ok: true, monto: pago.monto, datos: r.datos, detalle: 'Webpay' }
      : { ok: false, detalle: r.error });
    return redirigir(req, res, resultado);
  } catch (err) {
    return next(err);
  }
}

/** Reembolso hecho por fuera de la pasarela (p. ej. transferencia) tras un reembolso fallido. */
async function marcarReembolsado(req, res, next) {
  try {
    const idPago = idValido(req.params.id);
    const motivo = leerMotivo(req.body.motivo);
    if (!idPago) return redirigir(req, res, 'inexistente');
    if (!motivo) return redirigir(req, res, 'motivo');
    const resultado = await adminPagosModel.terminarReembolso(admin(req), idPago, { ok: true, manual: true, detalle: motivo });
    return redirigir(req, res, resultado === 'reembolsado' ? 'marcado-reembolsado' : resultado);
  } catch (err) {
    return next(err);
  }
}

async function confirmar(req, res, next) {
  try {
    const idPago = idValido(req.params.id);
    const resultado = idPago ? await adminPagosModel.confirmarInscripcion(admin(req), idPago) : 'inexistente';
    return redirigir(req, res, resultado);
  } catch (err) {
    return next(err);
  }
}

module.exports = { listar, reembolsar, marcarReembolsado, confirmar };
