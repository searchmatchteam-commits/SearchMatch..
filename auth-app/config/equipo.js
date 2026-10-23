// config/equipo.js
// Catálogos del wizard de equipo (/crear-equipo) y del directorio (/equipos).
// El nivel reutiliza NIVELES de config/perfilJugador.js (misma tabla nivel).

// Tipo de fútbol: la clave es modalidad.cantidad_de_jugadores (sql/seed.sql, sección W).
const MODALIDADES = {
  5: 'Fútbol 5',
  7: 'Fútbol 7',
  11: 'Fútbol 11',
};

// Texto bajo cada nivel en el wizard.
const DETALLE_NIVEL = {
  principiante: 'Conociendo las reglas',
  intermedio: 'Juego regular y táctica',
  avanzado: 'Alta intensidad y técnica',
};

// Barras llenas del ícono de señal de cada nivel (de 3).
const BARRAS_NIVEL = {
  principiante: 1,
  intermedio: 2,
  avanzado: 3,
};

// CORRECCIÓN: regla 5 — cuántos equipos activos puede crear (capitanear) una misma cuenta.
// Es el único lugar donde se define: el asistente, /equipos y /mis-equipos lo leen de aquí.
const MAX_EQUIPOS_COMO_CAPITAN = 1;

module.exports = {
  MAX_EQUIPOS_COMO_CAPITAN, // CORRECCIÓN: regla 5
  MODALIDADES,
  DETALLE_NIVEL,
  BARRAS_NIVEL,
};
