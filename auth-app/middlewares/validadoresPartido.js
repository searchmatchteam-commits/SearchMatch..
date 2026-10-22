// middlewares/validadoresPartido.js
// Validación en el servidor de los formularios de la Fase 7 (reservar, programar partido y resultado).
// Cada validador deja req.datosFormulario y req.erroresCampo ({ campo: 'mensaje' }).

const { ZONA_HORARIA } = require('../config/canchas');
const { RESERVA, MARCADOR_MAXIMO } = require('../config/partidos');
const { idValido } = require('./validadoresAdmin');

const REGEX_FECHA = /^\d{4}-\d{2}-\d{2}$/;
const REGEX_HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Fecha y hora actuales de Chile: { fecha: 'AAAA-MM-DD', hora: 'HH:MM' }. */
function ahoraEnChile() {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: ZONA_HORARIA, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date());
  const valor = (tipo) => partes.find((p) => p.type === tipo).value;
  return { fecha: `${valor('year')}-${valor('month')}-${valor('day')}`, hora: `${valor('hour')}:${valor('minute')}` };
}

/** ¿La fecha "AAAA-MM-DD" existe en el calendario? (descarta 2026-02-30) */
function fechaReal(texto) {
  if (!REGEX_FECHA.test(texto)) return false;
  const fecha = new Date(`${texto}T00:00:00Z`);
  return !Number.isNaN(fecha.getTime()) && fecha.toISOString().slice(0, 10) === texto;
}

/** "HH:MM" → minutos desde la medianoche. */
function minutos(hora) {
  const [h, m] = hora.split(':').map(Number);
  return h * 60 + m;
}

/** Revisa fecha y hora de inicio: obligatorias, reales y no pasadas. Agrega errores a "e". */
function revisarFechaHora(fecha, hora, e, campoHora) {
  const ahora = ahoraEnChile();
  if (!fecha) e.fecha = 'La fecha es obligatoria.';
  else if (!fechaReal(fecha)) e.fecha = 'La fecha no es válida.';
  else if (fecha < ahora.fecha) e.fecha = 'Esa fecha ya pasó.';
  if (!hora) e[campoHora] = 'La hora es obligatoria.';
  else if (!REGEX_HORA.test(hora)) e[campoHora] = 'Hora no válida (HH:MM).';
  else if (!e.fecha && fecha === ahora.fecha && hora <= ahora.hora) e[campoHora] = 'Esa hora ya pasó.';
}

/** PA-002 · Reserva: fecha, hora de inicio y hora de fin (posterior). */
function validarReserva(req, res, next) {
  const datos = {
    fecha: String(req.body.fecha || '').trim(),
    inicio: String(req.body.inicio || '').trim(),
    fin: String(req.body.fin || '').trim(),
  };
  const e = {};
  revisarFechaHora(datos.fecha, datos.inicio, e, 'inicio');
  if (!datos.fin) e.fin = 'La hora de fin es obligatoria.';
  else if (!REGEX_HORA.test(datos.fin)) e.fin = 'Hora no válida (HH:MM).';
  else if (!e.inicio && datos.fin <= datos.inicio) e.fin = 'La hora de fin debe ser posterior a la de inicio.';
  else if (!e.inicio) {
    const duracion = minutos(datos.fin) - minutos(datos.inicio);
    if (duracion < RESERVA.minimoMin) e.fin = `La reserva debe durar al menos ${RESERVA.minimoMin} minutos.`;
    if (duracion > RESERVA.maximoMin) e.fin = `La reserva puede durar como máximo ${RESERVA.maximoMin / 60} horas.`;
  }
  req.datosFormulario = datos;
  req.erroresCampo = e;
  next();
}

/** PA-001 · Programar partido: fecha, hora, modalidad y cancha. */
function validarProgramacion(req, res, next) {
  const datos = {
    fecha: String(req.body.fecha || '').trim(),
    hora: String(req.body.hora || '').trim(),
    idModalidad: idValido(req.body.id_modalidad),
    idCancha: idValido(req.body.id_cancha),
  };
  const e = {};
  revisarFechaHora(datos.fecha, datos.hora, e, 'hora');
  if (!datos.idModalidad) e.id_modalidad = 'Elige la modalidad.';
  if (!datos.idCancha) e.id_cancha = 'Elige la cancha.';
  req.datosFormulario = datos;
  req.erroresCampo = e;
  next();
}

/** PA-005 · Resultado: los dos marcadores, enteros entre 0 y MARCADOR_MAXIMO. */
function validarResultado(req, res, next) {
  const leer = (valor) => {
    const texto = String(valor ?? '').trim();
    const numero = Number(texto);
    return texto !== '' && Number.isInteger(numero) && numero >= 0 && numero <= MARCADOR_MAXIMO ? numero : null;
  };
  const datos = { desafiante: leer(req.body.marcador_desafiante), desafiado: leer(req.body.marcador_desafiado) };
  const e = {};
  if (datos.desafiante === null) e.marcador_desafiante = `Marcador obligatorio: entero entre 0 y ${MARCADOR_MAXIMO}.`;
  if (datos.desafiado === null) e.marcador_desafiado = `Marcador obligatorio: entero entre 0 y ${MARCADOR_MAXIMO}.`;
  req.datosFormulario = datos;
  req.erroresCampo = e;
  next();
}

module.exports = { validarReserva, validarProgramacion, validarResultado, ahoraEnChile, minutos };
