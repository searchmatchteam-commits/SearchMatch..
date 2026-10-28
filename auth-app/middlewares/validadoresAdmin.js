const { DIAS_SEMANA, LIMITES_CHILE, PRECIO_HORA } = require('../config/canchas');

const LARGO = { nombreRecinto: 150, calle: 150, numero: 20, referencias: 255, nombreCancha: 100, catalogo: 50 };
const REGEX_HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

function texto(valor) {
  return String(valor || '').trim().replace(/\s+/g, ' ');
}

/** 'AAAA-MM-DD' que existe en el calendario (rechaza 2026-02-30). */
function fechaValida(valor) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false;
  const fecha = new Date(`${valor}T00:00:00Z`);
  return !Number.isNaN(fecha.getTime()) && fecha.toISOString().slice(0, 10) === valor;
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

// SA-2 / SA-3 · Torneos. El formulario llega como multipart (multer, ver subirImagenesTorneo):
// la foto en "foto" y cada patrocinador nuevo en patrocinador_nombre_N + patrocinador_logo_N.
// La cancha llega del buscador como "Recinto · Cancha (Comuna) [#123]": se toma el número final;
// el controlador revisa que exista y sea de la modalidad del torneo.
const multer = require('multer');
const { detectarTipoImagen } = require('../controllers/jugadorController');
const { MAX_PATROCINADORES, errorCantidad } = require('../config/torneos');

const MAX_IMAGEN = 2 * 1024 * 1024;
const recibirArchivos = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMAGEN, files: MAX_PATROCINADORES + 1, fields: 60 },
}).any();

/** Lee el multipart; si un archivo pesa demasiado no corta la petición: lo deja en req.errorSubida. */
function subirImagenesTorneo(req, res, next) {
  recibirArchivos(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      req.errorSubida = err.code === 'LIMIT_FILE_SIZE' ? 'Cada imagen puede pesar como máximo 2 MB.' : 'No se pudieron leer las imágenes.';
      req.body = req.body || {};
      req.files = [];
      return next();
    }
    return next(err);
  });
}

function imagenDe(archivo) {
  if (!archivo || archivo.size === 0) return { vacia: true };
  const tipo = detectarTipoImagen(archivo.buffer);
  return tipo ? { datos: archivo.buffer, tipo } : { invalida: true };
}

function validarTorneo(req, res, next) {
  const b = req.body || {};
  const archivos = new Map((req.files || []).map((f) => [f.fieldname, f]));
  const canchaTexto = texto(b.cancha);
  const idCancha = canchaTexto.match(/\[#(\d+)\]$/);
  const cantidad = Number(b.cantidad_equipos);
  const datos = {
    nombre: texto(b.nombre),
    formato: ['liga', 'relampago'].includes(b.formato) ? b.formato : null,
    emparejamiento: ['llegada', 'sorteo'].includes(b.emparejamiento) ? b.emparejamiento : null,
    idModalidad: idValido(b.id_modalidad),
    cantidadIngresada: String(b.cantidad_equipos || '').trim(),
    cantidadEquipos: Number.isInteger(cantidad) ? cantidad : null,
    canchaTexto,
    idCancha: idCancha ? idValido(idCancha[1]) : null,
    tienePatrocinadores: b.tiene_patrocinadores === 'si',
    premios: texto(b.premios),
    // SA-5: fecha y hora de inicio opcionales (vacías = "Por confirmar")
    fechaInicio: texto(b.fecha_inicio) || null,
    horaInicio: texto(b.hora_inicio) || null,
    patrocinadoresNuevos: [],
    // ids de patrocinadores ya guardados que se marcaron para quitar (solo al editar)
    quitarPatrocinadores: Object.keys(b).filter((k) => /^quitar_patrocinador_\d+$/.test(k) && b[k] === 'si')
      .map((k) => Number(k.split('_').pop())),
  };
  const e = {};
  if (req.errorSubida) e.foto = req.errorSubida;
  if (!datos.nombre) e.nombre = 'El nombre del torneo es obligatorio.';
  else if (datos.nombre.length > 100) e.nombre = 'Máximo 100 caracteres.';
  if (!datos.formato) e.formato = 'Elige si es una liga o un torneo relámpago.';
  if (!datos.emparejamiento) e.emparejamiento = 'Elige cómo se arman los cruces.';
  if (datos.fechaInicio && !fechaValida(datos.fechaInicio)) e.fecha_inicio = 'La fecha no es válida.';
  if (datos.horaInicio && !REGEX_HORA.test(datos.horaInicio)) e.hora_inicio = 'La hora no es válida (HH:MM).';
  else if (datos.horaInicio && !datos.fechaInicio) e.hora_inicio = 'Para indicar la hora, primero elige la fecha.';
  if (!datos.idModalidad) e.id_modalidad = 'Elige la modalidad.';
  if (!datos.cantidadIngresada) e.cantidad_equipos = 'Indica cuántos equipos participan.';
  else if (!datos.cantidadEquipos) e.cantidad_equipos = 'Debe ser un número entero.';
  else if (datos.formato) e.cantidad_equipos = errorCantidad(datos.formato, datos.cantidadEquipos) || undefined;
  if (!e.cantidad_equipos) delete e.cantidad_equipos;
  if (!datos.canchaTexto) e.cancha = 'Elige la cancha donde se jugará.';
  else if (!datos.idCancha) e.cancha = 'Elige una cancha de la lista de sugerencias.';
  if (datos.premios.length > 500) e.premios = 'Máximo 500 caracteres.';

  const foto = imagenDe(archivos.get('foto'));
  if (foto.invalida) e.foto = 'La foto debe ser una imagen JPG, PNG o WebP.';
  datos.foto = foto.datos ? foto : null; // el controlador exige foto al crear

  if (datos.tienePatrocinadores) {
    for (let i = 0; i < MAX_PATROCINADORES; i += 1) {
      const nombre = texto(b[`patrocinador_nombre_${i}`]);
      const logo = imagenDe(archivos.get(`patrocinador_logo_${i}`));
      if (!nombre && logo.vacia) continue;
      if (!nombre) e[`patrocinador_${i}`] = 'Escribe el nombre del patrocinador.';
      else if (nombre.length > 100) e[`patrocinador_${i}`] = 'Máximo 100 caracteres.';
      else if (logo.vacia) e[`patrocinador_${i}`] = `Sube el logo de ${nombre}.`;
      else if (logo.invalida) e[`patrocinador_${i}`] = 'El logo debe ser una imagen JPG, PNG o WebP.';
      else datos.patrocinadoresNuevos.push({ nombre, logo });
    }
  }
  req.datosFormulario = datos;
  req.erroresCampo = e;
  next();
}

// AP-000: toda acción del panel que afecta a un usuario exige un motivo (se guarda en el registro y se le notifica).
const { MOTIVO } = require('../config/panel');

/** Motivo limpio o null si no cumple el largo. */
function leerMotivo(valor) {
  const motivo = texto(valor);
  return motivo.length >= MOTIVO.min && motivo.length <= MOTIVO.max ? motivo : null;
}

const MSG_MOTIVO = `Indica el motivo (entre ${MOTIVO.min} y ${MOTIVO.max} caracteres).`;

module.exports = { leerMotivo, MSG_MOTIVO, validarRecinto, validarCancha, validarBloque, validarCatalogo, validarTorneo, subirImagenesTorneo, idValido };
