// middlewares/validators.js
// Validación de los formularios de registro y login.
// Acumula los errores en req.errores (un arreglo de strings) para que
// el controlador se los pase a la vista y se muestren en pantalla.

// Expresión regular sencilla para validar un email.
const REGEX_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// Longitud mínima de la contraseña.
const LONGITUD_MINIMA_PASSWORD = 8;

/**
 * Valida el formulario de REGISTRO.
 * Comprueba campos obligatorios, formato del email y longitud de la contraseña.
 */
function validarRegistro(req, res, next) {
  // El body llega como strings (o undefined si el campo no se envió).
  const nombre = (req.body.nombre || '').trim();
  const email = (req.body.email || '').trim();
  const password = req.body.password || '';

  const errores = [];

  if (!nombre) {
    errores.push('El nombre es obligatorio.');
  }

  if (!email) {
    errores.push('El email es obligatorio.');
  } else if (!REGEX_EMAIL.test(email)) {
    errores.push('El formato del email no es válido.');
  }

  if (!password) {
    errores.push('La contraseña es obligatoria.');
  } else if (password.length < LONGITUD_MINIMA_PASSWORD) {
    errores.push(`La contraseña debe tener al menos ${LONGITUD_MINIMA_PASSWORD} caracteres.`);
  }

  req.errores = errores;

  // Guardamos los valores ya limpios para poder re-renderizar el formulario
  // sin que el usuario pierda lo que había escrito (menos la contraseña).
  req.datosFormulario = { nombre, email };

  // Si hay errores, devolvemos al formulario con el listado de mensajes.
  if (errores.length > 0) {
    return res.status(400).render('registro', {
      titulo: 'Registro',
      errores,
      datos: req.datosFormulario,
      usuario: req.session.usuario || null,
      exito: null,
    });
  }

  return next();
}

/**
 * Valida el formulario de LOGIN (solo campos obligatorios y email con formato).
 */
function validarLogin(req, res, next) {
  const email = (req.body.email || '').trim();
  const password = req.body.password || '';

  const errores = [];

  if (!email) {
    errores.push('El email es obligatorio.');
  } else if (!REGEX_EMAIL.test(email)) {
    errores.push('El formato del email no es válido.');
  }

  if (!password) {
    errores.push('La contraseña es obligatoria.');
  }

  req.errores = errores;
  req.datosFormulario = { email };

  if (errores.length > 0) {
    return res.status(400).render('login', {
      titulo: 'Iniciar sesión',
      errores,
      datos: req.datosFormulario,
      usuario: req.session.usuario || null,
      exito: null,
      aviso: null,
    });
  }

  return next();
}

module.exports = { validarRegistro, validarLogin };
