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
};
