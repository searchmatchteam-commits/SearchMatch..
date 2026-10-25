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

async function relaciones(authId, desafio) {
  const [conDesafiante, conDesafiado] = await Promise.all([
    desafioModel.relacionConEquipo(authId, desafio.id_equipo_desafiante),
    desafioModel.relacionConEquipo(authId, desafio.id_equipo_desafiado),
  ]);
  return { conDesafiante, conDesafiado };
}

async function detalle(req, res, next) {
  try {
    const idDesafio = idValido(req.params.id);
    const desafio = idDesafio ? await desafioModel.obtener(idDesafio) : null;
    const rel = desafio ? await relaciones(req.usuario.idAuth, desafio) : {};
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

function accion(nuevoEstado, lado, mensajeAviso) {
  return async (req, res, next) => {
    const idDesafio = idValido(req.params.id);
    try {
      const resultado = idDesafio ? await desafioModel.cambiarEstado(req.usuario.idAuth, idDesafio, nuevoEstado, lado) : 'inexistente';
      if (resultado === 'inexistente') return res.redirect('/desafios');
      if (resultado === 'ok') {
        const desafio = await desafioModel.obtener(idDesafio);
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
