// controllers/avisosEquipo.js
// NT-001 · Notificaciones de los flujos de equipos que ya existían (equipoController los llama con una
// sola línea marcada "NUEVO"). Cada función arma el mensaje y usa notificacionModel.
// Nunca lanzan error: si algo falla, la acción del usuario ya se hizo y solo se registra en la consola.

const notificacionModel = require('../models/notificacionModel');

/** Ejecuta un aviso sin dejar que un error interrumpa la respuesta. */
function seguro(tarea) {
  return tarea().catch((err) => console.error('⚠️  No se pudo notificar:', err.message));
}

/** PE-004 · El jugador envió una solicitud: avisa al capitán. */
function solicitudEnviada(usuario, idEquipo) {
  return seguro(async () => {
    const equipo = await notificacionModel.nombreEquipo(idEquipo);
    await notificacionModel.notificarCapitan(idEquipo, 'solicitud_equipo',
      `${usuario.nombre} quiere unirse a ${equipo}. Revisa su solicitud.`, `/mi-equipo?equipo=${idEquipo}`);
  });
}

/** PE-005 · El capitán respondió una solicitud: avisa al jugador. */
function solicitudRespondida(idSolicitud, resultado) {
  return seguro(async () => {
    const datos = await notificacionModel.datosSolicitud(idSolicitud);
    if (!datos) return;
    const texto = resultado === 'aceptada' ? `¡${datos.equipo} aceptó tu solicitud! Ya eres parte del plantel.` : `${datos.equipo} rechazó tu solicitud.`;
    await notificacionModel.notificarJugador(datos.id_jugador, 'solicitud_equipo', texto, '/solicitudes');
  });
}

/** PE-022 · El capitán invitó a un jugador: avisa al jugador. */
function invitacionEnviada(idEquipo, idJugador) {
  return seguro(async () => {
    const equipo = await notificacionModel.nombreEquipo(idEquipo);
    await notificacionModel.notificarJugador(idJugador, 'invitacion', `${equipo} te invitó a su equipo. Acepta o rechaza desde tu panel.`, '/dashboard');
  });
}

/** PE-023 · El jugador aceptó la invitación: avisa al capitán. */
function invitacionAceptada(idInvitacion) {
  return seguro(async () => {
    const datos = await notificacionModel.datosInvitacion(idInvitacion);
    if (!datos) return;
    await notificacionModel.notificarCapitan(datos.id_equipo, 'invitacion', `${datos.jugador} aceptó tu invitación y ya está en el plantel.`,
      `/mi-equipo?equipo=${datos.id_equipo}`);
  });
}

/** DE-008 · Un capitán desafió a otro equipo: avisa al capitán desafiado. */
function desafioEnviado(usuario, idRival, idPropio = null) {
  return seguro(async () => {
    const propio = await notificacionModel.equipoDeCapitan(usuario.idAuth, idPropio);
    await notificacionModel.notificarCapitan(idRival, 'desafio',
      `${propio ? propio.nombre : 'Un equipo'} desafió a tu equipo. Acepta o rechaza el desafío.`, `/desafios?equipo=${idRival}&ver=recibidos`);
  });
}

/** PE-016 · El capitán transfirió la capitanía: avisa al nuevo capitán. */
function capitaniaTransferida(idUsuarioNuevo, equipo, idEquipo) {
  return seguro(() => notificacionModel.notificarUsuario(idUsuarioNuevo, 'equipo',
    `Ahora eres el capitán de ${equipo}. Ya puedes administrar su plantel, sus desafíos y sus partidos.`, `/mi-equipo?equipo=${idEquipo}`));
}

module.exports = { solicitudEnviada, solicitudRespondida, invitacionEnviada, invitacionAceptada, desafioEnviado, capitaniaTransferida };
