// config/perfilJugador.js
// Catálogos del perfil deportivo (wizard /perfil-jugador y carta /perfil).
// Las claves son las que viajan en el formulario; "db" es el nombre en las tablas
// posicion (se busca sin importar mayúsculas).

const POSICIONES = {
  arquero: { etiqueta: 'Portero', sigla: 'POR', db: ['Arquero', 'Portero'] },
  defensa: { etiqueta: 'Defensa', sigla: 'DEF', db: ['Defensa'] },
  mediocampista: { etiqueta: 'Mediocampista', sigla: 'MED', db: ['Mediocampista'] },
  delantero: { etiqueta: 'Delantero', sigla: 'DEL', db: ['Delantero'] },
};

const PIES = {
  izquierdo: 'Izquierdo',
  derecho: 'Derecho',
};

// Estadísticas de la carta, en el orden en que se muestran.
// "columna" es la columna de la tabla jugador (sql/seed.sql, sección V).
const ESTADISTICAS = [
  { clave: 'ritmo', sigla: 'RIT', nombre: 'Ritmo', columna: 'stat_ritmo' },
  { clave: 'tiro', sigla: 'TIR', nombre: 'Tiro', columna: 'stat_tiro' },
  { clave: 'pase', sigla: 'PAS', nombre: 'Pase', columna: 'stat_pase' },
  { clave: 'regate', sigla: 'REG', nombre: 'Regate', columna: 'stat_regate' },
  { clave: 'defensa', sigla: 'DEF', nombre: 'Defensa', columna: 'stat_defensa' },
  { clave: 'fisico', sigla: 'FIS', nombre: 'Físico', columna: 'stat_fisico' },
];

// Rango de las estadísticas iniciales (sorteadas al terminar el wizard).
const STAT_MIN = 50;
const STAT_MAX = 85;

/** Estadísticas iniciales al azar entre STAT_MIN y STAT_MAX: { ritmo: 72, ... }. */
function sortearEstadisticas() {
  return Object.fromEntries(
    ESTADISTICAS.map(({ clave }) => [clave, STAT_MIN + Math.floor(Math.random() * (STAT_MAX - STAT_MIN + 1))])
  );
}

/** Media general de la carta: promedio redondeado de las 6 estadísticas. */
function calcularMedia(stats) {
  const valores = ESTADISTICAS.map(({ clave }) => Number(stats[clave]) || 0);
  return Math.round(valores.reduce((suma, valor) => suma + valor, 0) / valores.length);
}

module.exports = {
  POSICIONES,
  PIES,
  ESTADISTICAS,
  sortearEstadisticas,
  calcularMedia,
};
