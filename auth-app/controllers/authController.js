// controllers/authController.js
// Lógica de las acciones de autenticación: mostrar formularios,
// registrar, iniciar sesión y cerrar sesión.
// Solo llama a los middlewares de validación y al modelo userModel.

const bcrypt = require('bcrypt');
const userModel = require('../models/userModel');

// Número de rondas de hash de bcrypt.
const RONDAS_BCRYPT = 10;

// ---------------------------------------------------------------
// GET /registro → mostrar el formulario de registro
// ---------------------------------------------------------------
function mostrarRegistro(req, res) {
  res.render('registro', {
    titulo: 'Registro',
    errores: [],
    datos: {},          // valores previos del formulario (vacíos al abrir)
    usuario: req.session.usuario || null,
    exito: null,
  });
}

// ---------------------------------------------------------------
// POST /registro → guardar el usuario nuevo
// (la validación ya corrió en el middlewares/validators.js)
// ---------------------------------------------------------------
async function registrar(req, res, next) {
  try {
    const { nombre, email } = req.datosFormulario;
    const password = req.body.password;

    // Verificamos si el email ya existe para mostrar un mensaje claro.
    const existente = await userModel.findByEmail(email);
    if (existente) {
      return res.status(400).render('registro', {
        titulo: 'Registro',
        errores: ['Ese email ya está registrado. Inicia sesión o usa otro email.'],
        datos: { nombre, email },
        usuario: req.session.usuario || null,
        exito: null,
      });
    }

    // Ciframos la contraseña: nunca guardamos texto plano.
    const password_hash = await bcrypt.hash(password, RONDAS_BCRYPT);

    await userModel.create({ nombre, email, password_hash });

    // Registro exitoso → llevamos al usuario al login con un mensaje.
    return res.redirect('/login?msg=Registro_exitoso');
  } catch (err) {
    // 23505 = unique_violation en PostgreSQL: el email ya existía
    // (carrera entre la verificación anterior y el INSERT).
    if (err.code === '23505') {
      return res.status(400).render('registro', {
        titulo: 'Registro',
        errores: ['Ese email ya está registrado. Inicia sesión o usa otro email.'],
        datos: { nombre: req.body.nombre || '', email: req.body.email || '' },
        usuario: req.session.usuario || null,
        exito: null,
      });
    }
    // Cualquier otro error lo pasamos al middleware de errores.
    return next(err);
  }
}

// ---------------------------------------------------------------
// GET /login → mostrar el formulario de login
// ---------------------------------------------------------------
function mostrarLogin(req, res) {
  // Mensaje opcional que llega por query string (ej: ?msg=Registro_exitoso).
  const mensajes = {
    Registro_exitoso: 'Tu cuenta se creó correctamente. Ahora inicia sesión.',
    Debes_iniciar_sesion: 'Debes iniciar sesión para acceder a esa página.',
    Sesión_cerrada: 'Cerraste sesión correctamente.',
  };
  const aviso = mensajes[req.query.msg] || null;

  res.render('login', {
    titulo: 'Iniciar sesión',
    errores: [],
    datos: {},
    usuario: req.session.usuario || null,
    exito: null,
    aviso,
  });
}

// ---------------------------------------------------------------
// POST /login → validar credenciales y crear la sesión
// (la validación de formato ya corrió en el middleware)
// ---------------------------------------------------------------
async function iniciarSesion(req, res, next) {
  try {
    const { email } = req.datosFormulario;
    const password = req.body.password;

    // 1) Buscamos el usuario por email.
    const usuario = await userModel.findByEmail(email);

    // 2) Si no existe, o la contraseña no coincide → mismo mensaje
    //    (para no revelar si el email está registrado o no).
    const passwordValida = usuario
      ? await bcrypt.compare(password, usuario.password_hash)
      : false;

    if (!passwordValida) {
      return res.status(401).render('login', {
        titulo: 'Iniciar sesión',
        errores: ['Email o contraseña incorrectos.'],
        datos: { email },
        usuario: req.session.usuario || null,
        exito: null,
        aviso: null,
      });
    }

    // 3) Credenciales correctas → guardamos al usuario en la sesión.
    //    express-session se encarga de firmar y enviar la cookie.
    req.session.usuario = {
      id: usuario.id,
      nombre: usuario.nombre,
      email: usuario.email,
    };

    // 4) Redirigimos al dashboard protegido.
    return res.redirect('/dashboard');
  } catch (err) {
    return next(err);
  }
}

// ---------------------------------------------------------------
// POST /logout → destruir la sesión
// ---------------------------------------------------------------
function cerrarSesion(req, res, next) {
  // Destruye la sesión en el servidor y limpia la cookie.
  req.session.destroy((err) => {
    if (err) {
      return next(err);
    }
    return res.redirect('/login?msg=Sesión_cerrada');
  });
}

module.exports = {
  mostrarRegistro,
  registrar,
  mostrarLogin,
  iniciarSesion,
  cerrarSesion,
};
