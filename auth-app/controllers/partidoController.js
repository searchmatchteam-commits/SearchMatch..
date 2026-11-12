const partidoModel = require('../models/partidoModel');
const {
  sugerirEquipaciones, validarEquipaciones, camisetasDe, soloCamiseta, MSG_COLOR_DEL_RIVAL,
} = require('../config/coloresEquipo');

/**
 * Camisetas que se pueden elegir en el partido: si el desafiante eligió su equipación al desafiar, solo esa
 * (el rival no puede ponerse el mismo color); en desafíos antiguos, cualquiera de las dos.
 */
async function camisetasDelPartido(desafio) {
  const camisetas = await partidoModel.camisetasDelDesafio(desafio.id_equipo_desafiante, desafio.id_equipo_desafiado);
  return { ...camisetas, desafiante: soloCamiseta(camisetas.desafiante, desafio.camiseta_desafiante) };
}
const desafioModel = require('../models/desafioModel');
const canchaModel = require('../models/canchaModel');
const notificacionModel = require('../models/notificacionModel');
const convocatoriaModel = require('../models/convocatoriaModel');
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
  // Asistencia y cupos
  confirmado: '¡Listo! Confirmaste tu asistencia.',
  no_asiste: 'Avisamos a tu capitán que esta vez no podrás ir.',
  cerrado: 'El partido ya empezó, terminó o se canceló: no se puede cambiar.',
  publicado: 'Cupos publicados: ahora otros jugadores pueden inscribirse.',
  'cerrado-cupos': 'Dejaste de buscar jugadores. Los que ya entraron siguen inscritos.',
  demasiados: 'Publicaste más cupos de los que faltan para completar el equipo.',
  aceptada: '¡Estás dentro! Quedaste inscrito en el partido.',
  pendiente: 'Inscripción enviada. Hay más interesados en esa posición: el capitán elegirá.',
  'sin-carta': 'Para inscribirte primero crea tu carta de jugador.',
  'sin-cupo': 'Esa posición ya no está publicada.',
  'es-del-equipo': 'Ya eres parte de uno de los equipos: confirma tu asistencia en vez de inscribirte.',
  'ya-inscrito': 'Ya estás inscrito en este partido.',
  'rechazado-antes': 'El capitán ya eligió a otro jugador para este partido.',
  retirado: 'Te retiraste del partido.',
  'sin-inscripcion': 'No tenías una inscripción activa en este partido.',
  aceptado: 'Jugador aceptado: le avisamos.',
  rechazado: 'Inscripción rechazada: le avisamos.',
  quitado: 'Quitaste al jugador y su cupo quedó libre.',
  lleno: 'Esa posición está llena: quita a alguien o sube los cupos antes de aceptar.',
  invalido: 'Esa acción ya no está disponible.',
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
  const [modalidades, canchas, camisetas] = await Promise.all([
    canchaModel.listarModalidades(),
    canchaModel.buscarCanchas({}),
    camisetasDelPartido(desafio),
  ]);
  // Equipación: las camisetas de cada equipo y la combinación sugerida (la más distinta)
  const sugerida = sugerirEquipaciones(camisetas.desafiante, camisetas.desafiado);
  return res.status(status).render('partidos/programar', {
    titulo: 'Programar partido',
    pagina: 'equipo',
    desafio,
    modalidades,
    canchas,
    datos: {
      idModalidad: desafio.id_modalidad,
      camisetaDesafiante: sugerida.desafiante,
      camisetaDesafiado: sugerida.desafiado,
      ...datos,
    },
    equipacion: {
      desafiante: camisetasDe(camisetas.desafiante),
      desafiado: camisetasDe(camisetas.desafiado),
      choque: sugerida.choque,
      // La del desafiante viene del desafío: el rival la ve y no puede repetir su color
      desafianteFija: Boolean(desafio.camiseta_desafiante),
      mensajeChoque: MSG_COLOR_DEL_RIVAL,
    },
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
    // Equipación: cada equipo con una de sus camisetas, sin que ambos vistan del mismo color
    const camisetas = await camisetasDelPartido(desafio);
    const cuerpo = desafio.camiseta_desafiante ? { ...req.body, camiseta_desafiante: desafio.camiseta_desafiante } : req.body;
    const { equipacion, error: errorEquipacion } = validarEquipaciones(cuerpo, camisetas.desafiante, camisetas.desafiado, {
      mensajeChoque: desafio.camiseta_desafiante ? MSG_COLOR_DEL_RIVAL : null,
    });
    const datos = { ...req.datosFormulario, equipacion, camisetaDesafiante: equipacion.desafiante, camisetaDesafiado: equipacion.desafiado };
    if (errorEquipacion) req.erroresCampo = { ...req.erroresCampo, equipacion: errorEquipacion };
    if (Object.keys(req.erroresCampo).length > 0) {
      return await renderProgramar(req, res, desafio, { status: 400, datos, erroresCampo: req.erroresCampo });
    }
    const salida = await partidoModel.programar(req.usuario.idAuth, desafio.id, datos);
    if (salida.resultado !== 'programado') {
      return await renderProgramar(req, res, desafio, { status: 400, datos, error: ERRORES_PROGRAMAR[salida.resultado] || 'No se pudo programar el partido.' });
    }
    const texto = `Partido programado: ${desafio.desafiante} vs ${desafio.desafiado} el ${datos.fecha} a las ${datos.hora}. Confirma si vas a asistir.`;
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
    // Asistencia y cupos: si falla (ej. aún no se ejecuta sql/partido_asistencia.sql) el partido se muestra igual
    const [convocatoria, posiciones] = await Promise.all([
      convocatoriaModel.contexto(req.usuario.idAuth, idPartido),
      convocatoriaModel.posiciones(),
    ]).catch((err) => {
      console.error('⚠️  No se pudo leer la asistencia del partido:', err.message);
      return [null, []];
    });
    return res.render('partidos/detalle', {
      convocatoria,
      posiciones,
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
      const externos = await convocatoriaModel.jugadoresInscritos(idPartido);
      await Promise.all([
        ...[partido.id_equipo_desafiante, partido.id_equipo_desafiado]
          .map((idEquipo) => notificacionModel.notificarIntegrantes(idEquipo, 'partido', texto, `/partidos/${idPartido}`)),
        ...externos.map((idJugador) => notificacionModel.notificarJugador(idJugador, 'partido', texto, `/partidos/${idPartido}`)),
      ]);
    }
    return res.redirect(`/partidos/${idPartido}?aviso=${resultado}`);
  } catch (err) {
    return next(err);
  }
}

/* ---------- Asistencia y cupos ---------- */

/** Ejecuta una acción sobre el partido :id y vuelve a su pantalla con el aviso del resultado. */
function accionPartido(fn) {
  return async (req, res, next) => {
    const idPartido = idValido(req.params.id);
    try {
      if (!idPartido) return noDisponible(res);
      const salida = await fn(req, idPartido);
      if (salida.resultado === 'inexistente') return noDisponible(res);
      return res.redirect(`/partidos/${idPartido}?aviso=${encodeURIComponent(salida.resultado)}#asistencia`);
    } catch (err) {
      return next(err);
    }
  };
}

const enlace = (idPartido) => `/partidos/${idPartido}`;
const tituloPartido = (p) => `${p.desafiante} vs ${p.desafiado} (${p.fecha} ${p.hora})`;

/** Un integrante confirma o avisa que no va. Si no va, se avisa a su capitán. */
const responderAsistencia = accionPartido(async (req, idPartido) => {
  const estado = String(req.body.estado || '');
  const salida = await convocatoriaModel.responderAsistencia(req.usuario.idAuth, idPartido, estado);
  if (salida.resultado === 'no_asiste' && salida.cambio) {
    const [partido, nombre] = await Promise.all([partidoModel.obtener(idPartido), convocatoriaModel.nombreDeCuenta(req.usuario.idAuth)]);
    await notificacionModel.notificarCapitan(salida.idEquipo, 'partido', `${nombre} no podrá asistir al partido ${tituloPartido(partido)}.`, enlace(idPartido));
  }
  return salida;
});

async function avisarRechazados(idPartido, salida) {
  if (salida.rechazados && salida.rechazados.length) {
    const partido = await partidoModel.obtener(idPartido);
    const texto = `El capitán ya no busca jugadores en tu posición para ${tituloPartido(partido)}.`;
    await Promise.all(salida.rechazados.map((idJugador) => notificacionModel.notificarJugador(idJugador, 'partido', texto, enlace(idPartido))));
  }
  return salida;
}

/** El capitán publica cuántos cupos busca por posición (campos cupo_<idPosicion>). */
const publicarCupos = accionPartido(async (req, idPartido) => {
  const cupos = {};
  for (const [campo, valor] of Object.entries(req.body || {})) {
    const m = /^cupo_(\d+)$/.exec(campo);
    if (m) cupos[m[1]] = String(valor).trim() === '' ? 0 : Number(valor);
  }
  return avisarRechazados(idPartido, await convocatoriaModel.publicarCupos(req.usuario.idAuth, idPartido, cupos));
});

/** El capitán deja de buscar: cada posición queda solo con los ya aceptados. */
const cerrarCupos = accionPartido(async (req, idPartido) => {
  const posiciones = await convocatoriaModel.posiciones();
  const cupos = Object.fromEntries(posiciones.map((p) => [p.id, 0]));
  return avisarRechazados(idPartido, await convocatoriaModel.publicarCupos(req.usuario.idAuth, idPartido, cupos));
});

/** Un jugador de afuera se inscribe en una posición publicada. */
const postular = accionPartido(async (req, idPartido) => {
  const idEquipo = idValido(req.body.id_equipo);
  const idPosicion = idValido(req.body.id_posicion);
  if (!idEquipo || !idPosicion) return { resultado: 'sin-cupo' };
  const salida = await convocatoriaModel.postular(req.usuario.idAuth, idPartido, idEquipo, idPosicion);
  if (salida.resultado === 'aceptada' || salida.resultado === 'pendiente') {
    const [partido, nombre] = await Promise.all([partidoModel.obtener(idPartido), convocatoriaModel.nombreJugador(salida.idJugador)]);
    const texto = salida.resultado === 'aceptada'
      ? `${nombre} se sumó como ${salida.posicion} para ${tituloPartido(partido)}.`
      : `${nombre} quiere jugar de ${salida.posicion} en ${tituloPartido(partido)}. Hay más interesados: elige quién entra.`;
    await notificacionModel.notificarCapitan(salida.idEquipo, 'partido', texto, enlace(idPartido));
  }
  return salida;
});

/** El jugador de afuera se retira; si estaba dentro, se avisa al capitán. */
const retirarse = accionPartido(async (req, idPartido) => {
  const salida = await convocatoriaModel.retirarse(req.usuario.idAuth, idPartido);
  if (salida.resultado === 'retirado' && salida.estabaAceptado) {
    const [partido, nombre] = await Promise.all([partidoModel.obtener(idPartido), convocatoriaModel.nombreDeCuenta(req.usuario.idAuth)]);
    await notificacionModel.notificarCapitan(salida.idEquipo, 'partido', `${nombre} se retiró del partido ${tituloPartido(partido)}: su cupo quedó libre.`, enlace(idPartido));
  }
  return salida;
});

/** El capitán acepta, rechaza o quita a un inscrito. */
const decidir = accionPartido(async (req, idPartido) => {
  const idPostulacion = idValido(req.params.idPostulacion);
  if (!idPostulacion) return { resultado: 'invalido' };
  const salida = await convocatoriaModel.decidir(req.usuario.idAuth, idPartido, idPostulacion, req.params.accion);
  if (['aceptado', 'rechazado', 'quitado'].includes(salida.resultado)) {
    const partido = await partidoModel.obtener(idPartido);
    const textos = {
      aceptado: `¡Entraste! Juegas de ${salida.posicion} en ${tituloPartido(partido)}.`,
      rechazado: `El capitán eligió a otro jugador de ${salida.posicion} para ${tituloPartido(partido)}.`,
      quitado: `El capitán te sacó del partido ${tituloPartido(partido)}.`,
    };
    await notificacionModel.notificarJugador(salida.idJugador, 'partido', textos[salida.resultado], enlace(idPartido));
  }
  return salida;
});

/** Partidos que buscan jugadores (para inscribirse). */
async function buscanJugadores(req, res, next) {
  try {
    // Sin las tablas de sql/partido_asistencia.sql todavía no hay partidos publicados
    const partidos = await convocatoriaModel.listarAbiertos(req.usuario.idAuth, 50).catch((err) => { if (err.code === '42P01') return []; throw err; });
    return res.render('partidos/buscan-jugadores', { titulo: 'Partidos que buscan jugadores', pagina: 'equipo', partidos });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  formularioProgramar, programar, detalle, registrarResultado, cancelar, AVISOS,
  responderAsistencia, publicarCupos, cerrarCupos, postular, retirarse, decidir, buscanJugadores,
};
