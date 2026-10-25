const { DIAS_SEMANA, LIMITES_CHILE, PRECIO_HORA } = require('../config/canchas');

const LARGO = { nombreRecinto: 150, calle: 150, numero: 20, referencias: 255, nombreCancha: 100, catalogo: 50 };
const REGEX_HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

function texto(valor) {
  return String(valor || '').trim().replace(/\s+/g, ' ');
}

function idValido(valor) {
  const id = Number(valor);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function normalizarTelefonoRecinto(valor) {
  const limpio = String(valor || '').replace(/[\s\-().]/g, '');
  const coincidencia = limpio.match(/^(?:\+?56)?(\d{9})$/);
  return coincidencia ? `+56${coincidencia[1]}` : null;
}

function decimalEnRango(valor, { min, max }) {
  const limpio = String(valor || '').trim().replace(',', '.');
  if (!limpio) return null;
  const numero = Number(limpio);
  return Number.isFinite(numero) && numero >= min && numero <= max ? numero : null;
}

function validarRecinto(req, res, next) {
  const b = req.body;
  const datos = {
    nombre: texto(b.nombre),
    telefonoIngresado: texto(b.telefono),
    telefono: normalizarTelefonoRecinto(b.telefono),
    latitudIngresada: String(b.latitud || '').trim(),
    longitudIngresada: String(b.longitud || '').trim(),
    latitud: decimalEnRango(b.latitud, LIMITES_CHILE.latitud),
    longitud: decimalEnRango(b.longitud, LIMITES_CHILE.longitud),
    calle: texto(b.calle),
    numero: texto(b.numero),
    referencias: texto(b.referencias),
    idRegion: idValido(b.id_region),
    idComuna: idValido(b.id_comuna),
  };
  const e = {};
  if (!datos.nombre) e.nombre = 'El nombre del recinto es obligatorio.';
  else if (datos.nombre.length > LARGO.nombreRecinto) e.nombre = `Máximo ${LARGO.nombreRecinto} caracteres.`;
  if (!datos.telefonoIngresado) e.telefono = 'El teléfono es obligatorio.';
  else if (!datos.telefono) e.telefono = 'Teléfono chileno de 9 dígitos, por ejemplo +56 2 2345 6789 o +56 9 1234 5678.';
  if (!datos.latitudIngresada) e.latitud = 'La latitud es obligatoria.';
  else if (datos.latitud === null) e.latitud = `La latitud debe estar entre ${LIMITES_CHILE.latitud.min} y ${LIMITES_CHILE.latitud.max} (Chile).`;
  if (!datos.longitudIngresada) e.longitud = 'La longitud es obligatoria.';
  else if (datos.longitud === null) e.longitud = `La longitud debe estar entre ${LIMITES_CHILE.longitud.min} y ${LIMITES_CHILE.longitud.max} (Chile).`;
  if (!datos.calle) e.calle = 'La calle es obligatoria.';
  else if (datos.calle.length > LARGO.calle) e.calle = `Máximo ${LARGO.calle} caracteres.`;
  if (!datos.numero) e.numero = 'El número es obligatorio (escribe S/N si no tiene).';
  else if (datos.numero.length > LARGO.numero) e.numero = `Máximo ${LARGO.numero} caracteres.`;
  if (datos.referencias.length > LARGO.referencias) e.referencias = `Máximo ${LARGO.referencias} caracteres.`;
  if (!datos.idRegion) e.id_region = 'Elige la región.';
  if (!datos.idComuna) e.id_comuna = 'Elige la comuna.';
  req.datosFormulario = datos;
  req.erroresCampo = e;
  next();
}

function precioValido(valor) {
  const limpio = String(valor || '').trim().replace(/\./g, '');
  const precio = Number(limpio);
  return limpio && Number.isInteger(precio) && precio >= PRECIO_HORA.min && precio <= PRECIO_HORA.max ? precio : null;
}

function validarCancha(req, res, next) {
  const datos = {
    nombre: texto(req.body.nombre),
    precioIngresado: String(req.body.precio || '').trim(),
    precio: precioValido(req.body.precio),
    idModalidad: idValido(req.body.id_modalidad),
    confirmado: req.body.confirmado === 'si',
  };
  const e = {};
  if (!datos.nombre) e.nombre = 'El nombre de la cancha es obligatorio.';
  else if (datos.nombre.length > LARGO.nombreCancha) e.nombre = `Máximo ${LARGO.nombreCancha} caracteres.`;
  if (!datos.precioIngresado) e.precio = 'El precio por hora es obligatorio.';
  else if (datos.precio === null) e.precio = 'El precio por hora debe ser un número entero mayor a cero (en pesos).';
  if (!datos.idModalidad) e.id_modalidad = 'Elige la modalidad.';
  req.datosFormulario = datos;
  req.erroresCampo = e;
  next();
}

function validarBloque(req, res, next) {
  const datos = {
    dia: String(req.body.dia || ''),
    apertura: String(req.body.apertura || '').trim(),
    cierre: String(req.body.cierre || '').trim(),
  };
  const e = {};
  if (!DIAS_SEMANA.some(({ clave }) => clave === datos.dia)) e.dia = 'Elige el día.';
  if (!datos.apertura) e.apertura = 'La hora de apertura es obligatoria.';
  else if (!REGEX_HORA.test(datos.apertura)) e.apertura = 'Hora no válida (HH:MM).';
  if (!datos.cierre) e.cierre = 'La hora de cierre es obligatoria.';
  else if (!REGEX_HORA.test(datos.cierre)) e.cierre = 'Hora no válida (HH:MM).';
  if (!e.apertura && !e.cierre && datos.cierre <= datos.apertura) e.cierre = 'La hora de cierre debe ser posterior a la de apertura.';
  req.datosFormulario = datos;
  req.erroresCampo = e;
  next();
}

function enteroEnRango(valor, min, max) {
  const limpio = String(valor ?? '').trim();
  const numero = Number(limpio);
  return limpio !== '' && Number.isInteger(numero) && numero >= min && numero <= max ? numero : null;
}

function validarCatalogo(req, res, next) {
  const tipo = req.params.tipo;
  const datos = { nombre: texto(req.body.nombre) };
  const e = {};
  if (!datos.nombre) e.nombre = 'El nombre es obligatorio.';
  else if (datos.nombre.length > LARGO.catalogo) e.nombre = `Máximo ${LARGO.catalogo} caracteres.`;

  if (tipo === 'modalidades') {
    datos.jugadores = enteroEnRango(req.body.jugadores, 1, 30);
    if (datos.jugadores === null) e.jugadores = 'La cantidad de jugadores debe ser un entero mayor a cero (máximo 30).';
  }
  if (tipo === 'niveles') {
    datos.min = enteroEnRango(req.body.min, 0, 100000);
    datos.max = enteroEnRango(req.body.max, 0, 100000);
    if (datos.min === null) e.min = 'Puntaje mínimo: entero desde 0.';
    if (datos.max === null) e.max = 'Puntaje máximo: entero desde 0.';
    if (datos.min !== null && datos.max !== null && datos.max < datos.min) e.max = 'El máximo debe ser mayor o igual al mínimo.';
  }
  req.datosFormulario = datos;
  req.erroresCampo = e;
  next();
}

module.exports = { validarRecinto, validarCancha, validarBloque, validarCatalogo, idValido };
