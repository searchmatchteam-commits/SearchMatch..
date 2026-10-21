// controllers/equipoController.js
// Equipos:
//  - GET/POST /crear-equipo → wizard (1: identidad, 2: configuración) que crea el equipo.
//  - GET /crear-equipo/listo → paso 3: confirmación del equipo recién creado.
//  - GET /mi-equipo → mi equipo (capitán o integrante): cabecera y plantel real desde equipo_jugador;
//    el capitán ve además las solicitudes pendientes. ?equipo=<id> elige uno de sus equipos
//    (el botón "Administrar" de "Mis equipos" en el dashboard).
//  - POST /mi-equipo/solicitudes/:id/(aceptar|rechazar) → el capitán responde una solicitud.
//  - GET /mi-equipo/solicitudes/:id (y /foto) → el capitán ve el perfil y el mensaje de quien pidió unirse.
//  - POST /equipos/:id/plantel/:idJugador/posicion → el capitán deja la carta de un jugador en la cancha.
//  - GET/POST /equipos/:id/escudo → el escudo del equipo (lo sube el capitán desde /mi-equipo).
//  - POST /mi-equipo/desafios/:id → el capitán desafía a otro equipo (JSON si viene de fetch).
//  - GET /mis-equipos → los equipos de la cuenta con su plantel ("Administrar" en los que creó).
//  - GET /equipos → directorio de equipos con buscador, "Solicitar unirme" y "+ Crear equipo".
//  - POST /equipos/:id/unirme → guarda la solicitud y su mensaje en solicitud_union_equipo (JSON si viene de fetch).
// Cualquier cuenta puede crear un equipo y queda como su capitán: solo es capitán de los equipos que creó.
// Cada cuenta crea un solo equipo: quien ya tiene no vuelve al wizard y quien no tiene no ve el panel.
// La validación está en middlewares/validators.js (validarEquipo) y el acceso a datos en models/equipoModel.js.

const equipoModel = require('../models/equipoModel');
const jugadorModel = require('../models/jugadorModel');
const { jugadorParaVista, detectarTipoImagen } = require('./jugadorController');
const { LONGITUD_MAXIMA_MENSAJE_SOLICITUD } = require('../middlewares/validators');
const { NIVELES, POSICIONES, ESTADISTICAS, calcularMedia } = require('../config/perfilJugador');
const { MODALIDADES, DETALLE_NIVEL, BARRAS_NIVEL } = require('../config/equipo');

// Avisos del directorio (?aviso=... o JSON): solo textos fijos, nunca lo que llega en la URL.
// Responden a "Solicitar unirme".
const AVISOS_UNION = {
  enviada: 'Solicitud enviada. El capitán la verá en su panel.',
  pendiente: 'Ya tienes una solicitud pendiente con ese equipo.',
  miembro: 'Ya eres parte de ese equipo.',
  inexistente: 'Ese equipo ya no está disponible.',
  'mensaje-largo': 'El mensaje es demasiado largo: acórtalo e inténtalo de nuevo.',
};

// Avisos del panel tras responder una solicitud (?aviso=...): solo textos fijos.
const AVISOS_PANEL = {
  aceptada: 'Solicitud aceptada: el jugador ya es parte de tu plantel.',
  rechazada: 'Solicitud rechazada.',
  inexistente: 'Esa solicitud ya fue respondida o no es de tu equipo.',
};

// Avisos tras "Enviar Desafío" (?desafio=... o JSON): solo textos fijos.
const AVISOS_DESAFIO = {
  enviado: '¡Desafío enviado! El capitán rival lo verá en su panel.',
  pendiente: 'Ya hay un desafío pendiente con ese equipo.',
  'sin-equipo': 'Solo el capitán que creó el equipo puede enviar desafíos.',
  inexistente: 'Ese equipo ya no está disponible.',
};

// Cancha táctica (views/equipo-panel.ejs): altura (% del alto) de cada línea, de arriba (ataque) hacia abajo.
// Sin posición guardada, la carta va a la altura de su línea y las de una misma línea se reparten a lo ancho.
const ALTURA_LINEA = { delantero: 12, mediocampista: 32, sinPosicion: 51, defensa: 70, arquero: 88 };

/**
 * El plantel con lo que dibuja la cancha: la carta de cada jugador (partials/carta-jugador con mini)
 * y su posición en % (la que dejó el capitán o la automática según su línea).
 */
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

// Código de PostgreSQL para "la columna no existe".
const COLUMNA_INEXISTENTE = '42703';

/** Pasa el error al manejador general; si faltan las columnas de la sección W, deja una pista clara en la consola. */
function pasarError(err, next) {
  if (err.code === COLUMNA_INEXISTENTE) {
    console.error('⚠️  Faltan columnas de la tabla equipo: ejecuta la sección W de sql/seed.sql en Supabase.');
  }
  return next(err);
}

function renderWizard(res, { status = 200, datos, errores = [], paso = 1, creado = null }) {
  return res.status(status).render('crear-equipo', {
    titulo: creado ? 'Equipo creado' : 'Crea tu equipo',
    pagina: 'wizard',
    wizardEquipo: true,
    datos,
    errores,
    paso,
    creado,
    catalogos: { NIVELES, MODALIDADES, DETALLE_NIVEL, BARRAS_NIVEL },
  });
}

// ---------------------------------------------------------------
// GET /crear-equipo → wizard vacío (el correo de contacto parte con el de la cuenta)
// ---------------------------------------------------------------
async function mostrarCrear(req, res, next) {
  try {
    if (await equipoModel.obtenerEquipoDeCapitan(req.usuario.idAuth)) return res.redirect('/mi-equipo');
    return renderWizard(res, { datos: { correo: req.usuario.correo } });
  } catch (err) {
    return pasarError(err, next);
  }
}

// ---------------------------------------------------------------
// POST /crear-equipo → crear el equipo y mostrar la confirmación
// ---------------------------------------------------------------
async function crear(req, res, next) {
  const datos = req.datosFormulario;
  const { errores, paso } = req.erroresEquipo;

  try {
    if (await equipoModel.obtenerEquipoDeCapitan(req.usuario.idAuth)) return res.redirect('/mi-equipo');
    if (errores.length > 0) return renderWizard(res, { status: 400, datos, errores, paso });

    await equipoModel.crearEquipo(req.usuario.idAuth, datos);
    return res.redirect('/crear-equipo/listo');
  } catch (err) {
    return pasarError(err, next);
  }
}

// ---------------------------------------------------------------
// GET /crear-equipo/listo → paso 3: confirmación
// ---------------------------------------------------------------
async function confirmacion(req, res, next) {
  try {
    const equipo = await equipoModel.obtenerEquipoDeCapitan(req.usuario.idAuth);
    if (!equipo) return res.redirect('/crear-equipo');
    return renderWizard(res, { datos: {}, paso: 3, creado: equipo });
  } catch (err) {
    return pasarError(err, next);
  }
}

// ---------------------------------------------------------------
// GET /mi-equipo → equipo de la cuenta (capitán o integrante) con su plantel real
// ---------------------------------------------------------------
async function panel(req, res, next) {
  const idElegido = Number(req.query.equipo);
  try {
    if (req.query.equipo !== undefined && !(Number.isInteger(idElegido) && idElegido > 0)) return res.redirect('/mi-equipo');
    const equipo = await equipoModel.obtenerMiEquipo(req.usuario.idAuth, idElegido || null);
    // Pidió un equipo al que no pertenece: vuelve a su equipo principal
    if (!equipo && idElegido) return res.redirect('/mi-equipo');
    // Sin equipo: el rol "equipo" lo crea; el jugador busca uno al que unirse.
    if (!equipo) return res.redirect(req.usuario.rolInicio === 'equipo' ? '/crear-equipo' : '/equipos');

    const [plantel, solicitudes, rivales] = await Promise.all([
      equipoModel.listarPlantel(equipo.id),
      equipo.soyCapitan ? equipoModel.listarSolicitudesPendientes(equipo.id) : [],
      equipo.soyCapitan ? equipoModel.listarRivales(equipo.id) : [],
    ]);
    return res.render('equipo-panel', {
      titulo: 'Mi equipo',
      pagina: 'equipo',
      equipo,
      plantel: plantelEnCancha(plantel),
      capitan: plantel.find((jugador) => jugador.capitan) || null,
      solicitudes,
      rivales,
      aviso: AVISOS_PANEL[req.query.aviso] || AVISOS_DESAFIO[req.query.desafio] || null,
    });
  } catch (err) {
    return pasarError(err, next);
  }
}

// ---------------------------------------------------------------
// GET /mis-equipos → los equipos de la cuenta, cada uno con su plantel
// ---------------------------------------------------------------
async function misEquipos(req, res, next) {
  try {
    const [equipos, equipoCreado] = await Promise.all([
      equipoModel.listarMisEquiposConPlantel(req.usuario.idAuth),
      equipoModel.obtenerEquipoDeCapitan(req.usuario.idAuth),
    ]);
    return res.render('mis-equipos', {
      titulo: 'Mis equipos',
      pagina: 'equipo',
      misEquipos: equipos,
      puedeCrear: !equipoCreado, // cada cuenta crea un solo equipo
    });
  } catch (err) {
    return pasarError(err, next);
  }
}

// ---------------------------------------------------------------
// GET /equipos → directorio de equipos (también para el capitán: ve el suyo marcado)
// ---------------------------------------------------------------
async function directorio(req, res, next) {
  try {
    const [equipos, miEquipo, equipoCreado] = await Promise.all([
      equipoModel.listarEquipos(req.usuario.idAuth),
      equipoModel.obtenerMiEquipo(req.usuario.idAuth),
      equipoModel.obtenerEquipoDeCapitan(req.usuario.idAuth),
    ]);
    return res.render('equipos', {
      titulo: 'Directorio de Equipos',
      pagina: 'equipo',
      equipos,
      tieneEquipo: Boolean(miEquipo),
      puedeCrear: !equipoCreado, // cada cuenta crea un solo equipo
      LONGITUD_MENSAJE: LONGITUD_MAXIMA_MENSAJE_SOLICITUD,
      aviso: AVISOS_UNION[req.query.aviso] || null,
    });
  } catch (err) {
    return pasarError(err, next);
  }
}

// ---------------------------------------------------------------
// POST /equipos/:id/unirme → solicitud para unirse
// Desde equipo.js (fetch) responde JSON y la página no se recarga;
// sin JavaScript el formulario normal vuelve al directorio con el aviso.
// ---------------------------------------------------------------
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
    if (quiereJson) {
      return res.json({ resultado, mensaje: AVISOS_UNION[resultado] });
    }
    return res.redirect(`/equipos?aviso=${resultado}`);
  } catch (err) {
    return pasarError(err, next);
  }
}

// ---------------------------------------------------------------
// POST /mi-equipo/solicitudes/:id/:accion → aceptar o rechazar (el modelo
// comprueba que la solicitud sea de un equipo de este capitán)
// ---------------------------------------------------------------
async function responder(req, res, next) {
  const idSolicitud = Number(req.params.id);
  const { accion } = req.params;
  try {
    const resultado = Number.isInteger(idSolicitud) && idSolicitud > 0 && (accion === 'aceptar' || accion === 'rechazar')
      ? await equipoModel.responderSolicitud(req.usuario.idAuth, idSolicitud, accion === 'aceptar')
      : 'inexistente';
    return res.redirect(`/mi-equipo?aviso=${resultado}`);
  } catch (err) {
    return pasarError(err, next);
  }
}

/** Número entero positivo de un parámetro de la URL, o null. */
function idDeParametro(valor) {
  const id = Number(valor);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/** Coordenada en % (0 a 100) con dos decimales, o null si no es válida. */
function porcentaje(valor) {
  const numero = Number(valor);
  return valor !== undefined && valor !== '' && Number.isFinite(numero) && numero >= 0 && numero <= 100
    ? Math.round(numero * 100) / 100
    : null;
}

// ---------------------------------------------------------------
// POST /equipos/:id/plantel/:idJugador/posicion → x, y en % (lo envía equipo.js al soltar una carta)
// ---------------------------------------------------------------
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

// ---------------------------------------------------------------
// POST /equipos/:id/escudo → guarda el escudo (cuerpo = la imagen; equipo.js la reduce antes)
// ---------------------------------------------------------------
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

// ---------------------------------------------------------------
// GET /equipos/:id/escudo → el escudo del equipo (404 si no tiene: la vista muestra la inicial)
// ---------------------------------------------------------------
async function servirEscudo(req, res, next) {
  const idEquipo = idDeParametro(req.params.id);
  try {
    const escudo = idEquipo ? await equipoModel.obtenerEscudo(idEquipo) : null;
    if (!escudo) return next();

    res.set({
      'Content-Type': escudo.tipo,
      'Cache-Control': 'private, max-age=31536000', // la URL lleva ?v=<versión>
      'X-Content-Type-Options': 'nosniff',
    });
    return res.send(escudo.datos);
  } catch (err) {
    return pasarError(err, next);
  }
}

/** Solicitud de :id si es de un equipo que creó la cuenta (si no, null). */
async function leerSolicitudPropia(req) {
  const idSolicitud = Number(req.params.id);
  if (!Number.isInteger(idSolicitud) || idSolicitud <= 0) return null;
  return equipoModel.obtenerSolicitudDeMiEquipo(req.usuario.idAuth, idSolicitud);
}

// ---------------------------------------------------------------
// GET /mi-equipo/solicitudes/:id → carta, datos y mensaje de quien pidió unirse
// (solo el capitán que creó ese equipo; a cualquier otro lo devuelve a su panel)
// ---------------------------------------------------------------
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
      perfilAjeno: true, // sin descargar/compartir carta (perfil.js)
      solicitud,
      jugador: jugadorParaVista(perfil, foto),
    });
  } catch (err) {
    return pasarError(err, next);
  }
}

// ---------------------------------------------------------------
// GET /mi-equipo/solicitudes/:id/foto → foto de quien pidió unirse (mismo permiso que verSolicitud)
// ---------------------------------------------------------------
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

// ---------------------------------------------------------------
// POST /mi-equipo/desafios/:id → desafiar a otro equipo (validarDesafio deja el mensaje listo)
// Desde equipo.js (fetch) responde JSON; sin JavaScript vuelve al panel con el aviso.
// ---------------------------------------------------------------
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
    if (quiereJson) return res.json({ resultado, mensaje: AVISOS_DESAFIO[resultado] });
    return res.redirect(`/mi-equipo?desafio=${resultado}`);
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
};
