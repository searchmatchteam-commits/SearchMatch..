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

// Nivel de juego: el valor es el nombre en la tabla nivel (jugador.id_nivel, sql/seed.sql sección V).
const NIVELES = {
  principiante: 'Principiante',
  intermedio: 'Intermedio',
  avanzado: 'Avanzado',
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

// Rango que acepta el editor /perfil/editar (el mismo CHECK de la tabla jugador).
const STAT_RANGO = { min: 1, max: 99 };

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

/**
 * Nombre que muestra la carta: el apodo (obligatorio en el wizard y el editor).
 * Los perfiles creados antes del apodo no tienen: muestran el nombre hasta que lo agreguen.
 */
function nombreEnCarta({ apodo, nombre }) {
  return apodo || nombre;
}

/** URL de la foto guardada (la versión evita que el navegador muestre una foto vieja), o null. */
function urlFoto(perfil) {
  return perfil.fotoVersion ? `/perfil/foto?v=${perfil.fotoVersion}` : null;
}

module.exports = {
  POSICIONES,
  PIES,
  NIVELES,
  ESTADISTICAS,
  STAT_RANGO,
  sortearEstadisticas,
  calcularMedia,
  nombreEnCarta,
  urlFoto,
};
