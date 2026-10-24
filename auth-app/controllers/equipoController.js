// controllers/equipoController.js
// Equipos:
//  - GET/POST /crear-equipo → wizard (1: identidad, 2: configuración) que crea el equipo.
//  - GET /crear-equipo/listo → paso 3: confirmación del equipo recién creado.
//  - GET /mi-equipo → mi equipo (capitán o integrante): cabecera y plantel real desde equipo_jugador;
//    el capitán ve además las solicitudes pendientes. ?equipo=<id> elige uno de sus equipos
//    (el botón "Administrar" de "Mis equipos" en el dashboard).
//  - POST /mi-equipo/solicitudes/:id/(aceptar|rechazar) → el capitán responde una solicitud.
//  - GET /mi-equipo/solicitudes/:id (y /foto) → el capitán ve el perfil y el mensaje de quien pidió unirse.
//  - POST /equipos/:id/alineacion → el capitán guarda la formación y quién juega en cada puesto de una
//    de sus modalidades (JSON, equipo.js).
//  - POST /equipos/:id/modalidades → el capitán cambia los tipos de fútbol que juega el equipo.
//  - GET/POST /equipos/:id/escudo → el escudo del equipo (lo sube el capitán desde /mi-equipo).
//  - POST /mi-equipo/desafios/:id → el capitán desafía a otro equipo (JSON si viene de fetch).
//  - POST /equipos/:id/invitaciones/:idJugador → el capitán invita a un jugador (modal "Invitar jugador +").
//  - POST /invitaciones/:id/(aceptar|rechazar) → el jugador responde una invitación (panel del dashboard).
//  - POST /equipos/:id/plantel/:idJugador/sacar → el capitán saca a un jugador del plantel (JSON si viene de fetch).
//  - POST /equipos/:id/salir → el jugador sale de un equipo ("Mis equipos" del dashboard y /mis-equipos).
//  - GET /mis-equipos → los equipos de la cuenta con su plantel ("Administrar" en los que creó).
//  - GET /equipos → directorio de equipos con buscador, "Solicitar unirme" y "+ Crear equipo".
//  - POST /equipos/:id/unirme → guarda la solicitud y su mensaje en solicitud_union_equipo (JSON si viene de fetch).
// Cualquier cuenta puede crear un equipo y queda como su capitán: solo es capitán de los equipos que creó.
// Cada cuenta crea un solo equipo: quien ya tiene no vuelve al wizard y quien no tiene no ve el panel.
// La validación está en middlewares/validators.js (validarEquipo) y el acceso a datos en models/equipoModel.js.

const equipoModel = require('../models/equipoModel');
const jugadorModel = require('../models/jugadorModel');
const { jugadorParaVista, detectarTipoImagen, leerEscudo } = require('./jugadorController');
const { LONGITUD_MAXIMA_MENSAJE_SOLICITUD, leerModalidades } = require('../middlewares/validators');
const { NIVELES, POSICIONES, ESTADISTICAS, calcularMedia } = require('../config/perfilJugador');
const {
  MODALIDADES, FORMACIONES, puestosDeFormacion, DETALLE_NIVEL, BARRAS_NIVEL, MAX_EQUIPOS_COMO_CAPITAN, // CORRECCIÓN: regla 5
} = require('../config/equipo');
const ubicacionModel = require('../models/ubicacionModel'); // CORRECCIÓN: regla 11
const avisosEquipo = require('./avisosEquipo');
const equipoFichaModel = require('../models/equipoFichaModel'); // NUEVO: PE-021 / PE-017 // NUEVO: NT-001 (notificaciones de solicitudes, invitaciones y desafíos)

// CORRECCIÓN: regla 5 — aviso cuando la cuenta ya capitanea el máximo de equipos.
const AVISO_LIMITE_EQUIPOS = `Alcanzaste el límite de ${MAX_EQUIPOS_COMO_CAPITAN} `
  + `${MAX_EQUIPOS_COMO_CAPITAN === 1 ? 'equipo' : 'equipos'} como capitán. Para crear otro, primero desactiva uno.`;

// Aviso cuando una cuenta de jugador intenta crear un equipo (/crear-equipo → /equipos?aviso=solo-jugador).
const AVISO_SOLO_JUGADOR = 'Tu cuenta es de jugador: crear equipos es solo para capitanes. Busca un equipo y únete.';

/**
 * ¿La cuenta puede crear un equipo nuevo?
 *  - 'solo-jugador': se registró como jugador (rol_inicio 'jugador') y no capitanea ninguno. Crear
 *    equipos es solo para capitanes: quien eligió "Soy capitán" en el registro (rol_inicio 'equipo')
 *    o quien ya capitanea alguno (cuentas antiguas).
 *  - 'limite': CORRECCIÓN: regla 5 — ya capitanea MAX_EQUIPOS_COMO_CAPITAN equipos activos.
 *  - 'puede'
 * @param {{ idAuth: string, rolInicio: string|null }} usuario - req.usuario
 * @returns {Promise<'puede'|'limite'|'solo-jugador'>}
 */
async function estadoCreacionEquipo(usuario) {
  const capitaneados = await equipoModel.contarEquiposDeCapitan(usuario.idAuth);
  if (usuario.rolInicio !== 'equipo' && capitaneados === 0) return 'solo-jugador';
  return capitaneados >= MAX_EQUIPOS_COMO_CAPITAN ? 'limite' : 'puede';
}

/** Adónde vuelve quien no puede crear un equipo: los jugadores, al directorio; los capitanes, a sus equipos con el aviso. */
function rutaSinCreacion(estado) {
  return estado === 'solo-jugador' ? '/equipos?aviso=solo-jugador' : '/mis-equipos?aviso=limite';
}

// Avisos del directorio (?aviso=... o JSON): solo textos fijos, nunca lo que llega en la URL.
// Responden a "Solicitar unirme".
const AVISOS_UNION = {
  enviada: 'Solicitud enviada. El capitán la verá en su panel.',
  pendiente: 'Ya tienes una solicitud pendiente con ese equipo.',
  invitado: 'Ese equipo ya te invitó: acepta la invitación desde tu panel.', // CORRECCIÓN: regla 6
  miembro: 'Ya eres parte de ese equipo.',
  inexistente: 'Ese equipo ya no está disponible.',
  'mensaje-largo': 'El mensaje es demasiado largo: acórtalo e inténtalo de nuevo.',
};

// Avisos del panel tras responder una solicitud (?aviso=...): solo textos fijos.
const AVISOS_PANEL = {
  aceptada: 'Solicitud aceptada: el jugador ya es parte de tu plantel.',
  rechazada: 'Solicitud rechazada.',
  inexistente: 'Esa solicitud ya fue respondida o no es de tu equipo.',
  modalidades: 'Tipos de fútbol actualizados: arma la alineación de cada uno.',
  'sin-modalidad': 'Tu equipo debe jugar al menos un tipo de fútbol.',
  'sin-permiso': 'Solo el capitán que creó el equipo puede cambiar sus tipos de fútbol.',
};

// Respuestas al guardar la alineación (JSON para equipo.js): solo textos fijos.
const AVISOS_ALINEACION = {
  'sin-permiso': 'Solo el capitán que creó el equipo puede armar la alineación.',
  invalida: 'La alineación no es válida: recarga la página e inténtalo de nuevo.',
};

// Avisos tras "Enviar Desafío" (?desafio=... o JSON): solo textos fijos.
const AVISOS_DESAFIO = {
  enviado: '¡Desafío enviado! El capitán rival lo verá en su panel.',
  pendiente: 'Ya hay un desafío pendiente con ese equipo.',
  'sin-equipo': 'Solo el capitán que creó el equipo puede enviar desafíos.',
  inexistente: 'Ese equipo ya no está disponible.',
  modalidad: 'Solo puedes desafiar en una modalidad que jueguen los dos equipos.', // CORRECCIÓN: regla 12
};

// Avisos tras "Enviar Invitación" (?invitacion=... o JSON): solo textos fijos.
const AVISOS_INVITACION = {
  enviada: '¡Invitación enviada! El jugador la verá pronto.',
  'ya-invitado': 'Ya invitaste a ese jugador.',
  miembro: 'Ese jugador ya es parte de tu plantel.',
  'sin-permiso': 'Solo el capitán que creó el equipo puede invitar jugadores.',
  inexistente: 'Ese jugador ya no está disponible.',
  'solicitud-pendiente': 'Ese jugador ya te envió una solicitud: respóndela en Solicitudes Pendientes.', // CORRECCIÓN: regla 6
};

// Etiquetas de las posiciones del catálogo: cualquier otra cosa se muestra como "Sin posición" en gris.
const POSICIONES_ETIQUETAS = Object.values(POSICIONES).map(({ etiqueta }) => etiqueta);

// Avisos del dashboard tras responder una invitación (?invitacion=...): solo textos fijos.
const AVISOS_RESPUESTA_INVITACION = {
  aceptada: '¡Bienvenido! Ya eres parte del plantel.',
  rechazada: 'Invitación rechazada.',
  inexistente: 'Esa invitación ya fue respondida o ya no está disponible.',
};

// Avisos al sacar a un jugador (panel) o al salir de un equipo (?salida=...): solo textos fijos.
const AVISOS_SACAR = {
  sacado: 'El jugador ya no es parte del plantel.',
  'no-permitido': 'No puedes sacar a ese jugador.',
};
const AVISOS_SALIDA = {
  saliste: 'Saliste del equipo.',
  'no-permitido': 'No puedes salir de ese equipo (si eres su capitán, el equipo quedaría sin capitán).',
};
// Después de salir se vuelve a la página desde donde se pidió (solo estas)
const VOLVER_TRAS_SALIR = ['/dashboard', '/mis-equipos'];

/** Lo que dibuja la carta mini de un jugador (partials/carta-jugador con mini). */
function cartaDeJugador(jugador) {
  const posicion = POSICIONES[jugador.clavePosicion];
  return {
    nombre: jugador.nombreCarta,
    media: jugador.stats ? calcularMedia(jugador.stats) : '—',
    posicion: { sigla: posicion ? posicion.sigla : '—' },
    estadisticas: ESTADISTICAS.map(({ clave, sigla }) => ({ sigla, valor: jugador.stats ? jugador.stats[clave] : '—' })),
    foto: jugador.fotoVersion ? `/jugadores/${jugador.id}/foto?v=${jugador.fotoVersion}` : null,
  };
}

/**
 * Alineación de una modalidad (views/equipo-panel.ejs): un puesto por jugador de la modalidad, ubicado según
 * la formación, con su titular (o vacío), y el resto del plantel en el banco de suplentes.
 * Si el capitán aún no guardó ninguna para esa modalidad, se propone una: cada uno en un puesto de su línea
 * y los que sobran en los puestos libres de campo (al arco solo va un arquero).
 * @param {Array} plantel - De equipoModel.listarPlantel (puestos de cada jugador por modalidad).
 * @param {{jugadores: number, formacion: string}} modalidad - Una de equipo.modalidades.
 */
function alineacionEnCancha(plantel, { jugadores, formacion }) {
  const puestos = puestosDeFormacion(formacion);
  const ocupantes = puestos.map(() => null);
  const puestoDe = (jugador) => jugador.puestos[jugadores] ?? null;
  plantel.forEach((jugador) => {
    const puesto = puestoDe(jugador);
    if (puesto !== null && puesto < puestos.length && !ocupantes[puesto]) ocupantes[puesto] = jugador;
  });

  if (!plantel.some((jugador) => puestoDe(jugador) !== null)) {
    const ubicar = (jugador, admite) => {
      const libre = puestos.find((puesto) => !ocupantes[puesto.indice] && admite(puesto));
      if (libre) ocupantes[libre.indice] = jugador;
    };
    plantel.forEach((jugador) => ubicar(jugador, (puesto) => puesto.linea === jugador.clavePosicion));
    plantel
      .filter((jugador) => !ocupantes.includes(jugador))
      .sort((a, b) => (a.clavePosicion === 'arquero') - (b.clavePosicion === 'arquero')) // arqueros de campo, al final
      .forEach((jugador) => ubicar(jugador, (puesto) => puesto.linea !== 'arquero'));
  }

  const conCarta = (jugador) => ({ ...jugador, carta: cartaDeJugador(jugador) });
  return {
    jugadores,
    nombre: MODALIDADES[jugadores],
    formacion,
    formaciones: FORMACIONES[jugadores] || [],
    // Puestos de cada formación de la modalidad: equipo.js los usa al cambiar de formación sin recargar
    puestosPorFormacion: Object.fromEntries((FORMACIONES[jugadores] || []).map((f) => [f, puestosDeFormacion(f)])),
    puestos: puestos.map((puesto, i) => ({ ...puesto, jugador: ocupantes[i] && conCarta(ocupantes[i]) })),
    suplentes: plantel.filter((jugador) => !ocupantes.includes(jugador)).map(conCarta),
    titulares: ocupantes.filter(Boolean).length,
  };
}

// Modal "Invitar jugador +": desde qué media la tarjeta lleva borde destacado y el OVR brilla en neón.
const MEDIA_DESTACADA = 70;
const MEDIA_ALTA = 75;

/**
 * Tarjeta del modal "Invitar jugador +": media, barras de stats y la etiqueta con su situación
 * ("Agente Libre", "Juega en <equipo>" o "Multi-equipo" si está en varios).
 * Sin estadísticas (perfil incompleto) la media es '—' y las barras quedan en gris con '—'.
 */
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

// Código de PostgreSQL para "la columna no existe".
const COLUMNA_INEXISTENTE = '42703';

/** Pasa el error al manejador general; si faltan las columnas de la sección W, deja una pista clara en la consola. */
function pasarError(err, next) {
  if (err.code === COLUMNA_INEXISTENTE) {
    console.error('⚠️  Faltan columnas de equipo o equipo_jugador: ejecuta la sección W de sql/seed.sql y '
      + 'node scripts/ejecutar-sql.js sql/nuevas_tablas.sql (formación y alineación, F8-1).');
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
    regiones, // CORRECCIÓN: regla 11 (listas Región y Comuna del paso 2)
    catalogos: { NIVELES, MODALIDADES, DETALLE_NIVEL, BARRAS_NIVEL },
  });
}

// ---------------------------------------------------------------
// GET /crear-equipo → wizard vacío (el correo de contacto parte con el de la cuenta)
// ---------------------------------------------------------------
async function mostrarCrear(req, res, next) {
  try {
    // CORRECCIÓN: regla 5 — con el límite alcanzado se explica por qué (antes redirigía sin aviso).
    // Las cuentas de jugador no crean equipos.
    const estado = await estadoCreacionEquipo(req.usuario);
    if (estado !== 'puede') return res.redirect(rutaSinCreacion(estado));
    const regiones = await ubicacionModel.listarRegionesConComunas(); // CORRECCIÓN: regla 11
    return renderWizard(res, { datos: { correo: req.usuario.correo }, regiones });
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
    // CORRECCIÓN: regla 5 — límite de equipos como capitán, con aviso. Las cuentas de jugador no crean equipos.
    const estado = await estadoCreacionEquipo(req.usuario);
    if (estado !== 'puede') return res.redirect(rutaSinCreacion(estado));

    // CORRECCIÓN: regla 11 — la comuna debe existir en la lista (no se confía en lo que llega del formulario).
    if (datos.idComuna && !(await ubicacionModel.obtenerComuna(datos.idComuna))) {
      errores.push('La comuna elegida no es válida.');
    }
    // Escudo opcional: crear-equipo.js lo reduce y lo manda como data URL en el campo "escudo".
    const escudo = leerEscudo(req.body.escudo);
    if (errores.length > 0) {
      const regiones = await ubicacionModel.listarRegionesConComunas();
      // El escudo vuelve tal cual para no tener que elegirlo otra vez.
    }

    const equipo = await equipoModel.crearEquipo(req.usuario.idAuth, datos);
    if (escudo) {
      // El equipo ya quedó creado: sin escudo se ve la inicial y el capitán lo sube después en /mi-equipo.
      await equipoModel.guardarEscudo(req.usuario.idAuth, equipo.id, escudo.datos, escudo.tipo).catch((err) => {
        console.error('⚠️  No se pudo guardar el escudo del equipo nuevo:', err.message);
      });
    }
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

    // Sin ?equipo=: el capitán con varios equipos (o el capitán sin ninguno) elige desde la lista;
    // con uno solo, o si solo juega en equipos ajenos, entra directo al panel.
    if (!idElegido) {
      const capitaneados = (await equipoModel.listarMisEquipos(req.usuario.idAuth)).filter((e) => e.soyCapitan);
      const capitanSinEquipo = capitaneados.length === 0 && req.usuario.rolInicio === 'equipo'
        && !(await equipoModel.obtenerMiEquipo(req.usuario.idAuth));
      if (capitaneados.length > 1 || capitanSinEquipo) {
        return res.render('equipos-capitan', {
          titulo: 'Mi equipo',
          pagina: 'equipo',
          equipos: capitaneados,
          aviso: AVISOS_PANEL[req.query.aviso] || null,
        });
      }
    }

    const equipo = await equipoModel.obtenerMiEquipo(req.usuario.idAuth, idElegido || null);
    // Pidió un equipo al que no pertenece: vuelve a su equipo principal
    if (!equipo && idElegido) return res.redirect('/mi-equipo');
    // Sin equipo (el capitán sin equipos ya vio la lista vacía): el jugador busca uno al que unirse.
    if (!equipo) return res.redirect('/equipos');

    const [plantel, solicitudes, rivales, invitables, equiposCapitan] = await Promise.all([
      equipoModel.listarPlantel(equipo.id),
      equipo.soyCapitan ? equipoModel.listarSolicitudesPendientes(equipo.id) : [],
      equipo.soyCapitan ? equipoModel.listarRivales(equipo.id) : [],
      equipo.soyCapitan ? equipoModel.listarJugadoresParaInvitar(equipo.id) : [],
      // Selector para pasar de un equipo a otro (solo si capitanea más de uno)
      equipo.soyCapitan ? equipoModel.listarMisEquipos(req.usuario.idAuth).then((lista) => lista.filter((e) => e.soyCapitan)) : [],
    ]);
    return res.render('equipo-panel', {
      titulo: 'Mi equipo',
      pagina: 'equipo',
      equipo,
      equiposCapitan,
      plantel,
      // Una alineación por cada tipo de fútbol que juega el equipo (pestañas en la vista);
      // ?modalidad= elige la pestaña abierta (si no la juega, la primera)
      alineaciones: equipo.modalidades.map((modalidad) => alineacionEnCancha(plantel, modalidad)),
      modalidadActiva: (equipo.modalidades.find((m) => m.jugadores === Number(req.query.modalidad))
        || equipo.modalidades[0] || {}).jugadores,
      MODALIDADES,
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

// ---------------------------------------------------------------
// GET /mis-equipos → los equipos de la cuenta, cada uno con su plantel
// ---------------------------------------------------------------
async function misEquipos(req, res, next) {
  try {
    const [equipos, creacion] = await Promise.all([
      equipoModel.listarMisEquiposConPlantel(req.usuario.idAuth),
      estadoCreacionEquipo(req.usuario), // CORRECCIÓN: regla 5
    ]);
    return res.render('mis-equipos', {
      titulo: 'Mis equipos',
      pagina: 'equipo',
      misEquipos: equipos,
      puedeCrear: creacion === 'puede', // CORRECCIÓN: regla 5 (MAX_EQUIPOS_COMO_CAPITAN); jugadores no
      avisoLimite: creacion === 'limite' ? AVISO_LIMITE_EQUIPOS : null, // CORRECCIÓN: regla 5
      equiposInactivos: await equipoFichaModel.listarInactivosDeCapitan(req.usuario.idAuth), // NUEVO: PE-017
      aviso: AVISOS_SALIDA[req.query.salida] || (req.query.aviso === 'limite' ? AVISO_LIMITE_EQUIPOS : null),
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
    const [equipos, miEquipo, creacion] = await Promise.all([
      equipoModel.listarEquipos(req.usuario.idAuth),
      equipoModel.obtenerMiEquipo(req.usuario.idAuth),
      estadoCreacionEquipo(req.usuario), // CORRECCIÓN: regla 5
    ]);
    return res.render('equipos', {
      titulo: 'Directorio de Equipos',
      pagina: 'equipo',
      equipos,
      tieneEquipo: Boolean(miEquipo),
      puedeCrear: creacion === 'puede', // CORRECCIÓN: regla 5 (MAX_EQUIPOS_COMO_CAPITAN); jugadores no
      avisoLimite: creacion === 'limite' ? AVISO_LIMITE_EQUIPOS : null, // CORRECCIÓN: regla 5
      equiposQueBuscan: await equipoFichaModel.listarEquiposQueBuscan(), // NUEVO: PE-021
      LONGITUD_MENSAJE: LONGITUD_MAXIMA_MENSAJE_SOLICITUD,
      aviso: AVISOS_UNION[req.query.aviso] || (req.query.aviso === 'solo-jugador' ? AVISO_SOLO_JUGADOR : null),
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
    if (resultado === 'enviada') await avisosEquipo.solicitudEnviada(req.usuario, idEquipo); // NUEVO: NT-001 / PE-004
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
  // ?equipo= (lo ponen los formularios): vuelve al panel de ese equipo y no a la lista de equipos del capitán
  const idEquipo = idDeParametro(req.query.equipo);
  try {
    const resultado = Number.isInteger(idSolicitud) && idSolicitud > 0 && (accion === 'aceptar' || accion === 'rechazar')
      ? await equipoModel.responderSolicitud(req.usuario.idAuth, idSolicitud, accion === 'aceptar')
      : 'inexistente';
    if (resultado !== 'inexistente') await avisosEquipo.solicitudRespondida(idSolicitud, resultado); // NUEVO: NT-001 / PE-005
    return res.redirect(`/mi-equipo?${idEquipo ? `equipo=${idEquipo}&` : ''}aviso=${resultado}`);
  } catch (err) {
    return pasarError(err, next);
  }
}

/** Número entero positivo de un parámetro de la URL, o null. */
function idDeParametro(valor) {
  const id = Number(valor);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/**
 * Titulares que envía equipo.js: ids separados por coma, uno por puesto ('' = puesto vacío).
 * @returns {Array<number|null>|null} null si algún id no es válido.
 */
function leerTitulares(valor) {
  if (typeof valor !== 'string') return null;
  const titulares = valor.split(',').map((id) => (id === '' ? null : idDeParametro(id) || NaN));
  return titulares.some(Number.isNaN) ? null : titulares;
}

// ---------------------------------------------------------------
// POST /equipos/:id/alineacion → modalidad, formación y titulares (lo envía equipo.js tras cada cambio en la cancha)
// ---------------------------------------------------------------
async function guardarAlineacion(req, res, next) {
  const idEquipo = idDeParametro(req.params.id);
  const jugadores = Number(req.body.modalidad);
  const formacion = typeof req.body.formacion === 'string' ? req.body.formacion : '';
  const titulares = leerTitulares(req.body.titulares);
  try {
    if (!idEquipo || !MODALIDADES[jugadores] || !titulares) {
      return res.status(400).json({ ok: false, mensaje: AVISOS_ALINEACION.invalida });
    }
    const resultado = await equipoModel.guardarAlineacion(req.usuario.idAuth, idEquipo, jugadores, formacion, titulares);
    if (resultado !== 'guardada') {
      return res.status(resultado === 'sin-permiso' ? 403 : 400).json({ ok: false, mensaje: AVISOS_ALINEACION[resultado] });
    }
    return res.json({ ok: true });
  } catch (err) {
    return pasarError(err, next);
  }
}

// ---------------------------------------------------------------
// POST /equipos/:id/modalidades → el capitán marca los tipos de fútbol que juega y vuelve al panel
// ---------------------------------------------------------------
async function actualizarModalidades(req, res, next) {
  const idEquipo = idDeParametro(req.params.id);
  const modalidades = leerModalidades(req.body.modalidad);
  try {
    if (!idEquipo) return res.redirect('/mi-equipo');
    if (modalidades.length === 0) return res.redirect(`/mi-equipo?equipo=${idEquipo}&aviso=sin-modalidad`);
    const resultado = await equipoModel.actualizarModalidades(req.usuario.idAuth, idEquipo, modalidades);
    return res.redirect(`/mi-equipo?equipo=${idEquipo}&aviso=${resultado === 'actualizadas' ? 'modalidades' : 'sin-permiso'}`);
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
// ?equipo= dice desde cuál de sus equipos desafía el capitán (sin él, el primero que creó).
// ---------------------------------------------------------------
async function desafiar(req, res, next) {
  const idRival = Number(req.params.id);
  const idPropio = idDeParametro(req.query.equipo);
  const panel = idPropio ? `/mi-equipo?equipo=${idPropio}&` : '/mi-equipo?';
  const quiereJson = req.accepts(['html', 'json']) === 'json';
  try {
    if (req.erroresDesafio.length > 0) {
      if (quiereJson) return res.status(400).json({ error: req.erroresDesafio.join(' ') });
      return res.redirect(panel.slice(0, -1));
    }
    const resultado = Number.isInteger(idRival) && idRival > 0
      ? await equipoModel.enviarDesafio(req.usuario.idAuth, idRival, req.datosDesafio.mensaje,
        MODALIDADES[Number(req.body.modalidad)] ? Number(req.body.modalidad) : null, idPropio)
      : 'inexistente';
    if (resultado === 'enviado') await avisosEquipo.desafioEnviado(req.usuario, idRival, idPropio); // NUEVO: NT-001 / DE-008
    if (quiereJson) return res.json({ resultado, mensaje: AVISOS_DESAFIO[resultado] });
    return res.redirect(`${panel}desafio=${resultado}`);
  } catch (err) {
    return pasarError(err, next);
  }
}

// ---------------------------------------------------------------
// POST /equipos/:id/invitaciones/:idJugador → el capitán invita a un jugador (el modelo
// comprueba que el equipo sea suyo). JSON desde equipo.js; sin JavaScript vuelve al panel.
// ---------------------------------------------------------------
async function invitar(req, res, next) {
  const idEquipo = idDeParametro(req.params.id);
  const idJugador = idDeParametro(req.params.idJugador);
  const quiereJson = req.accepts(['html', 'json']) === 'json';
  try {
    const resultado = idEquipo && idJugador
      ? await equipoModel.invitarJugador(req.usuario.idAuth, idEquipo, idJugador)
      : 'inexistente';
    if (resultado === 'enviada') await avisosEquipo.invitacionEnviada(idEquipo, idJugador); // NUEVO: NT-001 / PE-022
    if (quiereJson) return res.json({ resultado, mensaje: AVISOS_INVITACION[resultado] });
    return res.redirect(`/mi-equipo?${idEquipo ? `equipo=${idEquipo}&` : ''}invitacion=${resultado}`);
  } catch (err) {
    return pasarError(err, next);
  }
}

// ---------------------------------------------------------------
// POST /invitaciones/:id/:accion → el jugador acepta o rechaza (el modelo comprueba
// que la invitación sea para el jugador de esta cuenta). Vuelve al dashboard con el aviso.
// ---------------------------------------------------------------
async function responderInvitacion(req, res, next) {
  const idInvitacion = idDeParametro(req.params.id);
  const { accion } = req.params;
  try {
    const resultado = idInvitacion && (accion === 'aceptar' || accion === 'rechazar')
      ? await equipoModel.responderInvitacion(req.usuario.idAuth, idInvitacion, accion === 'aceptar')
      : 'inexistente';
    if (resultado === 'aceptada') await avisosEquipo.invitacionAceptada(idInvitacion); // NUEVO: NT-001 / PE-023
    return res.redirect(`/dashboard?invitacion=${resultado}`);
  } catch (err) {
    return pasarError(err, next);
  }
}

// ---------------------------------------------------------------
// POST /equipos/:id/plantel/:idJugador/sacar → el capitán saca a un jugador (el modelo comprueba
// que el equipo sea suyo y que no sea él mismo). JSON desde equipo.js; sin JavaScript vuelve al panel.
// ---------------------------------------------------------------
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

// ---------------------------------------------------------------
// POST /equipos/:id/salir → el jugador sale del equipo y vuelve a la página desde donde lo pidió
// ---------------------------------------------------------------
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
  guardarAlineacion,
  actualizarModalidades,
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
