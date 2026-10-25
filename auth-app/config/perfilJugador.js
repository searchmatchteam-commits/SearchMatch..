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

const NIVELES = {
  principiante: 'Principiante',
  intermedio: 'Intermedio',
  avanzado: 'Avanzado',
};

const ESTADISTICAS = [
  { clave: 'ritmo', sigla: 'RIT', nombre: 'Ritmo', columna: 'stat_ritmo' },
  { clave: 'tiro', sigla: 'TIR', nombre: 'Tiro', columna: 'stat_tiro' },
  { clave: 'pase', sigla: 'PAS', nombre: 'Pase', columna: 'stat_pase' },
  { clave: 'regate', sigla: 'REG', nombre: 'Regate', columna: 'stat_regate' },
  { clave: 'defensa', sigla: 'DEF', nombre: 'Defensa', columna: 'stat_defensa' },
  { clave: 'fisico', sigla: 'FIS', nombre: 'Físico', columna: 'stat_fisico' },
];

const STAT_INICIAL = 50;

const STAT_RANGO = { min: 1, max: 99 };

function sortearEstadisticas() {
  return Object.fromEntries(ESTADISTICAS.map(({ clave }) => [clave, STAT_INICIAL]));
}

function calcularMedia(stats) {
  const valores = ESTADISTICAS.map(({ clave }) => Number(stats[clave]) || 0);
  return Math.round(valores.reduce((suma, valor) => suma + valor, 0) / valores.length);
}

function nombreEnCarta({ apodo, nombre }) {
  return apodo || nombre;
}

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
