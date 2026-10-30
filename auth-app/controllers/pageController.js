const jugadorModel = require('../models/jugadorModel');
const equipoModel = require('../models/equipoModel');
const { POSICIONES, ESTADISTICAS, calcularMedia, nombreEnCarta } = require('../config/perfilJugador');
const { AVISOS_RESPUESTA_INVITACION, AVISOS_SALIDA } = require('./equipoController');
const agendaController = require('./agendaController');

function landing(req, res) {
  res.render('index', {
    titulo: 'Encuentra tu partido, arma tu equipo',
    pagina: 'landing',
  });
}

async function leerPerfilJugador(usuario) {
  return jugadorModel.obtenerPerfil(usuario.idAuth).catch((err) => {
    console.error('⚠️  No se pudo leer la carta para el dashboard:', err.message);
    return null;
  });
}

async function leerMiEquipo(usuario) {
  if (usuario.rolInicio !== 'equipo') return null;
  return equipoModel.obtenerMiEquipo(usuario.idAuth).catch((err) => {
    console.error('⚠️  No se pudo leer el equipo para el dashboard:', err.message);
    return { nombre: null };
  });
}

async function leerMisEquipos(usuario) {
  return equipoModel.listarMisEquipos(usuario.idAuth).catch((err) => {
    console.error('⚠️  No se pudieron leer los equipos para el dashboard:', err.message);
    return null;
  });
}

async function leerPlanteles(equipos) {
  if (!equipos) return null;
  return equipoModel.agregarPlanteles(equipos).catch((err) => {
    console.error('⚠️  No se pudieron leer los equipos para el dashboard:', err.message);
    return null;
  });
}

async function leerInvitaciones(usuario) {
  return equipoModel.listarMisInvitaciones(usuario.idAuth).catch((err) => {
    console.error('⚠️  No se pudieron leer las invitaciones para el dashboard:', err.message);
    return [];
  });
}

function resumenCarta(perfil) {
  if (!perfil || !perfil.perfilCompleto || !perfil.stats) return null;
  return {
    nombre: nombreEnCarta(perfil),
    media: calcularMedia(perfil.stats),
    posicion: POSICIONES[perfil.posicion] ? POSICIONES[perfil.posicion].sigla : '—',
    stats: ESTADISTICAS.map(({ clave, sigla, nombre }) => ({ sigla, nombre, valor: Number(perfil.stats[clave]) || 0 })),
    altura: perfil.altura,
    peso: perfil.peso,
  };
}

async function dashboard(req, res, next) {
  try {
    const [perfil, miEquipo, equipos, invitaciones] = await Promise.all([
      leerPerfilJugador(req.usuario),
      leerMiEquipo(req.usuario),
      leerMisEquipos(req.usuario),
      leerInvitaciones(req.usuario),
    ]);
    if (perfil && !perfil.perfilCompleto) return res.redirect('/perfil-jugador');
    const [misEquipos, inicio] = await Promise.all([leerPlanteles(equipos), agendaController.datosEquipoInicio(req, equipos)]);
    // El equipo de inicio se elige de la lista básica; a la vista llega con su plantel.
    const equipoInicio = inicio && misEquipos
      ? { ...inicio, equipos: misEquipos, equipo: misEquipos.find((e) => e.id === inicio.equipo.id) }
      : null;

    res.render('dashboard', {
      titulo: 'Mi panel',
      pagina: 'dashboard',
      carta: resumenCarta(perfil),
      miEquipo,
      misEquipos,
      invitaciones,
      equipoInicio,
      aviso: AVISOS_RESPUESTA_INVITACION[req.query.invitacion] || AVISOS_SALIDA[req.query.salida] || null,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { landing, dashboard };
