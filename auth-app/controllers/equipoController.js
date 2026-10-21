// controllers/equipoController.js
// Equipos:
//  - GET/POST /crear-equipo → wizard (1: identidad, 2: configuración) que crea el equipo.
//  - GET /crear-equipo/listo → paso 3: confirmación del equipo recién creado.
//  - GET /mi-equipo → mi equipo (capitán o integrante): cabecera y plantel real desde equipo_jugador;
//    el capitán ve además las solicitudes pendientes.
//  - POST /mi-equipo/solicitudes/:id/(aceptar|rechazar) → el capitán responde una solicitud.
//  - POST /mi-equipo/desafios/:id → el capitán desafía a otro equipo (JSON si viene de fetch).
//  - GET /equipos → directorio de equipos con buscador y "Solicitar unirme" (el capitán va a /mi-equipo).
//  - POST /equipos/:id/unirme → guarda la solicitud en solicitud_union_equipo (JSON si viene de fetch).
// Solo el rol "equipo" (capitán) crea equipos: las rutas del wizard pasan por soloCapitanes.
// Cada cuenta crea un solo equipo: quien ya tiene no vuelve al wizard y quien no tiene no ve el panel.
// La validación está en middlewares/validators.js (validarEquipo) y el acceso a datos en models/equipoModel.js.

const equipoModel = require('../models/equipoModel');
const { NIVELES } = require('../config/perfilJugador');
const { MODALIDADES, DETALLE_NIVEL, BARRAS_NIVEL } = require('../config/equipo');

// Avisos del directorio (?aviso=... o JSON): solo textos fijos, nunca lo que llega en la URL.
// Los cuatro primeros responden a "Solicitar unirme"; solo-capitanes viene de middlewares/authMiddleware.js.
const AVISOS_UNION = {
  enviada: 'Solicitud enviada. El capitán la verá en su panel.',
  pendiente: 'Ya tienes una solicitud pendiente con ese equipo.',
  miembro: 'Ya eres parte de ese equipo.',
  inexistente: 'Ese equipo ya no está disponible.',
  'solo-capitanes': 'Acceso denegado: Solo los capitanes pueden crear equipos.',
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
  try {
    const equipo = await equipoModel.obtenerMiEquipo(req.usuario.idAuth);
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
      plantel,
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
// GET /equipos → directorio para el jugador; el capitán va directo a su panel
// ---------------------------------------------------------------
async function directorio(req, res, next) {
  try {
    if (await equipoModel.obtenerEquipoDeCapitan(req.usuario.idAuth)) return res.redirect('/mi-equipo');

    const [equipos, miEquipo] = await Promise.all([
      equipoModel.listarEquipos(req.usuario.idAuth),
      equipoModel.obtenerMiEquipo(req.usuario.idAuth),
    ]);
    return res.render('equipos', {
      titulo: 'Directorio de Equipos',
      pagina: 'equipo',
      equipos,
      tieneEquipo: Boolean(miEquipo),
      esCapitan: req.usuario.rolInicio === 'equipo',
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
  try {
    const resultado = Number.isInteger(idEquipo) && idEquipo > 0
      ? await equipoModel.solicitarUnion(req.usuario.idAuth, idEquipo)
      : 'inexistente';
    if (req.accepts(['html', 'json']) === 'json') {
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
  directorio,
  unirse,
  responder,
  desafiar,
};
