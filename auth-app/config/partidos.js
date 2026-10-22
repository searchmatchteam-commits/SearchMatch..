// config/partidos.js
// Constantes de reservas y partidos (Fase 7).

// Duración de un partido programado desde un desafío: con ella se reserva la cancha y se revisan choques
// de horario (regla 15). La tabla partido guarda solo la hora de inicio.
const DURACION_PARTIDO_MIN = 60;

// Límites de una reserva de cancha.
const RESERVA = { minimoMin: 30, maximoMin: 6 * 60 };

// Marcador máximo aceptado al registrar un resultado.
const MARCADOR_MAXIMO = 99;

module.exports = { DURACION_PARTIDO_MIN, RESERVA, MARCADOR_MAXIMO };
