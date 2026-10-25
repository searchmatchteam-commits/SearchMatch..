const equipoModel = require('../models/equipoModel');
const jugadorModel = require('../models/jugadorModel');
const { jugadorParaVista, detectarTipoImagen } = require('./jugadorController');
const { LONGITUD_MAXIMA_MENSAJE_SOLICITUD } = require('../middlewares/validators');
const { NIVELES, POSICIONES, ESTADISTICAS, calcularMedia } = require('../config/perfilJugador');
const { MODALIDADES, DETALLE_NIVEL, BARRAS_NIVEL, MAX_EQUIPOS_COMO_CAPITAN } = require('../config/equipo');
const ubicacionModel = require('../models/ubicacionModel');
const avisosEquipo = require('./avisosEquipo');
const equipoFichaModel = require('../models/equipoFichaModel');

const AVISO_LIMITE_EQUIPOS = `Alcanzaste el límite de ${MAX_EQUIPOS_COMO_CAPITAN} `
  + `${MAX_EQUIPOS_COMO_CAPITAN === 1 ? 'equipo' : 'equipos'} como capitán. Para crear otro, primero desactiva uno.`;

async function alcanzoLimiteEquipos(authId) {
  return (await equipoModel.contarEquiposDeCapitan(authId)) >= MAX_EQUIPOS_COMO_CAPITAN;
}

const AVISOS_UNION = {
  enviada: 'Solicitud enviada. El capitán la verá en su panel.',
  pendiente: 'Ya tienes una solicitud pendiente con ese equipo.',
  invitado: 'Ese equipo ya te invitó: acepta la invitación desde tu panel.',
  miembro: 'Ya eres parte de ese equipo.',
  inexistente: 'Ese equipo ya no está disponible.',
  'mensaje-largo': 'El mensaje es demasiado largo: acórtalo e inténtalo de nuevo.',
};

const AVISOS_PANEL = {
  aceptada: 'Solicitud aceptada: el jugador ya es parte de tu plantel.',
  rechazada: 'Solicitud rechazada.',
  inexistente: 'Esa solicitud ya fue respondida o no es de tu equipo.',
};

const AVISOS_DESAFIO = {
  enviado: '¡Desafío enviado! El capitán rival lo verá en su panel.',
  pendiente: 'Ya hay un desafío pendiente con ese equipo.',
  'sin-equipo': 'Solo el capitán que creó el equipo puede enviar desafíos.',
  inexistente: 'Ese equipo ya no está disponible.',
  modalidad: 'Solo puedes desafiar a equipos de tu misma modalidad.',
};

const AVISOS_INVITACION = {
  enviada: '¡Invitación enviada! El jugador la verá pronto.',
  'ya-invitado': 'Ya invitaste a ese jugador.',
  miembro: 'Ese jugador ya es parte de tu plantel.',
  'sin-permiso': 'Solo el capitán que creó el equipo puede invitar jugadores.',
  inexistente: 'Ese jugador ya no está disponible.',
  'solicitud-pendiente': 'Ese jugador ya te envió una solicitud: respóndela en Solicitudes Pendientes.',
};

const POSICIONES_ETIQUETAS = Object.values(POSICIONES).map(({ etiqueta }) => etiqueta);

const AVISOS_RESPUESTA_INVITACION = {
  aceptada: '¡Bienvenido! Ya eres parte del plantel.',
  rechazada: 'Invitación rechazada.',
  inexistente: 'Esa invitación ya fue respondida o ya no está disponible.',
};

const AVISOS_SACAR = {
  sacado: 'El jugador ya no es parte del plantel.',
  'no-permitido': 'No puedes sacar a ese jugador.',
};
const AVISOS_SALIDA = {
  saliste: 'Saliste del equipo.',
  'no-permitido': 'No puedes salir de ese equipo (si eres su capitán, el equipo quedaría sin capitán).',
};
const VOLVER_TRAS_SALIR = ['/dashboard', '/mis-equipos'];

const ALTURA_LINEA = { delantero: 12, mediocampista: 32, sinPosicion: 51, defensa: 70, arquero: 88 };

function plantelEnCancha(plantel) {
  const porLinea = {};
  plantel.forEach((jugador) => {
    const linea = jugador.clavePosicion || 'sinPosicion';
    (porLinea[linea] = porLinea[linea] || []).push(jugador);
  });
  return plantel.map((jugador) => {
    const linea = jugador.clavePosicion || 'sinPosicion';
    const companeros = porLinea[linea];
    const automaticaX = ((companeros.indexOf(jugador) + 1) / (companeros.length + 1)) * 100;
    const posicion = POSICIONES[jugador.clavePosicion];
    return {
      ...jugador,
      x: jugador.posX ?? +automaticaX.toFixed(2),
      y: jugador.posY ?? ALTURA_LINEA[linea],
      carta: {
        nombre: jugador.nombreCarta,
        media: jugador.stats ? calcularMedia(jugador.stats) : '—',
        posicion: { sigla: posicion ? posicion.sigla : '—' },
        estadisticas: ESTADISTICAS.map(({ clave, sigla }) => ({ sigla, valor: jugador.stats ? jugador.stats[clave] : '—' })),
        foto: jugador.fotoVersion ? `/jugadores/${jugador.id}/foto?v=${jugador.fotoVersion}` : null,
      },
    };
  });
}

const MEDIA_DESTACADA = 70;
const MEDIA_ALTA = 75;

function jugadorInvitable(jugador) {
  const { equipos } = jugador;
  const media = jugador.stats ? calcularMedia(jugador.stats) : null;
  return {
    id: jugador.id,
    nombre: jugador.nombre,
    posicion: jugador.posicion,
    sinPosicion: !POSICIONES_ETIQUETAS.includes(jugador.posicion),
    invitado: jugador.invitado,
    media: media ?? '—',
    destacado: media !== null && media > MEDIA_DESTACADA,
    mediaAlta: media !== null && media > MEDIA_ALTA,
    tieneStats: Boolean(jugador.stats),
    estadisticas: ESTADISTICAS.map(({ clave, sigla }) => ({ sigla, valor: (jugador.stats && Number(jugador.stats[clave])) || 0 })),
    foto: jugador.fotoVersion ? `/jugadores/${jugador.id}/foto?v=${jugador.fotoVersion}` : null,
    etiqueta: equipos.length === 0 ? 'Agente Libre' : equipos.length === 1 ? `Juega en ${equipos[0]}` : 'Multi-equipo',
    libre: equipos.length === 0,
    equipos,
  };
}

const COLUMNA_INEXISTENTE = '42703';

function pasarError(err, next) {
  if (err.code === COLUMNA_INEXISTENTE) {
    console.error('⚠️  Faltan columnas de la tabla equipo: ejecuta la sección W de sql/seed.sql en Supabase.');
  }
  return next(err);
}

function renderWizard(res, { status = 200, datos, errores = [], paso = 1, creado = null, regiones = [] }) {
  return res.status(status).render('crear-equipo', {
    titulo: creado ? 'Equipo creado' : 'Crea tu equipo',
    pagina: 'wizard',
    wizardEquipo: true,
    datos,
    errores,
    paso,
    creado,
    regiones,
    catalogos: { NIVELES, MODALIDADES, DETALLE_NIVEL, BARRAS_NIVEL },
  });
}

async function mostrarCrear(req, res, next) {
  try {
    if (await alcanzoLimiteEquipos(req.usuario.idAuth)) return res.redirect('/mis-equipos?aviso=limite');
    const regiones = await ubicacionModel.listarRegionesConComunas();
    return renderWizard(res, { datos: { correo: req.usuario.correo }, regiones });
  } catch (err) {
    return pasarError(err, next);
  }
}

async function crear(req, res, next) {
  const datos = req.datosFormulario;
  const { errores, paso } = req.erroresEquipo;

  try {
    if (await alcanzoLimiteEquipos(req.usuario.idAuth)) return res.redirect('/mis-equipos?aviso=limite');

    if (datos.idComuna && !(await ubicacionModel.obtenerComuna(datos.idComuna))) {
      errores.push('La comuna elegida no es válida.');
    }
    if (errores.length > 0) {
      const regiones = await ubicacionModel.listarRegionesConComunas();
      return renderWizard(res, { status: 400, datos, errores, paso, regiones });
    }

    await equipoModel.crearEquipo(req.usuario.idAuth, datos);
    return res.redirect('/crear-equipo/listo');
  } catch (err) {
    return pasarError(err, next);
  }
}

async function confirmacion(req, res, next) {
  try {
    const equipo = await equipoModel.obtenerEquipoDeCapitan(req.usuario.idAuth);
    if (!equipo) return res.redirect('/crear-equipo');
    return renderWizard(res, { datos: {}, paso: 3, creado: equipo });
  } catch (err) {
    return pasarError(err, next);
  }
}

async function panel(req, res, next) {
  const idElegido = Number(req.query.equipo);
  try {
    if (req.query.equipo !== undefined && !(Number.isInteger(idElegido) && idElegido > 0)) return res.redirect('/mi-equipo');
    const equipo = await equipoModel.obtenerMiEquipo(req.usuario.idAuth, idElegido || null);
    if (!equipo && idElegido) return res.redirect('/mi-equipo');
    if (!equipo) return res.redirect(req.usuario.rolInicio === 'equipo' ? '/crear-equipo' : '/equipos');

    const [plantel, solicitudes, rivales, invitables] = await Promise.all([
      equipoModel.listarPlantel(equipo.id),
      equipo.soyCapitan ? equipoModel.listarSolicitudesPendientes(equipo.id) : [],
      equipo.soyCapitan ? equipoModel.listarRivales(equipo.id) : [],
      equipo.soyCapitan ? equipoModel.listarJugadoresParaInvitar(equipo.id) : [],
    ]);
    return res.render('equipo-panel', {
      titulo: 'Mi equipo',
      pagina: 'equipo',
      equipo,
      plantel: plantelEnCancha(plantel),
      capitan: plantel.find((jugador) => jugador.capitan) || null,
      solicitudes,
      rivales,
      invitables: invitables.map(jugadorInvitable),
      aviso: AVISOS_PANEL[req.query.aviso] || AVISOS_DESAFIO[req.query.desafio] || AVISOS_INVITACION[req.query.invitacion]
        || AVISOS_SACAR[req.query.sacar] || null,
    });
  } catch (err) {
    return pasarError(err, next);
  }
}

async function misEquipos(req, res, next) {
  try {
    const [equipos, limiteAlcanzado] = await Promise.all([
      equipoModel.listarMisEquiposConPlantel(req.usuario.idAuth),
      alcanzoLimiteEquipos(req.usuario.idAuth),
    ]);
    return res.render('mis-equipos', {
      titulo: 'Mis equipos',
      pagina: 'equipo',
      misEquipos: equipos,
      puedeCrear: !limiteAlcanzado,
      avisoLimite: limiteAlcanzado ? AVISO_LIMITE_EQUIPOS : null,
      equiposInactivos: await equipoFichaModel.listarInactivosDeCapitan(req.usuario.idAuth),
      aviso: AVISOS_SALIDA[req.query.salida] || (req.query.aviso === 'limite' ? AVISO_LIMITE_EQUIPOS : null),
    });
  } catch (err) {
    return pasarError(err, next);
  }
}

async function directorio(req, res, next) {
  try {
    const [equipos, miEquipo, limiteAlcanzado] = await Promise.all([
      equipoModel.listarEquipos(req.usuario.idAuth),
      equipoModel.obtenerMiEquipo(req.usuario.idAuth),
      alcanzoLimiteEquipos(req.usuario.idAuth),
    ]);
    return res.render('equipos', {
      titulo: 'Directorio de Equipos',
      pagina: 'equipo',
      equipos,
      tieneEquipo: Boolean(miEquipo),
      puedeCrear: !limiteAlcanzado,
      avisoLimite: limiteAlcanzado ? AVISO_LIMITE_EQUIPOS : null,
      equiposQueBuscan: await equipoFichaModel.listarEquiposQueBuscan(),
      LONGITUD_MENSAJE: LONGITUD_MAXIMA_MENSAJE_SOLICITUD,
      aviso: AVISOS_UNION[req.query.aviso] || null,
    });
  } catch (err) {
    return pasarError(err, next);
  }
}

async function unirse(req, res, next) {
  const idEquipo = Number(req.params.id);
  const quiereJson = req.accepts(['html', 'json']) === 'json';
  try {
    if (req.erroresSolicitud.length > 0) {
      if (quiereJson) return res.status(400).json({ error: req.erroresSolicitud.join(' ') });
      return res.redirect('/equipos?aviso=mensaje-largo');
    }
    const resultado = Number.isInteger(idEquipo) && idEquipo > 0
      ? await equipoModel.solicitarUnion(req.usuario.idAuth, idEquipo, req.datosSolicitud.mensaje)
      : 'inexistente';
    if (resultado === 'enviada') await avisosEquipo.solicitudEnviada(req.usuario, idEquipo);
    if (quiereJson) {
      return res.json({ resultado, mensaje: AVISOS_UNION[resultado] });
    }
    return res.redirect(`/equipos?aviso=${resultado}`);
  } catch (err) {
    return pasarError(err, next);
  }
}

async function responder(req, res, next) {
  const idSolicitud = Number(req.params.id);
  const { accion } = req.params;
  try {
    const resultado = Number.isInteger(idSolicitud) && idSolicitud > 0 && (accion === 'aceptar' || accion === 'rechazar')
      ? await equipoModel.responderSolicitud(req.usuario.idAuth, idSolicitud, accion === 'aceptar')
      : 'inexistente';
    if (resultado !== 'inexistente') await avisosEquipo.solicitudRespondida(idSolicitud, resultado);
    return res.redirect(`/mi-equipo?aviso=${resultado}`);
  } catch (err) {
    return pasarError(err, next);
  }
}

function idDeParametro(valor) {
  const id = Number(valor);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function porcentaje(valor) {
  const numero = Number(valor);
  return valor !== undefined && valor !== '' && Number.isFinite(numero) && numero >= 0 && numero <= 100
    ? Math.round(numero * 100) / 100
    : null;
}

async function guardarPosicion(req, res, next) {
  const idEquipo = idDeParametro(req.params.id);
  const idJugador = idDeParametro(req.params.idJugador);
  const x = porcentaje(req.body.x);
  const y = porcentaje(req.body.y);
  try {
    if (!idEquipo || !idJugador || x === null || y === null) {
      return res.status(400).json({ ok: false, mensaje: 'Posición no válida.' });
    }
    const guardada = await equipoModel.guardarPosicionEnCancha(req.usuario.idAuth, idEquipo, idJugador, x, y);
    if (!guardada) return res.status(403).json({ ok: false, mensaje: 'Solo el capitán que creó el equipo puede mover las cartas.' });
    return res.json({ ok: true });
  } catch (err) {
    return pasarError(err, next);
  }
}

async function subirEscudo(req, res, next) {
  const idEquipo = idDeParametro(req.params.id);
  try {
    const tipo = Buffer.isBuffer(req.body) ? detectarTipoImagen(req.body) : null;
    if (!tipo) return res.status(400).json({ ok: false, mensaje: 'Elige una imagen JPG, PNG o WebP.' });
    const guardado = idEquipo && (await equipoModel.guardarEscudo(req.usuario.idAuth, idEquipo, req.body, tipo));
    if (!guardado) return res.status(403).json({ ok: false, mensaje: 'Solo el capitán que creó el equipo puede cambiar su escudo.' });
    return res.json({ ok: true });
  } catch (err) {
    return pasarError(err, next);
  }
}

async function servirEscudo(req, res, next) {
  const idEquipo = idDeParametro(req.params.id);
  try {
    const escudo = idEquipo ? await equipoModel.obtenerEscudo(idEquipo) : null;
    if (!escudo) return next();

    res.set({
      'Content-Type': escudo.tipo,
      'Cache-Control': 'private, max-age=31536000',
      'X-Content-Type-Options': 'nosniff',
    });
    return res.send(escudo.datos);
  } catch (err) {
    return pasarError(err, next);
  }
}

async function leerSolicitudPropia(req) {
  const idSolicitud = Number(req.params.id);
  if (!Number.isInteger(idSolicitud) || idSolicitud <= 0) return null;
  return equipoModel.obtenerSolicitudDeMiEquipo(req.usuario.idAuth, idSolicitud);
}

async function verSolicitud(req, res, next) {
  try {
    const solicitud = await leerSolicitudPropia(req);
    if (!solicitud) return res.redirect('/mi-equipo?aviso=inexistente');

    const perfil = await jugadorModel.obtenerPerfilPorId(solicitud.idJugador);
    if (!perfil) return res.redirect('/mi-equipo?aviso=inexistente');

    const foto = perfil.fotoVersion ? `/mi-equipo/solicitudes/${solicitud.id}/foto?v=${perfil.fotoVersion}` : null;
    return res.render('solicitud-jugador', {
      titulo: `Solicitud de ${perfil.nombre}`,
      pagina: 'perfil',
      perfilAjeno: true,
      solicitud,
      jugador: jugadorParaVista(perfil, foto),
    });
  } catch (err) {
    return pasarError(err, next);
  }
}

async function fotoSolicitud(req, res, next) {
  try {
    const solicitud = await leerSolicitudPropia(req);
    const foto = solicitud ? await jugadorModel.obtenerFotoPorId(solicitud.idJugador) : null;
    if (!foto) return next();

    res.set({
      'Content-Type': foto.tipo,
      'Cache-Control': 'private, max-age=31536000',
      'X-Content-Type-Options': 'nosniff',
    });
    return res.send(foto.datos);
  } catch (err) {
    return pasarError(err, next);
  }
}

async function desafiar(req, res, next) {
  const idRival = Number(req.params.id);
  const quiereJson = req.accepts(['html', 'json']) === 'json';
  try {
    if (req.erroresDesafio.length > 0) {
      if (quiereJson) return res.status(400).json({ error: req.erroresDesafio.join(' ') });
      return res.redirect('/mi-equipo');
    }
    const resultado = Number.isInteger(idRival) && idRival > 0
      ? await equipoModel.enviarDesafio(req.usuario.idAuth, idRival, req.datosDesafio.mensaje)
      : 'inexistente';
    if (resultado === 'enviado') await avisosEquipo.desafioEnviado(req.usuario, idRival);
    if (quiereJson) return res.json({ resultado, mensaje: AVISOS_DESAFIO[resultado] });
    return res.redirect(`/mi-equipo?desafio=${resultado}`);
  } catch (err) {
    return pasarError(err, next);
  }
}

async function invitar(req, res, next) {
  const idEquipo = idDeParametro(req.params.id);
  const idJugador = idDeParametro(req.params.idJugador);
  const quiereJson = req.accepts(['html', 'json']) === 'json';
  try {
    const resultado = idEquipo && idJugador
      ? await equipoModel.invitarJugador(req.usuario.idAuth, idEquipo, idJugador)
      : 'inexistente';
    if (resultado === 'enviada') await avisosEquipo.invitacionEnviada(idEquipo, idJugador);
    if (quiereJson) return res.json({ resultado, mensaje: AVISOS_INVITACION[resultado] });
    return res.redirect(`/mi-equipo?invitacion=${resultado}`);
  } catch (err) {
    return pasarError(err, next);
  }
}

async function responderInvitacion(req, res, next) {
  const idInvitacion = idDeParametro(req.params.id);
  const { accion } = req.params;
  try {
    const resultado = idInvitacion && (accion === 'aceptar' || accion === 'rechazar')
      ? await equipoModel.responderInvitacion(req.usuario.idAuth, idInvitacion, accion === 'aceptar')
      : 'inexistente';
    if (resultado === 'aceptada') await avisosEquipo.invitacionAceptada(idInvitacion);
    return res.redirect(`/dashboard?invitacion=${resultado}`);
  } catch (err) {
    return pasarError(err, next);
  }
}

async function sacar(req, res, next) {
  const idEquipo = idDeParametro(req.params.id);
  const idJugador = idDeParametro(req.params.idJugador);
  const quiereJson = req.accepts(['html', 'json']) === 'json';
  try {
    const sacado = Boolean(idEquipo && idJugador && (await equipoModel.sacarJugador(req.usuario.idAuth, idEquipo, idJugador)));
    const resultado = sacado ? 'sacado' : 'no-permitido';
    if (quiereJson) return res.status(sacado ? 200 : 403).json({ ok: sacado, mensaje: AVISOS_SACAR[resultado] });
    return res.redirect(`/mi-equipo?equipo=${idEquipo || ''}&sacar=${resultado}`);
  } catch (err) {
    return pasarError(err, next);
  }
}

async function salir(req, res, next) {
  const idEquipo = idDeParametro(req.params.id);
  const volver = VOLVER_TRAS_SALIR.includes(req.body.volver) ? req.body.volver : '/dashboard';
  try {
    const salio = Boolean(idEquipo && (await equipoModel.salirDeEquipo(req.usuario.idAuth, idEquipo)));
    return res.redirect(`${volver}?salida=${salio ? 'saliste' : 'no-permitido'}`);
  } catch (err) {
    return pasarError(err, next);
  }
}

module.exports = {
  mostrarCrear,
  crear,
  confirmacion,
  panel,
  misEquipos,
  directorio,
  unirse,
  responder,
  verSolicitud,
  fotoSolicitud,
  guardarPosicion,
  subirEscudo,
  servirEscudo,
  desafiar,
  invitar,
  responderInvitacion,
  sacar,
  salir,
  AVISOS_RESPUESTA_INVITACION,
  AVISOS_SALIDA,
};
