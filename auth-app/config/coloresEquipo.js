// Colores de un equipo: los dos de su identidad (personalizan su carta) y los de sus dos camisetas
// (local y visita), con los que se elige la equipación de cada partido sin que ambos equipos vistan igual.
// Se guardan como "#rrggbb" en equipo.color_primario, color_secundario, camiseta_local y camiseta_visita.

const CAMPOS = {
  color_primario: 'Color principal',
  color_secundario: 'Color secundario',
  camiseta_local: 'Camiseta de local',
  camiseta_visita: 'Camiseta de visita',
};

// Valores con que parte el formulario (verde SearchMatch y blanco).
const PREDETERMINADOS = {
  color_primario: '#16a34a',
  color_secundario: '#ffffff',
  camiseta_local: '#16a34a',
  camiseta_visita: '#ffffff',
};

const REGEX_COLOR = /^#[0-9a-f]{6}$/;

// Distancia "redmean" (aproxima cómo percibe el ojo la diferencia; va de 0 a ~765). Bajo este umbral dos
// camisetas se confunden en la cancha (p. ej. rojo y granate, o blanco y crema).
const UMBRAL_PARECIDOS = 120;

/** "#AbC123" → "#abc123"; cualquier otra cosa → null. */
function normalizarColor(valor) {
  const texto = String(valor || '').trim().toLowerCase();
  return REGEX_COLOR.test(texto) ? texto : null;
}

function rgb(hex) {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
}

/** Diferencia percibida entre dos colores "#rrggbb" (0 = iguales). */
function distanciaColor(a, b) {
  const [r1, g1, b1] = rgb(a);
  const [r2, g2, b2] = rgb(b);
  const media = (r1 + r2) / 2;
  const [dr, dg, db] = [r1 - r2, g1 - g2, b1 - b2];
  return Math.sqrt((2 + media / 256) * dr * dr + 4 * dg * dg + (2 + (255 - media) / 256) * db * db);
}

/** ¿Dos camisetas se confunden en la cancha? */
function coloresParecidos(a, b) {
  return Boolean(a && b) && distanciaColor(a, b) < UMBRAL_PARECIDOS;
}

/** Texto legible sobre un fondo de ese color: "#111111" sobre colores claros, "#ffffff" sobre oscuros. */
function colorTexto(hex) {
  const [r, g, b] = rgb(hex);
  return (0.299 * r + 0.587 * g + 0.114 * b) > 150 ? '#111111' : '#ffffff';
}

/**
 * Camisetas que se asumen a partir de los colores del equipo: local = color principal y visita = secundario.
 * Si los dos colores se confunden en la cancha, la de visita pasa a blanco o negro (la que más contraste).
 */
function camisetasPorDefecto(primario, secundario) {
  const local = primario;
  let visita = secundario || primario;
  if (coloresParecidos(local, visita)) {
    visita = distanciaColor(local, '#ffffff') >= distanciaColor(local, '#111111') ? '#ffffff' : '#111111';
  }
  return { camiseta_local: local, camiseta_visita: visita };
}

/**
 * Lee y valida los colores del formulario del equipo.
 * Al crear un equipo solo se piden sus dos colores: las camisetas se asumen iguales (camisetasPorDefecto) y se
 * pueden cambiar después al editar el equipo o al elegir la equipación de un desafío. Si el formulario sí trae
 * las camisetas (editar equipo), se validan como antes.
 * @returns {{ colores: object, errores: string[] }} colores con las claves de CAMPOS (null si no vino válido).
 */
function leerColores(body) {
  const colores = {};
  const errores = [];
  const conCamisetas = body.camiseta_local !== undefined || body.camiseta_visita !== undefined;
  Object.entries(CAMPOS).forEach(([campo, etiqueta]) => {
    if (!conCamisetas && campo.startsWith('camiseta_')) return;
    colores[campo] = normalizarColor(body[campo]);
    if (!colores[campo]) errores.push(`Elige el color: ${etiqueta.toLowerCase()}.`);
  });
  if (!conCamisetas) {
    Object.assign(colores, colores.color_primario ? camisetasPorDefecto(colores.color_primario, colores.color_secundario)
      : { camiseta_local: null, camiseta_visita: null });
  } else if (coloresParecidos(colores.camiseta_local, colores.camiseta_visita)) {
    errores.push('Tus camisetas de local y de visita deben ser de colores distintos: así siempre hay una que no choca con el rival.');
  }
  return { colores, errores };
}

/**
 * Colores de una fila de equipo para las vistas, o null si el equipo aún no los eligió.
 * estilo: variables CSS para la carta (--c1, --c2 y --ct, el texto legible sobre el color principal).
 */
function coloresDe(fila) {
  const primario = normalizarColor(fila && fila.color_primario);
  if (!primario) return null;
  const secundario = normalizarColor(fila.color_secundario) || primario;
  return {
    primario,
    secundario,
    local: normalizarColor(fila.camiseta_local),
    visita: normalizarColor(fila.camiseta_visita),
    estilo: `--c1:${primario};--c2:${secundario};--ct:${colorTexto(primario)}`,
  };
}

/** Las dos camisetas de un equipo (fila con camiseta_local y camiseta_visita), o [] si no las registró. */
function camisetasDe(equipo) {
  return [['local', equipo.camiseta_local], ['visita', equipo.camiseta_visita]]
    .filter(([, color]) => normalizarColor(color))
    .map(([clave, color]) => ({ clave, color: normalizarColor(color), nombre: clave === 'local' ? 'Local' : 'Visita' }));
}

/**
 * Equipación sugerida para un partido: el desafiado (dueño de casa) usa su local; el desafiante, la camiseta
 * suya que menos se parece a la del rival. Si un equipo no registró camisetas, queda null.
 * @returns {{ desafiado: string|null, desafiante: string|null, choque: boolean }} claves 'local' | 'visita'.
 */
function sugerirEquipaciones(desafiante, desafiado) {
  const propias = camisetasDe(desafiado);
  const rivales = camisetasDe(desafiante);
  if (!propias.length || !rivales.length) {
    return { desafiado: propias[0] ? propias[0].clave : null, desafiante: rivales[0] ? rivales[0].clave : null, choque: false };
  }
  // Primera combinación que no choca, en orden de preferencia: el dueño de casa de local y, si se puede,
  // también el visitante de local. Si todas chocan, la más distinta (y se avisa).
  const combinaciones = propias.flatMap((casa) => rivales.map((visita) => ({ casa, visita })));
  const sinChoque = combinaciones.find((c) => !coloresParecidos(c.casa.color, c.visita.color));
  const elegida = sinChoque || combinaciones.reduce((a, b) => (
    distanciaColor(b.casa.color, b.visita.color) > distanciaColor(a.casa.color, a.visita.color) ? b : a));
  return { desafiado: elegida.casa.clave, desafiante: elegida.visita.clave, choque: !sinChoque };
}

/**
 * Valida la equipación elegida al programar un partido. Cada valor es 'local' | 'visita' (o vacío si ese
 * equipo no tiene camisetas registradas).
 * @returns {{ equipacion: {desafiante: string|null, desafiado: string|null}, error: string|null }}
 */
function validarEquipaciones(body, desafiante, desafiado, { mensajeChoque = null } = {}) {
  const elegir = (equipo, valor) => {
    const camisetas = camisetasDe(equipo);
    if (!camisetas.length) return { clave: null, color: null, falta: false };
    const camiseta = camisetas.find((c) => c.clave === valor);
    return camiseta ? { clave: camiseta.clave, color: camiseta.color, falta: false } : { clave: null, color: null, falta: true };
  };
  const a = elegir(desafiante, body.camiseta_desafiante);
  const b = elegir(desafiado, body.camiseta_desafiado);
  let error = null;
  if (a.falta || b.falta) error = 'Elige con qué camiseta juega cada equipo.';
  // Si todas las combinaciones se parecen no se bloquea el partido (lo resuelven con petos); si hay otra, se exige.
  else if (coloresParecidos(a.color, b.color) && !sugerirEquipaciones(desafiante, desafiado).choque) {
    error = mensajeChoque || 'Los dos equipos quedarían con camisetas del mismo color: elige otra equipación para uno de ellos.';
  }
  return { equipacion: { desafiante: a.clave, desafiado: b.clave }, error };
}

/**
 * El desafiante ya eligió su camiseta al desafiar: solo cuenta esa (la otra queda fuera de la elección).
 * @param {object} fila - equipo con camiseta_local y camiseta_visita.
 * @param {'local'|'visita'|null} clave - la que eligió; null = puede usar cualquiera (desafíos antiguos).
 */
function soloCamiseta(fila, clave) {
  if (!clave || !normalizarColor(fila[`camiseta_${clave}`])) return fila;
  return { ...fila, camiseta_local: clave === 'local' ? fila.camiseta_local : null, camiseta_visita: clave === 'visita' ? fila.camiseta_visita : null };
}

const MSG_COLOR_DEL_RIVAL = 'El equipo rival irá de ese color, cámbiala.';

module.exports = {
  camisetasPorDefecto,
  MSG_COLOR_DEL_RIVAL,
  soloCamiseta,
  CAMPOS,
  PREDETERMINADOS,
  normalizarColor,
  distanciaColor,
  coloresParecidos,
  colorTexto,
  leerColores,
  coloresDe,
  camisetasDe,
  sugerirEquipaciones,
  validarEquipaciones,
};
