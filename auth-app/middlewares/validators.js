// middlewares/validators.js
// Validación en el servidor de los formularios de registro y login.
// Si hay errores, re-renderiza la vista con los mensajes y los datos ya escritos
// (nunca las contraseñas). Si todo está bien, deja los datos limpios en
// req.datosFormulario para el controlador.

// Expresión regular sencilla para validar un correo.
const REGEX_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// Celular chileno: 9 + 8 dígitos, con o sin +56 delante.
const REGEX_CELULAR_CL = /^(?:\+?56)?(9\d{8})$/;

const LONGITUD_MINIMA_PASSWORD = 8;
const LONGITUD_MAXIMA_NOMBRE = 100; // jugador.nombre_apodo / jugador.apellido
const LONGITUD_MAXIMA_CORREO = 150; // usuario.correo

// Rango de edad aceptado al registrarse (jugador.fecha_nacimiento).
const EDAD_MINIMA = 13;
const EDAD_MAXIMA = 100;

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

  const edad = calcularEdad(fechaNacimiento);
  if (!fechaNacimiento) {
    errores.push('La fecha de nacimiento es obligatoria.');
  } else if (edad === null) {
    errores.push('La fecha de nacimiento no es válida.');
  } else if (edad < 0) {
    errores.push('La fecha de nacimiento no puede estar en el futuro.');
  } else if (edad < EDAD_MINIMA) {
    errores.push(`Debes tener al menos ${EDAD_MINIMA} años para registrarte.`);
  } else if (edad > EDAD_MAXIMA) {
    errores.push('Revisa la fecha de nacimiento: el año parece incorrecto.');
  }

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
      titulo: 'Iniciar sesión',
      errores,
      datos: req.datosFormulario,
      aviso: null,
    });
  }

  return next();
}

module.exports = { validarRegistro, validarLogin, normalizarTelefono };
