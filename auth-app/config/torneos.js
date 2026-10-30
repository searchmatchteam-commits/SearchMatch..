// config/torneos.js
// Reglas de los torneos (SA-2 a SA-7). Funciones puras: no tocan la base de datos.
//  - Eliminación directa (valor 'relampago' en la base): llaves; con una cantidad que no es potencia de 2,
//    algunos equipos pasan directo a la ronda siguiente (fase 3).
//  - Liga: todos contra todos a una vuelta (2 a 20 equipos, puede ser impar: cada fecha descansa uno).
//  - Fase de grupos + eliminación ('grupos'): grupos de tamaño similar y los mejores de cada uno a las llaves.
//  - Emparejamiento (SA-4): por orden de llegada (1° vs 2°, 3° vs 4°...) o tómbola (se barajan al empezar).

const FORMATOS = {
  relampago: 'Eliminación directa',
  liga: 'Liga',
  grupos: 'Fase de grupos + eliminación',
};

const EMPAREJAMIENTOS = {
  sorteo: 'Tómbola (sorteo al empezar)',
  llegada: 'Orden de llegada',
};

const ESTADOS = {
  borrador: 'Borrador',
  abierto: 'Inscripciones abiertas',
  completo: 'Cupos completos',
  cerrado: 'Inscripciones cerradas',
  en_curso: 'En curso',
  finalizado: 'Finalizado',
  cancelado: 'Cancelado',
};

// Estados en que el torneo recibe inscripciones (completo: todos los cupos ocupados o reservados).
const CON_INSCRIPCIONES = ['abierto', 'completo'];

const ESTADOS_INSCRIPCION = {
  pendiente_pago: 'Pendiente de pago',
  confirmada: 'Confirmada',
  expirada: 'Expirada',
  eliminada: 'Eliminada',
  retiro_pendiente: 'Retiro pendiente',
  retirada: 'Retirada',
  reembolsada: 'Reembolsada',
  finalizada: 'Finalizada',
};

// Inscripciones que son participantes del torneo (las pendiente_pago vigentes además ocupan cupo).
const INSCRIPCION_PARTICIPA = ['confirmada', 'eliminada', 'retiro_pendiente', 'finalizada'];
// Inscripciones activas: un equipo no puede tener otra en el mismo torneo mientras tenga una de estas.
const INSCRIPCION_ACTIVA = ['pendiente_pago', ...INSCRIPCION_PARTICIPA];

const MEDIOS_PAGO = { webpay: 'Webpay', mercadopago: 'Mercado Pago', paypal: 'PayPal' };

// Campos del formulario (nombre del campo → texto), para avisos de cambios y de campos que faltan.
const CAMPOS = {
  nombre: 'Nombre', foto: 'Foto', descripcion: 'Descripción', reglamento: 'Reglamento', premios: 'Premios',
  formato: 'Formato', emparejamiento: 'Emparejamiento', id_modalidad: 'Modalidad', id_nivel_min: 'Nivel mínimo',
  id_nivel_max: 'Nivel máximo', id_recinto: 'Recinto', canchas: 'Canchas', fecha_inicio: 'Fecha de inicio',
  hora_inicio: 'Hora de inicio', fecha_termino: 'Fecha de término', fecha_limite_inscripcion: 'Fecha límite de inscripción',
  cupo_min: 'Cupo mínimo', cupo_max: 'Cupo máximo', min_jugadores: 'Mínimo de jugadores por plantel',
  cantidad_grupos: 'Cantidad de grupos', clasifican_por_grupo: 'Clasificados por grupo', precio: 'Precio de inscripción',
  medios_pago: 'Medios de pago', patrocinadores: 'Patrocinadores',
};

const EQUIPOS_RELAMPAGO = [4, 8, 16, 32];
const EQUIPOS_LIGA = { min: 2, max: 20 };
const LIMITES = {
  cupoMin: 2,
  cupoMax: 64,
  grupos: { min: 2, max: 8 },
  clasifican: { min: 1, max: 4 },
  jugadores: { min: 1, max: 30 },
  precioMax: 10000000,
  descripcion: 2000,
  reglamento: 10000,
};
const MAX_PATROCINADORES = 6;
const PUNTOS = { victoria: 3, empate: 1 };

/**
 * TO-001 c4 y c6 · Errores de cupos y grupos (objeto vacío si todo está bien).
 * @param {{formato:string, cupoMin:number|null, cupoMax:number|null, cantidadGrupos?:number|null, clasificanPorGrupo?:number|null}} d
 * @returns {Object<string,string>} claves: cupo_min, cupo_max, cantidad_grupos, clasifican_por_grupo
 */
function erroresCupos(d) {
  const e = {};
  if (!Number.isInteger(d.cupoMin)) e.cupo_min = 'Indica el cupo mínimo de equipos.';
  else if (d.cupoMin < LIMITES.cupoMin) e.cupo_min = `El cupo mínimo debe ser de al menos ${LIMITES.cupoMin} equipos.`;
  if (!Number.isInteger(d.cupoMax)) e.cupo_max = 'Indica el cupo máximo de equipos.';
  else if (d.cupoMax > LIMITES.cupoMax) e.cupo_max = `El cupo máximo es de ${LIMITES.cupoMax} equipos.`;
  else if (!e.cupo_min && d.cupoMax < d.cupoMin) e.cupo_max = 'El cupo máximo no puede ser menor que el mínimo.';
  if (d.formato === 'liga' && !e.cupo_max && d.cupoMax > EQUIPOS_LIGA.max) {
    e.cupo_max = `Una liga tiene como máximo ${EQUIPOS_LIGA.max} equipos (todos contra todos).`;
  }
  if (d.formato === 'grupos') {
    const g = d.cantidadGrupos;
    const c = d.clasificanPorGrupo;
    if (!Number.isInteger(g)) e.cantidad_grupos = 'Indica la cantidad de grupos.';
    else if (g < LIMITES.grupos.min || g > LIMITES.grupos.max) e.cantidad_grupos = `Entre ${LIMITES.grupos.min} y ${LIMITES.grupos.max} grupos.`;
    if (!Number.isInteger(c)) e.clasifican_por_grupo = 'Indica cuántos equipos clasifican por grupo.';
    else if (c < LIMITES.clasifican.min || c > LIMITES.clasifican.max) e.clasifican_por_grupo = `Entre ${LIMITES.clasifican.min} y ${LIMITES.clasifican.max} por grupo.`;
    // Cada grupo necesita más equipos que clasificados, ya con el cupo mínimo.
    if (!e.cantidad_grupos && !e.clasifican_por_grupo && !e.cupo_min && d.cupoMin < g * (c + 1)) {
      e.cupo_min = `Con ${g} grupos y ${c} clasificados por grupo, el cupo mínimo debe ser de al menos ${g * (c + 1)} equipos.`;
    }
  }
  return e;
}

/**
 * TO-001 c3 · Errores de fechas ('AAAA-MM-DD', ya validadas como fechas reales).
 * La fecha límite de inscripción no puede ser posterior al inicio; el término no puede ser anterior al inicio.
 */
function erroresFechas({ fechaInicio, fechaTermino, fechaLimite }) {
  const e = {};
  if (fechaInicio && fechaLimite && fechaLimite > fechaInicio) e.fecha_limite_inscripcion = 'La fecha límite de inscripción no puede ser posterior a la fecha de inicio.';
  if (fechaInicio && fechaTermino && fechaTermino < fechaInicio) e.fecha_termino = 'La fecha de término no puede ser anterior a la fecha de inicio.';
  return e;
}

/**
 * TO-003 · Campos que se pueden cambiar según el estado. null = todos (borrador); [] = ninguno.
 * Con inscripciones abiertas: foto, descripción, reglamento, premios, ampliar el cupo máximo y extender la fecha límite.
 */
function camposEditables(estado) {
  if (estado === 'borrador') return null;
  if (CON_INSCRIPCIONES.includes(estado)) return ['foto', 'descripcion', 'reglamento', 'premios', 'cupo_max', 'fecha_limite_inscripcion'];
  if (estado === 'cerrado' || estado === 'en_curso') return ['foto', 'descripcion', 'reglamento', 'premios'];
  return [];
}

/**
 * AP-027 c4 · Acciones válidas para un torneo según su estado (en orden para el menú).
 * @returns {string[]} de: ver, editar, publicar, eliminar, cerrar, fixture
 */
function accionesTorneo(estado) {
  const acciones = ['ver'];
  const editables = camposEditables(estado);
  if (editables === null || editables.length > 0) acciones.push('editar');
  if (estado === 'borrador') acciones.push('publicar', 'eliminar');
  if (CON_INSCRIPCIONES.includes(estado)) acciones.push('cerrar');
  if (estado === 'cerrado') acciones.push('fixture');
  return acciones;
}

/** Fecha de hoy en Chile, 'AAAA-MM-DD' (el formato sueco sirve justo para eso). */
function hoyChile(ahora = new Date()) {
  return ahora.toLocaleDateString('sv-SE', { timeZone: 'America/Santiago' });
}

/** TO-004 c3 / TO-005 c4 · ¿Ya pasó la fecha límite de inscripción? (el día límite todavía se puede inscribir). */
function inscripcionVencida(fechaLimite, hoy = hoyChile()) {
  return Boolean(fechaLimite) && fechaLimite < hoy;
}

/** Estado según los cupos: 'completo' si los ocupados (confirmados + reservas vigentes) llegan al máximo. */
function estadoPorCupos(estado, ocupados, cupoMax) {
  if (!CON_INSCRIPCIONES.includes(estado)) return estado;
  return ocupados >= cupoMax ? 'completo' : 'abierto';
}

/** Monto en pesos chilenos: 12000 → '$12.000'. */
function formatoCLP(monto) {
  return `$${Math.round(Number(monto) || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;
}

/** TO-002 c6 / TO-022 · Equivalente en USD (redondeado hacia arriba al centavo) o null sin tipo de cambio. */
function aUSD(montoCLP, tipoCambio) {
  const tc = Number(tipoCambio);
  if (!(tc > 0)) return null;
  return Math.ceil((Number(montoCLP) / tc) * 100) / 100;
}

/**
 * TO-002 c1 y c3 · Precio entero en CLP ("12000" o "12.000"); null si es negativo, tiene decimales o no es número.
 * @returns {number|null}
 */
function leerPrecio(valor) {
  const t = String(valor ?? '').trim();
  if (!/^(\d{1,3}(\.\d{3})+|\d+)$/.test(t)) return null;
  const n = Number(t.replace(/\./g, ''));
  return Number.isSafeInteger(n) && n <= LIMITES.precioMax ? n : null;
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/**
 * Fecha de inicio en texto (SA-5). Sin fecha → 'Por confirmar'.
 * @param {string|null} fecha - 'AAAA-MM-DD' (sin zona horaria: es la fecha de Chile).
 * @param {string|null} hora - 'HH:MM' o null.
 * @returns {{larga: string, corta: string|null}} larga: '15 de noviembre, 2026 · 10:00 hrs'; corta: '15 de nov'.
 */
function textoFechaInicio(fecha, hora) {
  if (!fecha) return { larga: 'Por confirmar', corta: null };
  const [anio, mes, dia] = fecha.split('-').map(Number);
  const larga = `${dia} de ${MESES[mes - 1]}, ${anio}${hora ? ` · ${hora} hrs` : ''}`;
  return { larga, corta: `${dia} de ${MESES[mes - 1].slice(0, 3)}` };
}

/** Nombre de una ronda de la llave según cuántos partidos tiene. */
function nombreRonda(partidosEnRonda) {
  return { 1: 'Final', 2: 'Semifinal', 4: 'Cuartos de final', 8: 'Octavos de final', 16: 'Dieciseisavos de final' }[partidosEnRonda]
    || `Ronda de ${partidosEnRonda * 2}`;
}

function barajar(lista) {
  const copia = [...lista];
  for (let i = copia.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copia[i], copia[j]] = [copia[j], copia[i]];
  }
  return copia;
}

/** Equipos en el orden en que se emparejan: tal cual llegaron ('llegada') o barajados ('sorteo'). */
function ordenarParaEmparejar(idsEquipos, emparejamiento) {
  return emparejamiento === 'llegada' ? [...idsEquipos] : barajar(idsEquipos);
}

/**
 * Fixture de liga por el método del círculo: n-1 fechas (n par) o n fechas (n impar, con un descanso por fecha).
 * @param {number[]} idsEquipos - En orden de inscripción.
 * @param {'llegada'|'sorteo'} emparejamiento - Con 'llegada', la fecha 1 es 1° vs 2°, 3° vs 4°... (si son impares, descansa el último).
 * @returns {{ronda:number, orden:number, local:number, visita:number}[]}
 */
function fixtureLiga(idsEquipos, emparejamiento = 'sorteo') {
  const enOrden = ordenarParaEmparejar(idsEquipos, emparejamiento);
  if (enOrden.length % 2 === 1) enOrden.push(null); // null = descansa
  const n = enOrden.length;
  // El círculo enfrenta la posición i con la n-1-i: los pares (0,1), (2,3)... quedan en esas posiciones.
  const equipos = new Array(n);
  for (let i = 0; i < n / 2; i += 1) {
    equipos[i] = enOrden[2 * i];
    equipos[n - 1 - i] = enOrden[2 * i + 1];
  }
  const partidos = [];
  for (let fecha = 0; fecha < n - 1; fecha += 1) {
    let orden = 0;
    for (let i = 0; i < n / 2; i += 1) {
      const a = equipos[i];
      const b = equipos[n - 1 - i];
      if (a !== null && b !== null) {
        // Alterna local y visita para que nadie sea siempre local.
        const [local, visita] = (fecha + i) % 2 === 0 ? [a, b] : [b, a];
        partidos.push({ ronda: fecha + 1, orden: orden++, local, visita });
      }
    }
    equipos.splice(1, 0, equipos.pop()); // rota todos menos el primero
  }
  return partidos;
}

/**
 * Primera ronda de la llave: con 'llegada', 1° vs 2°, 3° vs 4°... (lo mismo que muestra el cuadrante
 * mientras se inscriben); con 'sorteo', cruces al azar.
 * @param {number[]} idsEquipos - En orden de inscripción.
 */
function primeraRondaLlave(idsEquipos, emparejamiento = 'sorteo') {
  const equipos = ordenarParaEmparejar(idsEquipos, emparejamiento);
  const partidos = [];
  for (let i = 0; i < equipos.length; i += 2) {
    partidos.push({ ronda: 1, orden: i / 2, local: equipos[i], visita: equipos[i + 1] });
  }
  return partidos;
}

/**
 * Tabla de posiciones de una liga.
 * @param {{id:number, nombre:string}[]} equipos
 * @param {{id_local, id_visita, goles_local, goles_visita, jugado}[]} partidos
 */
function tablaLiga(equipos, partidos) {
  const filas = new Map(equipos.map((e) => [e.id, {
    id: e.id, nombre: e.nombre, pj: 0, pg: 0, pe: 0, pp: 0, gf: 0, gc: 0, dg: 0, pts: 0,
  }]));
  partidos.filter((p) => p.jugado).forEach((p) => {
    const local = filas.get(p.id_local);
    const visita = filas.get(p.id_visita);
    [[local, p.goles_local, p.goles_visita], [visita, p.goles_visita, p.goles_local]].forEach(([fila, gf, gc]) => {
      if (!fila) return;
      fila.pj += 1;
      fila.gf += gf;
      fila.gc += gc;
      if (gf > gc) { fila.pg += 1; fila.pts += PUNTOS.victoria; }
      else if (gf === gc) { fila.pe += 1; fila.pts += PUNTOS.empate; }
      else fila.pp += 1;
    });
  });
  return [...filas.values()]
    .map((f) => ({ ...f, dg: f.gf - f.gc }))
    .sort((a, b) => b.pts - a.pts || b.dg - a.dg || b.gf - a.gf || a.nombre.localeCompare(b.nombre, 'es'));
}

/**
 * Separa el monto del texto libre de premios: "1er lugar $500.000" → { monto: '$500.000', resto: '1er lugar' }.
 * Acepta el monto con o sin "$" ("$500.000", "500.000", "$80000"); sin monto, monto queda vacío.
 * @param {string} texto
 */
function partirPremio(texto) {
  const m = texto.match(/\$\s?\d[\d.]*|\d{1,3}(?:\.\d{3})+/);
  if (!m) return { monto: '', resto: texto };
  return { monto: '$' + m[0].replace(/[\s$]/g, ''), resto: texto.replace(m[0], '').replace(/\(?\s*CLP\s*\)?/i, '').replace(/^[\s+·,:-]+|[\s+·,:-]+$/g, '') };
}

module.exports = {
  FORMATOS, ESTADOS, CON_INSCRIPCIONES, ESTADOS_INSCRIPCION, INSCRIPCION_PARTICIPA, INSCRIPCION_ACTIVA, MEDIOS_PAGO, CAMPOS, EMPAREJAMIENTOS, EQUIPOS_RELAMPAGO, EQUIPOS_LIGA,
  LIMITES, MAX_PATROCINADORES,
  erroresCupos, erroresFechas, hoyChile, inscripcionVencida, estadoPorCupos, camposEditables, accionesTorneo, formatoCLP, aUSD, leerPrecio,
  textoFechaInicio, nombreRonda, fixtureLiga, primeraRondaLlave, tablaLiga, partirPremio,
};
