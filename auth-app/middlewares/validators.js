const REGEX_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const REGEX_CELULAR_CL = /^(?:\+?56)?(9\d{8})$/;

const { POSICIONES, NIVELES, ESTADISTICAS, STAT_RANGO } = require('../config/perfilJugador');
const { MODALIDADES } = require('../config/equipo');

const LONGITUD_MINIMA_PASSWORD = 8;
const LONGITUD_MAXIMA_NOMBRE = 100;
const LONGITUD_MAXIMA_APODO = 20;
const LONGITUD_MAXIMA_CORREO = 150;
const LONGITUD_MAXIMA_ZONA = 100;
const LONGITUD_MAXIMA_MENSAJE_DESAFIO = 200;
const LONGITUD_MAXIMA_MENSAJE_SOLICITUD = 200;
const DIAS_MAXIMOS_DESAFIO = 365;

const EDAD_MINIMA = 18;
const EDAD_MAXIMA = 100;

const ALTURA_CM = { min: 120, max: 230 };
const PESO_KG = { min: 35, max: 200 };

function calcularEdad(valor) {
  const partes = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valor);
  if (!partes) return null;
  const [anio, mes, dia] = partes.slice(1).map(Number);

  const fecha = new Date(Date.UTC(anio, mes - 1, dia));
  if (fecha.getUTCFullYear() !== anio || fecha.getUTCMonth() !== mes - 1 || fecha.getUTCDate() !== dia) {
    return null;
  }

  const hoy = new Date();
  let edad = hoy.getFullYear() - anio;
  if (hoy.getMonth() + 1 < mes || (hoy.getMonth() + 1 === mes && hoy.getDate() < dia)) edad -= 1;
  return edad;
}

function validarFechaNacimiento(fechaNacimiento) {
  const edad = calcularEdad(fechaNacimiento);
  if (!fechaNacimiento) return 'La fecha de nacimiento es obligatoria.';
  if (edad === null) return 'La fecha de nacimiento no es válida.';
  if (edad < 0) return 'La fecha de nacimiento no puede estar en el futuro.';
  if (edad < EDAD_MINIMA) return `Debes tener al menos ${EDAD_MINIMA} años para registrarte.`;
  if (edad > EDAD_MAXIMA) return 'Revisa la fecha de nacimiento: el año parece incorrecto.';
  return null;
}

function enteroEnRango(valor, { min, max }) {
  const numero = Math.round(Number(String(valor || '').trim().replace(',', '.')));
  if (!String(valor || '').trim() || !Number.isFinite(numero) || numero < min || numero > max) return null;
  return numero;
}

function normalizarTelefono(valor) {
  const limpio = String(valor || '').replace(/[\s\-().]/g, '');
  const coincidencia = limpio.match(REGEX_CELULAR_CL);
  return coincidencia ? `+56${coincidencia[1]}` : null;
}

function errorPasswordSegura(password) {
  if (!password) return 'La contraseña es obligatoria.';
  if (password.length < LONGITUD_MINIMA_PASSWORD) return `La contraseña debe tener al menos ${LONGITUD_MINIMA_PASSWORD} caracteres.`;
  if (!/[A-Za-zÁÉÍÓÚÑáéíóúñ]/.test(password) || !/\d/.test(password)) {
    return 'La contraseña debe combinar letras y números.';
  }
  return null;
}

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

  const errorPassword = errorPasswordSegura(password);
  if (errorPassword) errores.push(errorPassword);

  if (password && confirmarPassword !== password) {
    errores.push('Las contraseñas no coinciden.');
  }

  const aceptoTerminos = req.body.acepto_terminos === 'si';
  if (!aceptoTerminos) errores.push('Debes aceptar los términos y condiciones y la política de privacidad.');

  req.datosFormulario = { nombre, apellido, correo, telefono, fechaNacimiento };
  const datos = {
    nombre,
    apellido,
    correo,
    telefono: telefonoIngresado,
    fecha_nacimiento: fechaNacimiento,
    acepto_terminos: aceptoTerminos,
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

function revisarDatosPerfil(body) {
  const apodo = (body.apodo || '').trim().replace(/\s+/g, ' ');
  const fechaNacimiento = (body.fecha_nacimiento || '').trim();
  const altura = enteroEnRango(body.altura, ALTURA_CM);
  const peso = enteroEnRango(body.peso, PESO_KG);
  const posicionesEnviadas = [].concat(body.posicion || []);
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

function validarPerfilJugador(req, res, next) {
  const { datos, paso2, paso3 } = revisarDatosPerfil(req.body);
  req.datosFormulario = datos;
  req.erroresPerfil = {
    errores: [...paso2, ...paso3],
    paso: paso2.length > 0 ? 2 : 3,
  };
  return next();
}

function validarEdicionPerfil(req, res, next) {
  const { datos, paso2, paso3 } = revisarDatosPerfil(req.body);
  req.datosFormulario = datos;
  req.erroresPerfil = { errores: [...paso2, ...paso3] };
  return next();
}

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

  const idComuna = Number(req.body.id_comuna);
  const comunaValida = Number.isInteger(idComuna) && idComuna > 0;
  if (!comunaValida) paso2.push('Elige la región y la comuna de tu equipo.');

  req.datosFormulario = {
    nombre, correo, nivel, zona, jugadores: MODALIDADES[jugadores] ? jugadores : null,
    idComuna: comunaValida ? idComuna : null,
    idRegion: Number(req.body.id_region) || null,
  };
  req.erroresEquipo = {
    errores: [...paso1, ...paso2],
    paso: paso1.length > 0 ? 1 : 2,
  };
  return next();
}

function hoyEnChile() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(new Date());
}

function validarDesafio(req, res, next) {
  const fecha = (req.body.fecha || '').trim();
  const hora = (req.body.hora || '').trim();
  const mensaje = (req.body.mensaje || '').trim();
  const errores = [];

  let textoFecha = '';
  if (fecha) {
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

function validarSolicitudUnion(req, res, next) {
  const mensaje = (req.body.mensaje || '').replace(/\s+/g, ' ').trim();
  const errores = [];
  if (mensaje.length > LONGITUD_MAXIMA_MENSAJE_SOLICITUD) {
    errores.push(`El mensaje no puede superar los ${LONGITUD_MAXIMA_MENSAJE_SOLICITUD} caracteres.`);
  }
  req.datosSolicitud = { mensaje: mensaje || null };
  req.erroresSolicitud = errores;
  return next();
}

module.exports = {
  validarRegistro,
  validarLogin,
  validarPerfilJugador,
  validarEdicionPerfil,
  validarEquipo,
  validarDesafio,
  validarSolicitudUnion,
  errorPasswordSegura,
  REGEX_CORREO,
  LONGITUD_MAXIMA_MENSAJE_SOLICITUD,
  normalizarTelefono,
  calcularEdad,
  ALTURA_CM,
  PESO_KG,
};
