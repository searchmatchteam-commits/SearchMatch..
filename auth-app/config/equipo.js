// config/equipo.js
// Catálogos del wizard de equipo (/crear-equipo) y del directorio (/equipos).
// El nivel reutiliza NIVELES de config/perfilJugador.js (misma tabla nivel).

// Tipo de fútbol: la clave es modalidad.cantidad_de_jugadores (sql/seed.sql, sección W).
const MODALIDADES = {
  5: 'Fútbol 5',
  7: 'Fútbol 7',
  11: 'Fútbol 11',
};

// Formaciones de cada modalidad: jugadores de campo por línea, de la defensa al ataque (el arquero va aparte,
// así que suman cantidad_de_jugadores - 1). La primera es la que se usa si el capitán no elige otra.
const FORMACIONES = {
  5: ['2-2', '1-2-1', '2-1-1', '3-1'],
  7: ['2-3-1', '3-2-1', '3-3', '2-2-2', '3-1-2'],
  11: ['4-3-3', '4-4-2', '4-2-3-1', '3-5-2', '3-4-3', '5-3-2', '4-1-4-1', '4-5-1'],
};

// Puestos en la cancha (en % del ancho y del alto; el arco propio abajo): altura del arquero y
// de la defensa, y hasta dónde sube la última línea (con solo dos líneas no sube tanto).
const ALTURA_ARQUERO = 88;
const ALTURA_DEFENSA = 70;
const ALTURA_ATAQUE = { dosLineas: 26, masLineas: 14 };
const SIGLA_LINEA = { arquero: 'POR', defensa: 'DEF', mediocampista: 'MED', delantero: 'DEL' };

/**
 * Puestos de una formación, en orden: 0 es el arquero y después cada línea de izquierda a derecha,
 * de la defensa al ataque. Ese índice es el que se guarda en equipo_jugador.puesto.
 * @param {string} formacion - Ej. '4-3-3' (ya validada contra FORMACIONES).
 * @returns {Array<{indice, linea, sigla, x, y}>}
 */
function puestosDeFormacion(formacion) {
  const lineas = formacion.split('-').map(Number);
  const arriba = lineas.length > 2 ? ALTURA_ATAQUE.masLineas : ALTURA_ATAQUE.dosLineas;
  const puestos = [{ linea: 'arquero', x: 50, y: ALTURA_ARQUERO }];
  lineas.forEach((cantidad, i) => {
    const linea = i === 0 ? 'defensa' : i === lineas.length - 1 ? 'delantero' : 'mediocampista';
    const y = ALTURA_DEFENSA - (i * (ALTURA_DEFENSA - arriba)) / (lineas.length - 1);
    for (let j = 0; j < cantidad; j++) {
      puestos.push({ linea, x: 10 + (80 * (j + 0.5)) / cantidad, y });
    }
  });
  return puestos.map((puesto, indice) => ({
    indice,
    linea: puesto.linea,
    sigla: SIGLA_LINEA[puesto.linea],
    x: +puesto.x.toFixed(2),
    y: +puesto.y.toFixed(2),
  }));
}

/**
 * Modalidades de un equipo en texto: [7] → 'Fútbol 7', [7, 11] → 'Fútbol 7 y 11', [5, 7, 11] → 'Fútbol 5, 7 y 11'.
 * @param {number[]} lista - Cantidades de jugadores (las que no están en MODALIDADES se omiten).
 */
function textoModalidades(lista) {
  const validas = [...new Set(lista || [])].filter((n) => MODALIDADES[n]).sort((a, b) => a - b);
  if (validas.length === 0) return '';
  if (validas.length === 1) return MODALIDADES[validas[0]];
  return `Fútbol ${validas.slice(0, -1).join(', ')} y ${validas[validas.length - 1]}`;
}

/** ¿La formación es de esa modalidad? */
function formacionValida(jugadores, formacion) {
  return Boolean(FORMACIONES[jugadores] && FORMACIONES[jugadores].includes(formacion));
}

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
  FORMACIONES,
  puestosDeFormacion,
  formacionValida,
  textoModalidades,
  DETALLE_NIVEL,
  BARRAS_NIVEL,
};
