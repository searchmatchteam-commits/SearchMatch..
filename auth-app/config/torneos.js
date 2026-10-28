// config/torneos.js
// Reglas de los torneos (SA-2 / SA-3). Funciones puras: no tocan la base de datos.
//  - Relámpago: eliminación directa, por eso la cantidad de equipos es 4, 8, 16 o 32
//    (cada ronda deja a la mitad: dieciseisavos → octavos → cuartos → semifinal → final).
//  - Liga: todos contra todos a una vuelta (3 a 20 equipos, puede ser impar: cada fecha descansa uno).
//  - Emparejamiento (SA-4): por orden de llegada (1° vs 2°, 3° vs 4°...) o tómbola (se barajan al empezar).

const FORMATOS = {
  liga: 'Liga',
  relampago: 'Torneo relámpago',
};

const EMPAREJAMIENTOS = {
  sorteo: 'Tómbola (sorteo al empezar)',
  llegada: 'Orden de llegada',
};

const ESTADOS = {
  inscripcion: 'Inscripciones abiertas',
  en_curso: 'En curso',
  finalizado: 'Finalizado',
};

const EQUIPOS_RELAMPAGO = [4, 8, 16, 32];
const EQUIPOS_LIGA = { min: 3, max: 20 };
const MAX_PATROCINADORES = 6;
const PUNTOS = { victoria: 3, empate: 1 };

/** Mensaje de error si la cantidad no sirve para el formato (null si está bien). */
function errorCantidad(formato, cantidad) {
  if (formato === 'relampago' && !EQUIPOS_RELAMPAGO.includes(cantidad)) {
    return `Un torneo relámpago se juega por llaves: elige ${EQUIPOS_RELAMPAGO.join(', ').replace(/, (\d+)$/, ' o $1')} equipos.`;
  }
  if (formato === 'liga' && !(cantidad >= EQUIPOS_LIGA.min && cantidad <= EQUIPOS_LIGA.max)) {
    return `Una liga tiene entre ${EQUIPOS_LIGA.min} y ${EQUIPOS_LIGA.max} equipos.`;
  }
  return null;
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

module.exports = {
  FORMATOS, ESTADOS, EMPAREJAMIENTOS, EQUIPOS_RELAMPAGO, EQUIPOS_LIGA, MAX_PATROCINADORES,
  errorCantidad, textoFechaInicio, nombreRonda, fixtureLiga, primeraRondaLlave, tablaLiga,
};
