// middlewares/validators.js
// Validación en el servidor de los formularios de registro y login.
// Si hay errores, re-renderiza la vista con los mensajes y los datos ya escritos
// (nunca las contraseñas). Si todo está bien, deja los datos limpios en
// req.datosFormulario para el controlador.

// Expresión regular sencilla para validar un correo.
const REGEX_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// Celular chileno: 9 + 8 dígitos, con o sin +56 delante.
const REGEX_CELULAR_CL = /^(?:\+?56)?(9\d{8})$/;

const { POSICIONES, NIVELES, ESTADISTICAS, STAT_RANGO } = require('../config/perfilJugador');
const { MODALIDADES } = require('../config/equipo');

const LONGITUD_MINIMA_PASSWORD = 8;
const LONGITUD_MAXIMA_NOMBRE = 100; // jugador.nombre_apodo / jugador.apellido
const LONGITUD_MAXIMA_APODO = 20; // jugador.apodo (lo que cabe en la carta)
const LONGITUD_MAXIMA_CORREO = 150; // usuario.correo / equipo.correo_contacto
const LONGITUD_MAXIMA_ZONA = 100; // equipo.zona
const LONGITUD_MAXIMA_MENSAJE_DESAFIO = 200; // lo que escribe el capitán en desafio.mensaje
const DIAS_MAXIMOS_DESAFIO = 365; // la fecha tentativa no puede estar a más de un año

// Rango de edad aceptado al registrarse (jugador.fecha_nacimiento).
const EDAD_MINIMA = 18;
const EDAD_MAXIMA = 100;

// Rangos aceptados en el perfil deportivo.
const ALTURA_CM = { min: 120, max: 230 };
const PESO_KG = { min: 35, max: 200 };

/**
 * Edad en años cumplidos a partir de una fecha "AAAA-MM-DD" (la que envía <input type="date">).
 * @returns {number|null} La edad, o null si la fecha no existe (ej: 2024-02-30) o tiene otro formato.
 */
function calcularEdad(valor) {
  const partes = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valor);
  if (!partes) return null;
  const [anio, mes, dia] = partes.slice(1).map(Number);

  // Date corrige fechas imposibles (30 de febrero → 1 de marzo): si cambió, no existe.
  const fecha = new Date(Date.UTC(anio, mes - 1, dia));
  if (fecha.getUTCFullYear() !== anio || fecha.getUTCMonth() !== mes - 1 || fecha.getUTCDate() !== dia) {
    return null;
  }

  const hoy = new Date();
  let edad = hoy.getFullYear() - anio;
  // Aún no cumple años este año
  if (hoy.getMonth() + 1 < mes || (hoy.getMonth() + 1 === mes && hoy.getDate() < dia)) edad -= 1;
  return edad;
}

/**
 * Valida la fecha de nacimiento (obligatoria, real y con edad entre EDAD_MINIMA y EDAD_MAXIMA).
 * @returns {string|null} El mensaje de error o null si es válida.
 */
function validarFechaNacimiento(fechaNacimiento) {
  const edad = calcularEdad(fechaNacimiento);
  if (!fechaNacimiento) return 'La fecha de nacimiento es obligatoria.';
  if (edad === null) return 'La fecha de nacimiento no es válida.';
  if (edad < 0) return 'La fecha de nacimiento no puede estar en el futuro.';
  if (edad < EDAD_MINIMA) return `Debes tener al menos ${EDAD_MINIMA} años para registrarte.`;
  if (edad > EDAD_MAXIMA) return 'Revisa la fecha de nacimiento: el año parece incorrecto.';
  return null;
}

/**
 * Convierte un número entero dentro de [min, max]; acepta coma decimal ("70,5" → 71).
 * @returns {number|null} El número redondeado, o null si no es válido o está fuera de rango.
 */
function enteroEnRango(valor, { min, max }) {
  const numero = Math.round(Number(String(valor || '').trim().replace(',', '.')));
  if (!String(valor || '').trim() || !Number.isFinite(numero) || numero < min || numero > max) return null;
  return numero;
}

/**
 * Normaliza un teléfono chileno a "+569XXXXXXXX".
 * Acepta espacios, guiones y paréntesis: "+56 9 1234 5678", "9 1234-5678"...
 * @returns {string|null} El número normalizado o null si no es válido.
 */
function normalizarTelefono(valor) {
  const limpio = String(valor || '').replace(/[\s\-().]/g, '');
  const coincidencia = limpio.match(REGEX_CELULAR_CL);
  return coincidencia ? `+56${coincidencia[1]}` : null;
}

/**
 * Valida el formulario de REGISTRO.
 */
function validarRegistro(req, res, next) {
  const nombre = (req.body.nombre || '').trim();
  const apellido = (req.body.apellido || '').trim();
  const correo = (req.body.correo || '').trim().toLowerCase();
  const telefonoIngresado = (req.body.telefono || '').trim();
  const fechaNacimiento = (req.body.fecha_nacimiento || '').trim();
  const password = req.body.password || '';
  const confirmarPassword = req.body.confirmar_password || '';

  const errores = [];

  if (!nombre) {
    errores.push('El nombre es obligatorio.');
  } else if (nombre.length > LONGITUD_MAXIMA_NOMBRE) {
    errores.push(`El nombre no puede superar los ${LONGITUD_MAXIMA_NOMBRE} caracteres.`);
  }

  if (!apellido) {
    errores.push('El apellido es obligatorio.');
  } else if (apellido.length > LONGITUD_MAXIMA_NOMBRE) {
    errores.push(`El apellido no puede superar los ${LONGITUD_MAXIMA_NOMBRE} caracteres.`);
  }

  if (!correo) {
    errores.push('El correo es obligatorio.');
  } else if (!REGEX_CORREO.test(correo) || correo.length > LONGITUD_MAXIMA_CORREO) {
    errores.push('El formato del correo no es válido.');
  }

  const telefono = normalizarTelefono(telefonoIngresado);
  if (!telefonoIngresado) {
    errores.push('El teléfono es obligatorio.');
  } else if (!telefono) {
    errores.push('El teléfono debe ser un celular chileno, por ejemplo +56 9 1234 5678.');
  }

  const errorFecha = validarFechaNacimiento(fechaNacimiento);
  if (errorFecha) errores.push(errorFecha);

  if (!password) {
    errores.push('La contraseña es obligatoria.');
  } else if (password.length < LONGITUD_MINIMA_PASSWORD) {
    errores.push(`La contraseña debe tener al menos ${LONGITUD_MINIMA_PASSWORD} caracteres.`);
  }

  if (password && confirmarPassword !== password) {
    errores.push('Las contraseñas no coinciden.');
  }

  // Valores para el controlador (teléfono ya normalizado) y para re-pintar el formulario.
  req.datosFormulario = { nombre, apellido, correo, telefono, fechaNacimiento };
  const datos = {
    nombre,
    apellido,
    correo,
    telefono: telefonoIngresado,
    fecha_nacimiento: fechaNacimiento,
  };

  if (errores.length > 0) {
    return res.status(400).render('registro', {
      pagina: 'auth',
      titulo: 'Crear cuenta',
      errores,
      datos,
    });
  }

  return next();
}

/**
 * Valida el formulario de LOGIN (campos obligatorios y formato del correo).
 */
function validarLogin(req, res, next) {
  const correo = (req.body.correo || '').trim().toLowerCase();
  const password = req.body.password || '';

  const errores = [];

  if (!correo) {
    errores.push('El correo es obligatorio.');
  } else if (!REGEX_CORREO.test(correo)) {
    errores.push('El formato del correo no es válido.');
  }

  if (!password) {
    errores.push('La contraseña es obligatoria.');
  }

  req.datosFormulario = { correo };

  if (errores.length > 0) {
    return res.status(400).render('login', {
      pagina: 'auth',
      titulo: 'Iniciar sesión',
      errores,
      datos: req.datosFormulario,
      aviso: null,
    });
  }

  return next();
}

/**
 * Limpia y valida los datos del perfil deportivo (los comparten el wizard y el editor).
 * Nombre y apellido no van aquí: se piden solo al crear la cuenta (validarRegistro).
 * @returns {{ datos: object, paso2: string[], paso3: string[] }}
 *          paso2 = errores de datos personales, paso3 = errores del perfil deportivo.
 */
function revisarDatosPerfil(body) {
  // Lo único que muestra la carta como nombre; espacios repetidos se juntan (va en una sola línea)
  const apodo = (body.apodo || '').trim().replace(/\s+/g, ' ');
  const fechaNacimiento = (body.fecha_nacimiento || '').trim();
  const altura = enteroEnRango(body.altura, ALTURA_CM);
  const peso = enteroEnRango(body.peso, PESO_KG);
  // Casillas "posicion": urlencoded entrega un texto (una marcada) o un arreglo (varias).
  const posicionesEnviadas = [].concat(body.posicion || []);
  // Orden del catálogo, sin repetidas: la primera es la principal (la que muestra la carta).
  const posiciones = Object.keys(POSICIONES).filter((clave) => posicionesEnviadas.includes(clave));

  const paso2 = [];
  const paso3 = [];

  if (!apodo) paso2.push('El apodo es obligatorio: es el nombre que aparece en tu carta.');
  else if (apodo.length > LONGITUD_MAXIMA_APODO) paso2.push(`El apodo no puede superar los ${LONGITUD_MAXIMA_APODO} caracteres.`);

  const errorFecha = validarFechaNacimiento(fechaNacimiento);
  if (errorFecha) paso2.push(errorFecha);

  if (altura === null) paso2.push(`La altura debe estar entre ${ALTURA_CM.min} y ${ALTURA_CM.max} cm.`);
  if (peso === null) paso2.push(`El peso debe estar entre ${PESO_KG.min} y ${PESO_KG.max} kg.`);

  if (posiciones.length === 0 || posiciones.length !== new Set(posicionesEnviadas).size) {
    paso3.push('Elige al menos una posición en la cancha.');
  }

  return { datos: { apodo, fechaNacimiento, altura, peso, posiciones }, paso2, paso3 };
}

/**
 * Valida el wizard de PERFIL DE JUGADOR (pasos 2 y 3).
 * No corta la petición: deja los datos limpios en req.datosFormulario y los
 * errores en req.erroresPerfil = { errores: [...], paso } (paso = el primero con error),
 * para que jugadorController vuelva a pintar el wizard en ese paso.
 */
function validarPerfilJugador(req, res, next) {
  const { datos, paso2, paso3 } = revisarDatosPerfil(req.body);
  req.datosFormulario = datos;
  req.erroresPerfil = {
    errores: [...paso2, ...paso3],
    paso: paso2.length > 0 ? 2 : 3,
  };
  return next();
}

/**
 * Valida el EDITOR DE PERFIL (/perfil/editar): los datos del wizard más las
 * 6 estadísticas (stat_ritmo, stat_tiro... entre STAT_RANGO.min y STAT_RANGO.max).
 * No corta la petición: deja req.datosFormulario (con .stats) y req.erroresPerfil = { errores }.
 * Las estadísticas inválidas quedan en null para que el editor re-pinte lo que había.
 */
function validarEdicionPerfil(req, res, next) {
  const { datos, paso2, paso3 } = revisarDatosPerfil(req.body);
  const erroresStats = [];
  const stats = {};

  ESTADISTICAS.forEach(({ clave, nombre }) => {
    stats[clave] = enteroEnRango(req.body[`stat_${clave}`], STAT_RANGO);
    if (stats[clave] === null) erroresStats.push(`${nombre} debe estar entre ${STAT_RANGO.min} y ${STAT_RANGO.max}.`);
  });

  req.datosFormulario = { ...datos, stats };
  req.erroresPerfil = { errores: [...paso2, ...paso3, ...erroresStats] };
  return next();
}

/**
 * Valida el wizard de CREAR EQUIPO (paso 1: nombre y correo; paso 2: nivel, zona y tipo de fútbol).
 * No corta la petición: deja los datos limpios en req.datosFormulario y los errores en
 * req.erroresEquipo = { errores: [...], paso } (paso = el primero con error),
 * para que equipoController vuelva a pintar el wizard en ese paso.
 */
function validarEquipo(req, res, next) {
  const nombre = (req.body.nombre_equipo || '').trim();
  const correo = (req.body.correo_contacto || '').trim().toLowerCase();
  const nivel = req.body.nivel || '';
  const zona = (req.body.zona || '').trim();
  const jugadores = Number(req.body.modalidad);

  const paso1 = [];
  const paso2 = [];

  if (!nombre) paso1.push('El nombre de la escuadra es obligatorio.');
  else if (nombre.length > LONGITUD_MAXIMA_NOMBRE) paso1.push(`El nombre no puede superar los ${LONGITUD_MAXIMA_NOMBRE} caracteres.`);

  if (!correo) paso1.push('El correo de contacto es obligatorio.');
  else if (!REGEX_CORREO.test(correo) || correo.length > LONGITUD_MAXIMA_CORREO) paso1.push('El formato del correo no es válido.');

  if (!NIVELES[nivel]) paso2.push('Elige el nivel de juego del equipo.');

  if (!zona) paso2.push('Escribe la zona habitual de juego.');
  else if (zona.length > LONGITUD_MAXIMA_ZONA) paso2.push(`La zona no puede superar los ${LONGITUD_MAXIMA_ZONA} caracteres.`);

  if (!MODALIDADES[jugadores]) paso2.push('Elige el tipo de fútbol.');

  req.datosFormulario = { nombre, correo, nivel, zona, jugadores: MODALIDADES[jugadores] ? jugadores : null };
  req.erroresEquipo = {
    errores: [...paso1, ...paso2],
    paso: paso1.length > 0 ? 1 : 2,
  };
  return next();
}

/** Fecha de hoy en Chile como AAAA-MM-DD (para comparar con el input type="date"). */
function hoyEnChile() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(new Date());
}

/**
 * Desafío a otro equipo (modal del panel): fecha y hora tentativas y mensaje, todo opcional.
 * Deja en req.datosDesafio.mensaje el texto para desafio.mensaje, por ejemplo
 * "Fecha tentativa: 25/10/2026 a las 20:00. ¿Jugamos en La Florida?" (o null),
 * y los errores en req.erroresDesafio.
 */
function validarDesafio(req, res, next) {
  const fecha = (req.body.fecha || '').trim();
  const hora = (req.body.hora || '').trim();
  const mensaje = (req.body.mensaje || '').trim();
  const errores = [];

  let textoFecha = '';
  if (fecha) {
    // Ida y vuelta: "2027-02-31" se convierte en 3 de marzo, así que no vuelve igual y se rechaza.
    const fechaDate = new Date(`${fecha}T00:00:00Z`);
    const valida = /^\d{4}-\d{2}-\d{2}$/.test(fecha) && !Number.isNaN(fechaDate.getTime())
      && fechaDate.toISOString().slice(0, 10) === fecha;
    const limite = new Date(Date.now() + DIAS_MAXIMOS_DESAFIO * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    if (!valida) errores.push('La fecha tentativa no es válida.');
    else if (fecha < hoyEnChile()) errores.push('La fecha tentativa no puede ser anterior a hoy.');
    else if (fecha > limite) errores.push('La fecha tentativa no puede estar a más de un año.');
    else {
      const [anio, mes, dia] = fecha.split('-');
      textoFecha = `Fecha tentativa: ${dia}/${mes}/${anio}`;
    }
  }
  if (hora) {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(hora)) errores.push('La hora tentativa no es válida.');
    else if (!fecha) errores.push('Elige también la fecha para la hora tentativa.');
    else if (textoFecha) textoFecha += ` a las ${hora}`;
  }
  if (mensaje.length > LONGITUD_MAXIMA_MENSAJE_DESAFIO) {
    errores.push(`El mensaje no puede superar los ${LONGITUD_MAXIMA_MENSAJE_DESAFIO} caracteres.`);
  }

  const partes = [textoFecha && `${textoFecha}.`, mensaje].filter(Boolean);
  req.datosDesafio = { mensaje: partes.length > 0 ? partes.join(' ') : null };
  req.erroresDesafio = errores;
  return next();
}

module.exports = {
  validarRegistro,
  validarLogin,
  validarPerfilJugador,
  validarEdicionPerfil,
  validarEquipo,
  validarDesafio,
  normalizarTelefono,
  calcularEdad,
  ALTURA_CM,
  PESO_KG,
};
