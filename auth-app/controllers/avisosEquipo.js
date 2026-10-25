const notificacionModel = require('../models/notificacionModel');

function seguro(tarea) {
  return tarea().catch((err) => console.error('⚠️  No se pudo notificar:', err.message));
}

function solicitudEnviada(usuario, idEquipo) {
  return seguro(async () => {
    const equipo = await notificacionModel.nombreEquipo(idEquipo);
    await notificacionModel.notificarCapitan(idEquipo, 'solicitud_equipo',
      `${usuario.nombre} quiere unirse a ${equipo}. Revisa su solicitud.`, `/mi-equipo?equipo=${idEquipo}`);
  });
}

function solicitudRespondida(idSolicitud, resultado) {
  return seguro(async () => {
    const datos = await notificacionModel.datosSolicitud(idSolicitud);
    if (!datos) return;
    const texto = resultado === 'aceptada' ? `¡${datos.equipo} aceptó tu solicitud! Ya eres parte del plantel.` : `${datos.equipo} rechazó tu solicitud.`;
    await notificacionModel.notificarJugador(datos.id_jugador, 'solicitud_equipo', texto, '/solicitudes');
  });
}

function invitacionEnviada(idEquipo, idJugador) {
  return seguro(async () => {
    const equipo = await notificacionModel.nombreEquipo(idEquipo);
    await notificacionModel.notificarJugador(idJugador, 'invitacion', `${equipo} te invitó a su equipo. Acepta o rechaza desde tu panel.`, '/dashboard');
  });
}

function invitacionAceptada(idInvitacion) {
  return seguro(async () => {
    const datos = await notificacionModel.datosInvitacion(idInvitacion);
    if (!datos) return;
    await notificacionModel.notificarCapitan(datos.id_equipo, 'invitacion', `${datos.jugador} aceptó tu invitación y ya está en el plantel.`,
      `/mi-equipo?equipo=${datos.id_equipo}`);
  });
}

function desafioEnviado(usuario, idRival) {
  return seguro(async () => {
    const propio = await notificacionModel.equipoDeCapitan(usuario.idAuth);
    await notificacionModel.notificarCapitan(idRival, 'desafio',
      `${propio ? propio.nombre : 'Un equipo'} desafió a tu equipo. Acepta o rechaza el desafío.`, `/desafios?equipo=${idRival}&ver=recibidos`);
  });
}

module.exports = { solicitudEnviada, solicitudRespondida, invitacionEnviada, invitacionAceptada, desafioEnviado };
