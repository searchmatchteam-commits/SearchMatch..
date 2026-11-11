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

// El portero tiene sus propias estadísticas (columnas stat_estirada... de jugador, sql/stats_portero.sql).
const ESTADISTICAS_PORTERO = [
  { clave: 'estirada', sigla: 'EST', nombre: 'Estirada', columna: 'stat_estirada' },
  { clave: 'manejo', sigla: 'MAN', nombre: 'Manejo', columna: 'stat_manejo' },
  { clave: 'saque', sigla: 'SAQ', nombre: 'Saque', columna: 'stat_saque' },
  { clave: 'reflejos', sigla: 'REF', nombre: 'Reflejos', columna: 'stat_reflejos' },
  { clave: 'velocidad', sigla: 'VEL', nombre: 'Velocidad', columna: 'stat_velocidad' },
  { clave: 'colocacion', sigla: 'COL', nombre: 'Colocación', columna: 'stat_colocacion' },
];

// Todas las que se leen y guardan (las de campo primero).
const TODAS_LAS_ESTADISTICAS = [...ESTADISTICAS, ...ESTADISTICAS_PORTERO];

const STAT_INICIAL = 50;

const STAT_RANGO = { min: 1, max: 99 };

// Peso de cada estadística en la media según la posición (cada fila suma 1). Las de cada posición pesan más
// que un promedio simple (1/6 ≈ 0,17): las que llegan a PESO_CLAVE son sus estadísticas clave y la carta las destaca.
const PESOS = {
  arquero: { reflejos: 0.25, estirada: 0.25, colocacion: 0.2, manejo: 0.2, saque: 0.05, velocidad: 0.05 },
  defensa: { defensa: 0.35, fisico: 0.25, ritmo: 0.15, pase: 0.15, regate: 0.05, tiro: 0.05 },
  mediocampista: { pase: 0.35, regate: 0.2, defensa: 0.15, ritmo: 0.1, tiro: 0.1, fisico: 0.1 },
  delantero: { tiro: 0.35, ritmo: 0.2, regate: 0.2, fisico: 0.1, pase: 0.1, defensa: 0.05 },
};
const PESO_CLAVE = 0.2;

/** Estadísticas que corresponden a una posición: las de portero o las de campo. */
function estadisticasDe(posicion) {
  return posicion === 'arquero' ? ESTADISTICAS_PORTERO : ESTADISTICAS;
}

function sortearEstadisticas() {
  return Object.fromEntries(TODAS_LAS_ESTADISTICAS.map(({ clave }) => [clave, STAT_INICIAL]));
}

/**
 * Media de la carta. Con posición, ponderada por PESOS (sus estadísticas clave valen más); sin posición
 * (o una desconocida), el promedio simple de las de campo.
 */
function calcularMedia(stats, posicion = null) {
  const valor = (clave) => Number(stats[clave] ?? STAT_INICIAL) || 0;
  const pesos = PESOS[posicion];
  if (!pesos) {
    return Math.round(ESTADISTICAS.reduce((suma, { clave }) => suma + valor(clave), 0) / ESTADISTICAS.length);
  }
  return Math.round(Object.entries(pesos).reduce((suma, [clave, peso]) => suma + valor(clave) * peso, 0));
}

/**
 * Stats de una fila de jugador (columnas stat_*): null si le faltan las de campo (perfil incompleto).
 * Las de portero que aún no tenga parten en STAT_INICIAL.
 */
function statsDeFila(fila) {
  if (!ESTADISTICAS.every(({ columna }) => fila[columna] !== null && fila[columna] !== undefined)) return null;
  return Object.fromEntries(TODAS_LAS_ESTADISTICAS.map(({ clave, columna }) => [
    clave, fila[columna] === null || fila[columna] === undefined ? STAT_INICIAL : Number(fila[columna]),
  ]));
}

/** Una carta: la media y las estadísticas de una posición (las clave marcadas con destacada). */
function cartaDePosicion(stats, posicion) {
  const pos = POSICIONES[posicion];
  const pesos = PESOS[posicion] || {};
  return {
    clavePosicion: posicion,
    posicion: { clave: posicion, sigla: pos ? pos.sigla : '—', etiqueta: pos ? pos.etiqueta : '—' },
    media: stats ? calcularMedia(stats, posicion) : '—',
    estadisticas: estadisticasDe(posicion).map(({ clave, sigla, nombre }) => ({
      clave, sigla, nombre, valor: stats ? stats[clave] ?? STAT_INICIAL : '—', destacada: (pesos[clave] || 0) >= PESO_CLAVE,
    })),
  };
}

/**
 * Cartas de un jugador: la principal (su primera posición, la que eligió como principal) y, si combina
 * portero con posiciones de campo, una segunda: la de portero si es su alternativa, o la de su primera
 * posición de campo si es portero de principal.
 * @param {string[]} posiciones - En orden: principal y luego las alternativas.
 */
function cartasDe(posiciones, stats) {
  const principal = posiciones[0] || null;
  const cartas = [{ ...cartaDePosicion(stats, principal), principal: true }];
  const otra = principal === 'arquero'
    ? posiciones.find((p) => p !== 'arquero')
    : posiciones.includes('arquero') && 'arquero';
  if (principal && otra) cartas.push({ ...cartaDePosicion(stats, otra), principal: false });
  return cartas;
}

function nombreEnCarta({ apodo, nombre }) {
  return apodo || nombre;
}

function urlFoto(perfil) {
  return perfil.fotoVersion ? `/perfil/foto?v=${perfil.fotoVersion}` : null;
}

/**
 * IMC (índice de masa corporal) = peso (kg) / altura (m)². Categorías de la OMS para adultos.
 * Es solo referencial (no distingue músculo de grasa): la vista lo muestra como dato, sin juicios.
 * @returns {{ valor: number, texto: string, categoria: string }|null} null si falta la altura o el peso.
 */
function calcularIMC(alturaCm, pesoKg) {
  const altura = Number(alturaCm) / 100;
  const peso = Number(pesoKg);
  if (!(altura > 0) || !(peso > 0)) return null;
  const valor = Math.round((peso / (altura * altura)) * 10) / 10;
  let categoria = 'Normal';
  if (valor < 18.5) categoria = 'Bajo peso';
  else if (valor >= 30) categoria = 'Obesidad';
  else if (valor >= 25) categoria = 'Sobrepeso';
  return { valor, texto: valor.toLocaleString('es-CL', { minimumFractionDigits: 1, maximumFractionDigits: 1 }), categoria };
}

module.exports = {
  calcularIMC,
  POSICIONES,
  PIES,
  NIVELES,
  ESTADISTICAS,
  ESTADISTICAS_PORTERO,
  TODAS_LAS_ESTADISTICAS,
  PESOS,
  PESO_CLAVE,
  STAT_INICIAL,
  STAT_RANGO,
  estadisticasDe,
  sortearEstadisticas,
  calcularMedia,
  statsDeFila,
  cartaDePosicion,
  cartasDe,
  nombreEnCarta,
  urlFoto,
};
