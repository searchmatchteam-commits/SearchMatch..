// config/canchas.js
// Constantes de recintos, canchas y disponibilidad (Fases 2 y 3).

// Días de la semana en el orden en que se muestran. "clave" es lo que se guarda en
// disponibilidad_cancha.dia_semana (sin tildes); "isodow" es el número que da PostgreSQL
// con EXTRACT(ISODOW FROM fecha) (1 = lunes ... 7 = domingo).
const DIAS_SEMANA = [
  { clave: 'lunes', nombre: 'Lunes', isodow: 1 },
  { clave: 'martes', nombre: 'Martes', isodow: 2 },
  { clave: 'miercoles', nombre: 'Miércoles', isodow: 3 },
  { clave: 'jueves', nombre: 'Jueves', isodow: 4 },
  { clave: 'viernes', nombre: 'Viernes', isodow: 5 },
  { clave: 'sabado', nombre: 'Sábado', isodow: 6 },
  { clave: 'domingo', nombre: 'Domingo', isodow: 7 },
];

// Las claves en orden ISO, para usar en SQL: ($1::text[])[EXTRACT(ISODOW FROM fecha)].
const CLAVES_DIAS_ISO = DIAS_SEMANA.map(({ clave }) => clave);

// Coordenadas válidas para un recinto: el territorio de Chile (incluye Isla de Pascua y Juan Fernández).
const LIMITES_CHILE = {
  latitud: { min: -56, max: -17 },
  longitud: { min: -110, max: -66 },
};

// Precio por hora aceptado (en pesos chilenos, sin decimales).
const PRECIO_HORA = { min: 1, max: 1000000 };

// Búsqueda de canchas (DE-002): mínimo de letras para buscar por nombre.
const LARGO_MINIMO_BUSQUEDA = 3;

// Lista de canchas: tarjetas por lote ("Cargar más canchas"), para no dibujar más de mil de una vez.
const CANCHAS_POR_LOTE = 12;

// Días hacia adelante que muestra la disponibilidad con reservas ocupadas (DE-006).
const DIAS_DISPONIBILIDAD = 7;

// Horario referencial: casi todas las canchas (cargadas desde OpenStreetMap) no tienen horario cargado por el
// recinto. Sin este respaldo todas salían "Cerrado" y no se podían reservar. Una cancha SIN ningún bloque en
// disponibilidad_cancha usa este horario todos los días; apenas el panel le carga un bloque, manda el suyo.
const HORARIO_REFERENCIAL = { apertura: '09:00', cierre: '23:00' };

// Duración de cada franja que se ofrece para reservar con un toque (minutos).
const MINUTOS_FRANJA = 60;

// Días hacia adelante que ofrece el selector de horarios al reservar.
const DIAS_RESERVA = 30;

const aMinutos = (hora) => {
  const [h, m] = String(hora).split(':').map(Number);
  return h * 60 + m;
};
const aHora = (minutos) => `${String(Math.floor(minutos / 60)).padStart(2, '0')}:${String(minutos % 60).padStart(2, '0')}`;

/**
 * Franjas de una fecha: cada bloque abierto partido en tramos de MINUTOS_FRANJA.
 * @param {{apertura:string, cierre:string}[]} bloques - horario abierto ese día
 * @param {{inicio:string, fin:string}[]} ocupados - reservas confirmadas ese día
 * @param {number|null} minutoAhora - minutos transcurridos hoy (solo si la fecha es hoy), para marcar lo ya pasado
 * @returns {{inicio:string, fin:string, estado:'libre'|'ocupado'|'pasado'}[]}
 */
function franjasDelDia(bloques, ocupados, minutoAhora = null) {
  const franjas = [];
  bloques.forEach((b) => {
    const cierre = aMinutos(b.cierre === '00:00' ? '24:00' : b.cierre);
    for (let ini = aMinutos(b.apertura); ini + MINUTOS_FRANJA <= cierre; ini += MINUTOS_FRANJA) {
      const fin = ini + MINUTOS_FRANJA;
      const ocupado = ocupados.some((o) => aMinutos(o.inicio) < fin && aMinutos(o.fin === '00:00' ? '24:00' : o.fin) > ini);
      let estado = 'libre';
      if (ocupado) estado = 'ocupado';
      else if (minutoAhora !== null && ini <= minutoAhora) estado = 'pasado';
      franjas.push({ inicio: aHora(ini), fin: aHora(fin), estado });
    }
  });
  return franjas;
}

// Zona horaria de la plataforma (las fechas y horas de reservas y partidos son de Chile).
const ZONA_HORARIA = 'America/Santiago';

module.exports = {
  DIAS_SEMANA,
  CLAVES_DIAS_ISO,
  LIMITES_CHILE,
  PRECIO_HORA,
  LARGO_MINIMO_BUSQUEDA,
  CANCHAS_POR_LOTE,
  DIAS_DISPONIBILIDAD,
  ZONA_HORARIA,
  HORARIO_REFERENCIAL,
  MINUTOS_FRANJA,
  DIAS_RESERVA,
  franjasDelDia,
};
