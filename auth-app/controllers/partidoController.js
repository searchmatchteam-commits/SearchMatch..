const partidoModel = require('../models/partidoModel');
const desafioModel = require('../models/desafioModel');
const canchaModel = require('../models/canchaModel');
const notificacionModel = require('../models/notificacionModel');
const { idValido } = require('../middlewares/validadoresAdmin');
const { DURACION_PARTIDO_MIN } = require('../config/partidos');

const ERRORES_PROGRAMAR = {
  'sin-permiso': 'Solo los capitanes de los dos equipos pueden programar el partido.',
  'no-programable': 'Este desafío no está aceptado o ya tiene un partido.',
  'equipo-inactivo': 'Uno de los equipos está inactivo.',
  'cancha-inactiva': 'Esa cancha no está disponible.',
  modalidad: 'Esa cancha no admite la modalidad elegida.',
  'fuera-de-horario': `El partido (${DURACION_PARTIDO_MIN} min) queda fuera del horario de la cancha ese día.`,
  ocupado: 'La cancha ya tiene una reserva o partido en ese horario.',
  'equipo-ocupado': 'Uno de los equipos ya tiene otro partido en ese horario.',
};

const AVISOS = {
  programado: '¡Partido programado! Avisamos a los dos equipos y la cancha quedó reservada.',
  registrado: 'Resultado registrado.',
  'antes-de-tiempo': 'El resultado se registra después de la fecha y hora del partido.',
  'ya-registrado': 'El resultado ya fue registrado y no se puede modificar.',
  cancelado: 'Partido cancelado: la reserva se liberó y avisamos a ambos equipos.',
  'no-cancelable': 'Solo se pueden cancelar partidos futuros sin resultado.',
  'sin-permiso': 'Solo los capitanes de los equipos pueden hacer eso.',
  'marcador-invalido': 'Ingresa ambos marcadores como números enteros desde 0.',
};

function noDisponible(res) {
  return res.status(404).render('mensaje', {
    titulo: 'Partido no disponible',
    pagina: 'equipo',
    mensaje: 'Este partido no existe.',
    enlace: { href: '/agenda', texto: 'Ir a mi agenda' },
  });
}

async function renderProgramar(req, res, desafio, { status = 200, datos = {}, erroresCampo = {}, error = null } = {}) {
  const [modalidades, canchas] = await Promise.all([canchaModel.listarModalidades(), canchaModel.buscarCanchas({})]);
  return res.status(status).render('partidos/programar', {
    titulo: 'Programar partido',
    pagina: 'equipo',
    desafio,
    modalidades,
    canchas,
    datos: { idModalidad: desafio.id_modalidad, ...datos },
    duracion: DURACION_PARTIDO_MIN,
    erroresCampo,
    error,
  });
}

async function desafioDelCapitan(req) {
  const idDesafio = idValido(req.params.idDesafio);
  const desafio = idDesafio ? await desafioModel.obtener(idDesafio) : null;
  if (!desafio) return null;
  const [a, b] = await Promise.all([
    desafioModel.relacionConEquipo(req.usuario.idAuth, desafio.id_equipo_desafiante),
    desafioModel.relacionConEquipo(req.usuario.idAuth, desafio.id_equipo_desafiado),
  ]);
  return a === 'capitan' || b === 'capitan' ? desafio : null;
}

async function formularioProgramar(req, res, next) {
  try {
    const desafio = await desafioDelCapitan(req);
    if (!desafio) return res.redirect(`/desafios/${idValido(req.params.idDesafio) || ''}?aviso=sin-permiso`);
    if (desafio.estado !== 'aceptado' || desafio.id_partido) return res.redirect(`/desafios/${desafio.id}`);
    return await renderProgramar(req, res, desafio);
  } catch (err) {
    return next(err);
  }
}

async function programar(req, res, next) {
  try {
    const desafio = await desafioDelCapitan(req);
    if (!desafio) return res.redirect(`/desafios/${idValido(req.params.idDesafio) || ''}?aviso=sin-permiso`);
    const datos = req.datosFormulario;
    if (Object.keys(req.erroresCampo).length > 0) {
      return await renderProgramar(req, res, desafio, { status: 400, datos, erroresCampo: req.erroresCampo });
    }
    const salida = await partidoModel.programar(req.usuario.idAuth, desafio.id, datos);
    if (salida.resultado !== 'programado') {
      return await renderProgramar(req, res, desafio, { status: 400, datos, error: ERRORES_PROGRAMAR[salida.resultado] || 'No se pudo programar el partido.' });
    }
    const texto = `Partido programado: ${desafio.desafiante} vs ${desafio.desafiado} el ${datos.fecha} a las ${datos.hora}.`;
    await Promise.all(salida.equipos.map((idEquipo) => notificacionModel.notificarIntegrantes(idEquipo, 'partido', texto, `/partidos/${salida.idPartido}`)));
    return res.redirect(`/partidos/${salida.idPartido}?aviso=programado`);
  } catch (err) {
    return next(err);
  }
}

async function detalle(req, res, next) {
  try {
    const idPartido = idValido(req.params.id);
    const partido = idPartido ? await partidoModel.obtener(idPartido) : null;
    if (!partido) return noDisponible(res);
    const [a, b] = await Promise.all([
      desafioModel.relacionConEquipo(req.usuario.idAuth, partido.id_equipo_desafiante),
      desafioModel.relacionConEquipo(req.usuario.idAuth, partido.id_equipo_desafiado),
    ]);
    const esCapitan = a === 'capitan' || b === 'capitan';
    const jugado = partido.marcador_desafiante !== null;
    return res.render('partidos/detalle', {
      titulo: `${partido.desafiante} vs ${partido.desafiado}`,
      pagina: 'equipo',
      partido,
      jugado,
      puedeRegistrar: esCapitan && !partido.cancelado && !jugado && partido.ya_empezo,
      puedeCancelar: esCapitan && !partido.cancelado && !jugado && !partido.ya_empezo,
      esperandoResultado: !partido.cancelado && !jugado && partido.ya_empezo,
      erroresCampo: {},
      aviso: AVISOS[req.query.aviso] || null,
    });
  } catch (err) {
    return next(err);
  }
}

async function registrarResultado(req, res, next) {
  const idPartido = idValido(req.params.id);
  try {
    if (!idPartido) return noDisponible(res);
    if (Object.keys(req.erroresCampo).length > 0) return res.redirect(`/partidos/${idPartido}?aviso=marcador-invalido`);
    const resultado = await partidoModel.registrarResultado(req.usuario.idAuth, idPartido, req.datosFormulario);
    if (resultado === 'inexistente') return noDisponible(res);
    if (resultado === 'registrado') {
      const partido = await partidoModel.obtener(idPartido);
      const texto = `Resultado registrado: ${partido.desafiante} ${partido.marcador_desafiante} – ${partido.marcador_desafiado} ${partido.desafiado}.`;
      const registroDesafiante = (await desafioModel.relacionConEquipo(req.usuario.idAuth, partido.id_equipo_desafiante)) === 'capitan';
      const idOtro = registroDesafiante ? partido.id_equipo_desafiado : partido.id_equipo_desafiante;
      await notificacionModel.notificarCapitan(idOtro, 'partido', texto, `/partidos/${idPartido}`);
    }
    return res.redirect(`/partidos/${idPartido}?aviso=${resultado}`);
  } catch (err) {
    return next(err);
  }
}

async function cancelar(req, res, next) {
  const idPartido = idValido(req.params.id);
  const motivo = String(req.body.motivo || '').trim().slice(0, 200);
  try {
    if (!idPartido) return noDisponible(res);
    const resultado = await partidoModel.cancelar(req.usuario.idAuth, idPartido, motivo);
    if (resultado === 'inexistente') return noDisponible(res);
    if (resultado === 'cancelado') {
      const partido = await partidoModel.obtener(idPartido);
      const texto = `Se canceló el partido ${partido.desafiante} vs ${partido.desafiado} del ${partido.fecha}${motivo ? `. Motivo: ${motivo}` : ''}.`;
      await Promise.all([partido.id_equipo_desafiante, partido.id_equipo_desafiado]
        .map((idEquipo) => notificacionModel.notificarIntegrantes(idEquipo, 'partido', texto, `/partidos/${idPartido}`)));
    }
    return res.redirect(`/partidos/${idPartido}?aviso=${resultado}`);
  } catch (err) {
    return next(err);
  }
}

module.exports = { formularioProgramar, programar, detalle, registrarResultado, cancelar, AVISOS };
