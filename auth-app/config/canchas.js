const DIAS_SEMANA = [
  { clave: 'lunes', nombre: 'Lunes', isodow: 1 },
  { clave: 'martes', nombre: 'Martes', isodow: 2 },
  { clave: 'miercoles', nombre: 'Miércoles', isodow: 3 },
  { clave: 'jueves', nombre: 'Jueves', isodow: 4 },
  { clave: 'viernes', nombre: 'Viernes', isodow: 5 },
  { clave: 'sabado', nombre: 'Sábado', isodow: 6 },
  { clave: 'domingo', nombre: 'Domingo', isodow: 7 },
];

const CLAVES_DIAS_ISO = DIAS_SEMANA.map(({ clave }) => clave);

const LIMITES_CHILE = {
  latitud: { min: -56, max: -17 },
  longitud: { min: -110, max: -66 },
};

const PRECIO_HORA = { min: 1, max: 1000000 };

const LARGO_MINIMO_BUSQUEDA = 3;

const DIAS_DISPONIBILIDAD = 7;

const ZONA_HORARIA = 'America/Santiago';

module.exports = {
  DIAS_SEMANA,
  CLAVES_DIAS_ISO,
  LIMITES_CHILE,
  PRECIO_HORA,
  LARGO_MINIMO_BUSQUEDA,
  DIAS_DISPONIBILIDAD,
  ZONA_HORARIA,
};
