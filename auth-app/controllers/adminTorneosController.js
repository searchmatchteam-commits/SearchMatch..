const torneoModel = require('../models/torneoModel');
const { notificarIntegrantes } = require('../models/notificacionModel');
const reglas = require('../config/torneos');
const { idValido } = require('../middlewares/validadoresAdmin');

const AVISOS = {
  creado: 'Torneo creado: ya aparece en la sección Torneos de los jugadores.',
  editado: 'Cambios guardados.',
  eliminado: 'Torneo eliminado.',
  inexistente: 'Ese torneo ya no existe.',
  empezado: '¡Torneo en marcha! Ya están los partidos y se avisó a los equipos.',
  faltan: 'Aún no se llenan todos los cupos.',
  estado: 'El torneo ya había empezado.',
  quitado: 'Equipo quitado del torneo.',
  guardado: 'Resultado guardado.',
  penales: 'En un torneo relámpago no hay empates: indica quién ganó por penales.',
  cerrado: 'Ese resultado ya no se puede cambiar (la ronda siguiente ya está armada).',
  goles: 'Los goles deben ser números enteros entre 0 y 99.',
};

/** Texto de la cancha en el buscador; el número final es lo que lee validarTorneo. */
function textoCancha(c) {
  return `${c.recinto} · ${c.nombre}${c.comuna ? ` (${c.comuna})` : ''} [#${c.id}]`;
}

async function listar(req, res, next) {
  const texto = String(req.query.texto || '').trim();
  try {
    return res.render('admin/torneos', {
      titulo: 'Torneos',
      pagina: 'equipo',
      seccion: 'torneos',
      torneos: await torneoModel.listar(texto),
      texto,
      aviso: AVISOS[req.query.aviso] || null,
    });
  } catch (err) {
    return next(err);
  }
}

async function detalle(req, res, next) {
  try {
    const torneo = await torneoModel.obtener(idValido(req.params.id));
    if (!torneo) return res.redirect('/admin/super/torneos?aviso=inexistente');
    return res.render('admin/torneo', {
      titulo: torneo.nombre,
      pagina: 'equipo',
      seccion: 'torneos',
      torneoAdmin: true,
      torneo,
      aviso: AVISOS[req.query.aviso] || null,
    });
  } catch (err) {
    return next(err);
  }
}

async function renderFormulario(res, { status = 200, torneo = null, datos = {}, erroresCampo = {} }) {
  const [modalidades, canchas] = await Promise.all([torneoModel.modalidades(), torneoModel.canchasDisponibles()]);
  return res.status(status).render('admin/torneo-form', {
    titulo: torneo ? 'Editar torneo' : 'Crear torneo',
    pagina: 'equipo',
    seccion: 'torneos',
    torneoForm: true, // carga public/js/torneo-form.js
    torneo,
    datos,
    erroresCampo,
    errores: Object.keys(erroresCampo),
    modalidades,
    canchas: canchas.map((c) => ({ texto: textoCancha(c), modalidad: c.modalidad })),
    formatos: reglas.FORMATOS,
    emparejamientos: reglas.EMPAREJAMIENTOS,
    equiposRelampago: reglas.EQUIPOS_RELAMPAGO,
    equiposLiga: reglas.EQUIPOS_LIGA,
    maxPatrocinadores: reglas.MAX_PATROCINADORES,
  });
}

/** Revisiones que necesitan la base: cancha, foto obligatoria, patrocinadores y cambios tras inscripciones. */
async function revisar(datos, erroresCampo, torneo = null) {
  if (datos.idCancha && !erroresCampo.cancha) {
    const cancha = await torneoModel.canchaParaTorneo(datos.idCancha);
    const modalidad = torneo && torneo.estado !== 'inscripcion' ? torneo.idModalidad : datos.idModalidad;
    if (!cancha) erroresCampo.cancha = 'Esa cancha no existe o está desactivada. Elige otra de la lista.';
    else if (modalidad && cancha.id_modalidad !== modalidad) erroresCampo.cancha = 'La cancha no es de la modalidad del torneo.';
  }
  if (!torneo && !datos.foto && !erroresCampo.foto) erroresCampo.foto = 'Sube una foto para el torneo.';

  const quedan = torneo ? torneo.patrocinadores.filter((p) => !datos.quitarPatrocinadores.includes(p.id)).length : 0;
  if (datos.tienePatrocinadores && quedan + datos.patrocinadoresNuevos.length === 0
      && !Object.keys(erroresCampo).some((k) => k.startsWith('patrocinador_'))) {
    erroresCampo.patrocinador_0 = 'Agrega al menos un patrocinador con su nombre y logo (o elige "No").';
  }

  if (torneo && torneo.estado === 'inscripcion' && torneo.inscritos > 0) {
    if (datos.cantidadEquipos && datos.cantidadEquipos < torneo.inscritos) {
      erroresCampo.cantidad_equipos = `Ya hay ${torneo.inscritos} equipos inscritos: no puede ser menor.`;
    }
    if (datos.idModalidad && datos.idModalidad !== torneo.idModalidad) {
      erroresCampo.id_modalidad = 'No se puede cambiar la modalidad con equipos ya inscritos.';
    }
  }
}

function avisoImagenes(erroresCampo) {
  // El navegador no puede volver a rellenar los archivos tras un error.
  if (Object.keys(erroresCampo).length > 0) erroresCampo.reelegir = 'Vuelve a elegir la foto y los logos antes de guardar.';
}

async function formularioNuevo(req, res, next) {
  try {
    return await renderFormulario(res, {});
  } catch (err) {
    return next(err);
  }
}

async function crear(req, res, next) {
  const datos = req.datosFormulario;
  const erroresCampo = { ...req.erroresCampo };
  try {
    await revisar(datos, erroresCampo);
    if (Object.keys(erroresCampo).length > 0) {
      avisoImagenes(erroresCampo);
      return await renderFormulario(res, { status: 400, datos, erroresCampo });
    }
    const idTorneo = await torneoModel.crear(datos, datos.foto, datos.patrocinadoresNuevos);
    return res.redirect(`/admin/super/torneos/${idTorneo}?aviso=creado`);
  } catch (err) {
    return next(err);
  }
}

async function formularioEditar(req, res, next) {
  try {
    const torneo = await torneoModel.obtener(idValido(req.params.id));
    if (!torneo) return res.redirect('/admin/super/torneos?aviso=inexistente');
    return await renderFormulario(res, {
      torneo,
      datos: {
        ...torneo,
        cantidadIngresada: torneo.cantidadEquipos,
        canchaTexto: textoCancha({ ...torneo, nombre: torneo.cancha, id: torneo.idCancha }),
        tienePatrocinadores: torneo.patrocinadores.length > 0,
        quitarPatrocinadores: [],
      },
    });
  } catch (err) {
    return next(err);
  }
}

async function editar(req, res, next) {
  const datos = req.datosFormulario;
  const erroresCampo = { ...req.erroresCampo };
  try {
    const torneo = await torneoModel.obtener(idValido(req.params.id));
    if (!torneo) return res.redirect('/admin/super/torneos?aviso=inexistente');
    if (torneo.estado !== 'inscripcion') {
      // Ya empezó: el formato, la modalidad, la cantidad y el emparejamiento quedan fijos.
      Object.assign(datos, {
        formato: torneo.formato, idModalidad: torneo.idModalidad, cantidadEquipos: torneo.cantidadEquipos, emparejamiento: torneo.emparejamiento,
      });
      ['formato', 'id_modalidad', 'cantidad_equipos', 'emparejamiento'].forEach((campo) => delete erroresCampo[campo]);
    }
    await revisar(datos, erroresCampo, torneo);
    if (Object.keys(erroresCampo).length > 0) {
      avisoImagenes(erroresCampo);
      return await renderFormulario(res, { status: 400, torneo, datos, erroresCampo });
    }
    const quitar = datos.tienePatrocinadores ? datos.quitarPatrocinadores : torneo.patrocinadores.map((p) => p.id);
    await torneoModel.editar(torneo.id, datos, datos.foto, datos.patrocinadoresNuevos, quitar);
    return res.redirect(`/admin/super/torneos/${torneo.id}?aviso=editado`);
  } catch (err) {
    return next(err);
  }
}

async function eliminar(req, res, next) {
  try {
    const idTorneo = idValido(req.params.id);
    const eliminado = idTorneo ? await torneoModel.eliminar(idTorneo) : false;
    return res.redirect(`/admin/super/torneos?aviso=${eliminado ? 'eliminado' : 'inexistente'}`);
  } catch (err) {
    return next(err);
  }
}

async function empezar(req, res, next) {
  try {
    const idTorneo = idValido(req.params.id);
    if (!idTorneo) return res.redirect('/admin/super/torneos?aviso=inexistente');
    const { resultado, equipos } = await torneoModel.empezar(idTorneo);
    if (resultado === 'empezado') {
      const torneo = await torneoModel.obtener(idTorneo);
      await Promise.all(equipos.map((idEquipo) => notificarIntegrantes(idEquipo, 'equipo',
        `¡Empezó el torneo "${torneo.nombre}"! Revisa el fixture de tu equipo.`, `/torneos/${idTorneo}`)));
    }
    return res.redirect(`/admin/super/torneos/${idTorneo}?aviso=${resultado}`);
  } catch (err) {
    return next(err);
  }
}

async function quitarEquipo(req, res, next) {
  try {
    const idTorneo = idValido(req.params.id);
    const idEquipo = idValido(req.params.idEquipo);
    const quitado = idTorneo && idEquipo ? await torneoModel.retirar(null, idTorneo, idEquipo) : false;
    if (quitado) {
      const torneo = await torneoModel.obtener(idTorneo);
      await notificarIntegrantes(idEquipo, 'equipo', `Tu equipo fue retirado del torneo "${torneo.nombre}" por la administración.`, '/torneos');
    }
    return res.redirect(`/admin/super/torneos/${idTorneo}?aviso=${quitado ? 'quitado' : 'estado'}`);
  } catch (err) {
    return next(err);
  }
}

function goles(valor) {
  const n = Number(String(valor ?? '').trim());
  return String(valor ?? '').trim() !== '' && Number.isInteger(n) && n >= 0 && n <= 99 ? n : null;
}

async function registrarResultado(req, res, next) {
  try {
    const idTorneo = idValido(req.params.id);
    const idPartido = idValido(req.params.idPartido);
    const golesLocal = goles(req.body.goles_local);
    const golesVisita = goles(req.body.goles_visita);
    const resultado = golesLocal === null || golesVisita === null
      ? 'goles'
      : await torneoModel.registrarResultado(idTorneo, idPartido, golesLocal, golesVisita, req.body.ganador_penales);
    return res.redirect(`/admin/super/torneos/${idTorneo}?aviso=${resultado}#partido-${idPartido}`);
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  listar, detalle, formularioNuevo, crear, formularioEditar, editar, eliminar, empezar, quitarEquipo, registrarResultado,
};
