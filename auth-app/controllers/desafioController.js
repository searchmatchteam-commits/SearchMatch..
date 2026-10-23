// controllers/desafioController.js
// Fase 5 · Responder y consultar desafíos:
//  GET  /desafios?equipo=&ver=recibidos|enviados&estado=   → DE-011 enviados (con filtro) y DE-012 recibidos
//  GET  /desafios/:id                                       → DE-014 detalle (solo integrantes de los dos equipos)
//  POST /desafios/:id/aceptar                               → DE-009 (capitán del desafiado)
//  POST /desafios/:id/rechazar                              → DE-010 (capitán del desafiado)
//  POST /desafios/:id/cancelar                              → DE-013 (capitán del desafiante)

const desafioModel = require('../models/desafioModel');
const equipoModel = require('../models/equipoModel');
const notificacionModel = require('../models/notificacionModel');
const { idValido } = require('../middlewares/validadoresAdmin');

const AVISOS = {
  aceptado: '¡Desafío aceptado! Ya pueden programar el partido.',
  rechazado: 'Desafío rechazado.',
  cancelado: 'Desafío cancelado. Puedes volver a desafiar a ese equipo cuando quieras.',
  respondido: 'Ese desafío ya fue respondido: no se puede cambiar.',
  'sin-permiso': 'Solo el capitán del equipo correspondiente puede hacer eso.',
};

// GET /desafios
async function listar(req, res, next) {
  const ver = req.query.ver === 'enviados' ? 'enviados' : 'recibidos';
  const estado = desafioModel.ESTADOS.includes(req.query.estado) ? req.query.estado : null;
  try {
    const equipos = await equipoModel.listarMisEquipos(req.usuario.idAuth);
    const idElegido = idValido(req.query.equipo);
    const equipo = equipos.find((e) => e.id === idElegido) || equipos[0] || null;
    const desafios = !equipo ? [] : ver === 'enviados'
      ? await desafioModel.listarEnviados(equipo.id, estado)
      : await desafioModel.listarRecibidos(equipo.id);
    return res.render('desafios/index', {
      titulo: 'Desafíos',
      pagina: 'equipo',
      equipos,
      equipo,
      ver,
      estado,
      estados: desafioModel.ESTADOS,
      desafios,
      aviso: AVISOS[req.query.aviso] || null,
    });
  } catch (err) {
    return next(err);
  }
}

/** Relación de la cuenta con cada lado del desafío (para permisos y acciones). */
async function relaciones(authId, desafio) {
  const [conDesafiante, conDesafiado] = await Promise.all([
    desafioModel.relacionConEquipo(authId, desafio.id_equipo_desafiante),
    desafioModel.relacionConEquipo(authId, desafio.id_equipo_desafiado),
  ]);
  return { conDesafiante, conDesafiado };
}

// GET /desafios/:id
async function detalle(req, res, next) {
  try {
    const idDesafio = idValido(req.params.id);
    const desafio = idDesafio ? await desafioModel.obtener(idDesafio) : null;
    const rel = desafio ? await relaciones(req.usuario.idAuth, desafio) : {};
    // DE-014 / NT-004: si no existe o no es de un equipo suyo, se informa sin mostrar nada.
    if (!desafio || (!rel.conDesafiante && !rel.conDesafiado)) {
      return res.status(404).render('mensaje', {
        titulo: 'Desafío no disponible',
        pagina: 'equipo',
        mensaje: 'Este desafío ya no existe o no tienes permiso para verlo (solo lo ven los integrantes de los dos equipos).',
        enlace: { href: '/desafios', texto: 'Ver mis desafíos' },
      });
    }
    const capitanDesafiado = rel.conDesafiado === 'capitan';
    const capitanDesafiante = rel.conDesafiante === 'capitan';
    return res.render('desafios/detalle', {
      titulo: 'Desafío',
      pagina: 'equipo',
      desafio,
      puedeResponder: desafio.estado === 'pendiente' && capitanDesafiado,
      puedeCancelar: desafio.estado === 'pendiente' && capitanDesafiante,
      puedeProgramar: desafio.estado === 'aceptado' && !desafio.id_partido && (capitanDesafiado || capitanDesafiante),
      aviso: AVISOS[req.query.aviso] || null,
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * Acción sobre un desafío: cambia el estado (el modelo valida permiso y que siga pendiente)
 * y notifica al capitán del otro equipo.
 */
function accion(nuevoEstado, lado, mensajeAviso) {
  return async (req, res, next) => {
    const idDesafio = idValido(req.params.id);
    try {
      const resultado = idDesafio ? await desafioModel.cambiarEstado(req.usuario.idAuth, idDesafio, nuevoEstado, lado) : 'inexistente';
      if (resultado === 'inexistente') return res.redirect('/desafios');
      if (resultado === 'ok') {
        const desafio = await desafioModel.obtener(idDesafio);
        // DE-009 / DE-010 avisan al desafiante; DE-013 avisa al desafiado.
        const idOtro = lado === 'desafiado' ? desafio.id_equipo_desafiante : desafio.id_equipo_desafiado;
        const mio = lado === 'desafiado' ? desafio.desafiado : desafio.desafiante;
        await notificacionModel.notificarCapitan(idOtro, 'desafio', mensajeAviso(mio), `/desafios/${idDesafio}`);
      }
      return res.redirect(`/desafios/${idDesafio}?aviso=${resultado === 'ok' ? nuevoEstado : resultado}`);
    } catch (err) {
      return next(err);
    }
  };
}

module.exports = {
  listar,
  detalle,
  aceptar: accion('aceptado', 'desafiado', (equipo) => `${equipo} aceptó tu desafío. ¡Programen el partido!`),
  rechazar: accion('rechazado', 'desafiado', (equipo) => `${equipo} rechazó tu desafío.`),
  cancelar: accion('cancelado', 'desafiante', (equipo) => `${equipo} canceló el desafío que les había enviado.`),
};
