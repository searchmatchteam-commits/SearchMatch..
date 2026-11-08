const userModel = require('../models/userModel');
const { rutaDeInicio } = require('../middlewares/authMiddleware');
const cuentaModel = require('../models/cuentaModel');
const { TERMINOS, PRIVACIDAD } = require('../config/legal');
const { proveedorHabilitado } = require('../config/supabase');
const { validarFechaNacimiento, ALTURA_CM, PESO_KG } = require('../middlewares/validators');
const { POSICIONES } = require('../config/perfilJugador');

const MSG_CORREO_REGISTRADO = 'Este correo ya está registrado. Inicia sesión o usa otro correo.';
const MSG_CUENTA_DESACTIVADA = 'Tu cuenta está desactivada. Si crees que es un error, escríbenos.';

const ERRORES_SUPABASE = {
  invalid_credentials: 'Correo o contraseña incorrectos.',
  email_not_confirmed: 'Confirma tu correo antes de iniciar sesión. Revisa tu bandeja de entrada.',
  user_already_exists: MSG_CORREO_REGISTRADO,
  email_exists: MSG_CORREO_REGISTRADO,
  weak_password: 'La contraseña es muy débil. Usa al menos 8 caracteres combinando letras y números.',
  email_address_invalid: 'El correo no es válido.',
  signup_disabled: 'El registro de cuentas está deshabilitado por ahora.',
  over_email_send_rate_limit: 'Se enviaron demasiados correos. Espera unos minutos e inténtalo de nuevo.',
  over_request_rate_limit: 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.',
  user_banned: 'Esta cuenta está suspendida.',
};

function traducirErrorSupabase(error) {
  if (error.code && ERRORES_SUPABASE[error.code]) {
    return ERRORES_SUPABASE[error.code];
  }
  const texto = (error.message || '').toLowerCase();
  if (texto.includes('invalid login credentials')) return ERRORES_SUPABASE.invalid_credentials;
  if (texto.includes('email not confirmed')) return ERRORES_SUPABASE.email_not_confirmed;
  if (texto.includes('already registered')) return MSG_CORREO_REGISTRADO;
  if (texto.includes('rate limit')) return ERRORES_SUPABASE.over_request_rate_limit;
  if (texto.includes('password')) return ERRORES_SUPABASE.weak_password;

  console.error('⚠️  Error de Supabase sin traducción:', {
    code: error.code || '(sin código)',
    status: error.status,
    name: error.name,
    message: error.message,
  });
  if (texto.includes('api key')) {
    console.error(
      '   Pista: revisa SUPABASE_URL y SUPABASE_PUBLISHABLE_KEY (o SUPABASE_ANON_KEY) en .env ' +
        'y REINICIA el servidor: el .env solo se lee al arrancar.'
    );
  }
  return 'No pudimos completar la operación. Inténtalo de nuevo en unos minutos.';
}

function renderRegistroConError(req, res, status, mensaje) {
  return res.status(status).render('registro', {
    pagina: 'auth',
    titulo: 'Crear cuenta',
    errores: [mensaje],
    datos: {
      nombre: req.datosFormulario.nombre,
      apellido: req.datosFormulario.apellido,
      correo: req.datosFormulario.correo,
      correo_secundario: req.datosFormulario.correoSecundario || '',
      telefono: req.body.telefono || '',
      fecha_nacimiento: req.datosFormulario.fechaNacimiento,
      acepto_terminos: req.body.acepto_terminos === 'si',
    },
  });
}

function mostrarRegistro(req, res) {
  res.render('registro', {
    pagina: 'auth',
    titulo: 'Crear cuenta',
    errores: [],
    datos: {},
    aviso: req.query.msg === 'Google_sin_cuenta'
      ? 'Aún no tienes una cuenta en SearchMatch. Créala aquí y después podrás entrar con Google usando el mismo correo.'
      : null,
  });
}

async function registrar(req, res, next) {
  const { nombre, apellido, correo, correoSecundario, telefono, fechaNacimiento } = req.datosFormulario;
  const password = req.body.password;

  try {
    if (await userModel.findByEmail(correo)) {
      return renderRegistroConError(req, res, 400, MSG_CORREO_REGISTRADO);
    }

    const appUrl = process.env.APP_URL || `http://localhost:${process.env.PORT || 3000}`;
    const { data, error } = await userModel.registrarEnAuth(req.supabase, {
      correo,
      password,
      nombre,
      apellido,
      telefono,
      urlRedireccion: `${appUrl}/auth/confirmar`,
    });

    if (error) {
      return renderRegistroConError(req, res, 400, traducirErrorSupabase(error));
    }

    if (!data.user || (data.user.identities && data.user.identities.length === 0)) {
      return renderRegistroConError(req, res, 400, MSG_CORREO_REGISTRADO);
    }

    try {
      await userModel.create({
        authId: data.user.id,
        nombre,
        apellido,
        correo,
        correoSecundario,
        telefono,
        fechaNacimiento,
      });
    } catch (err) {
      if (data.session) {
        await userModel.cerrarSesionEnAuth(req.supabase).catch(() => {});
      }
      const eliminada = await userModel.eliminarDeAuth(data.user.id);
      if (!eliminada) {
        console.error(`⚠️  Cuenta de Auth ${data.user.id} quedó sin perfil (falta SUPABASE_SERVICE_ROLE_KEY para deshacerla).`);
      }
      if (err.code === '23505') {
        return renderRegistroConError(req, res, 400, MSG_CORREO_REGISTRADO);
      }
      throw err;
    }

    await cuentaModel.guardarAceptacion(data.user.id, { terminos: TERMINOS.version, privacidad: PRIVACIDAD.version })
      .catch((err) => console.error('⚠️  No se pudo guardar la aceptación de términos:', err.message));

    if (data.session) {
      return res.redirect('/select-role');
    }

    return res.redirect('/login?msg=Confirma_tu_correo');
  } catch (err) {
    return next(err);
  }
}

function mostrarLogin(req, res) {
  const mensajes = {
    Confirma_tu_correo: 'Te enviamos un correo de confirmación. Ábrelo y luego inicia sesión.',
    Enlace_invalido: 'El enlace de verificación venció o ya se usó. Escribe tu correo y te enviaremos uno nuevo.',
    Debes_iniciar_sesion: 'Debes iniciar sesión para acceder a esa página.',
    Sesion_cerrada: 'Cerraste sesión correctamente.',
    Cuenta_desactivada: MSG_CUENTA_DESACTIVADA,
    Cuenta_eliminada: 'Tu cuenta y todos sus datos se eliminaron. Gracias por haber jugado en SearchMatch.',
    Contrasena_actualizada: 'Tu contraseña se actualizó. Inicia sesión con la nueva.',
    Google_cancelado: 'Cancelaste el acceso con Google. Puedes intentarlo de nuevo cuando quieras.',
    Google_no_configurado: 'El inicio de sesión con Google no está configurado aún. Por favor, usa correo y contraseña.',
    Google_error: 'No pudimos iniciar sesión con Google. Inténtalo de nuevo o entra con tu correo.',
  };

  res.render('login', {
    pagina: 'auth',
    titulo: 'Iniciar sesión',
    errores: [],
    datos: {},
    aviso: mensajes[req.query.msg] || null,
    // El acceso con Google falló: se muestra como error (cancelar es decisión del usuario: aviso normal)
    avisoError: /^Google_/.test(req.query.msg || '') && req.query.msg !== 'Google_cancelado',
    mostrarReenvio: req.query.msg === 'Enlace_invalido', // AR-007
  });
}

// AR-007: mismo mensaje exista o no la cuenta (no revela qué correos están registrados).
const MSG_VERIFICACION_REENVIADA = 'Si ese correo tiene una cuenta pendiente de verificación, te enviamos un enlace nuevo. '
  + 'Revisa tu bandeja de entrada y la carpeta de spam.';

// ---------------------------------------------------------------
// POST /verificacion/reenviar → nuevo enlace de verificación, sin sesión (AR-007)
// ---------------------------------------------------------------
async function reenviarVerificacion(req, res, next) {
  const { correo } = req.datosFormulario;
  const renderLogin = (status, extra) => res.status(status).render('login', {
    pagina: 'auth', titulo: 'Iniciar sesión', errores: [], datos: {}, aviso: null, ...extra,
  });
  if (req.erroresCampo.correo) {
    return renderLogin(400, { mostrarReenvio: true, correoReenvio: correo, errorReenvio: req.erroresCampo.correo });
  }
  try {
    if (await userModel.findByEmail(correo)) {
      const appUrl = process.env.APP_URL || `http://localhost:${process.env.PORT || 3000}`;
      const { error } = await userModel.reenviarVerificacionEnAuth(req.supabase, correo, `${appUrl}/auth/confirmar`);
      if (error) console.error('⚠️  No se pudo reenviar la verificación:', error.code, error.message);
    }
    return renderLogin(200, { aviso: MSG_VERIFICACION_REENVIADA });
  } catch (err) {
    return next(err);
  }
}

async function confirmarCorreo(req, res, next) {
  const { code, token_hash: tokenHash, type } = req.query;

  if (!code && !(tokenHash && type)) {
    return res.redirect('/login?msg=Enlace_invalido');
  }

  try {
    const { data, error } = await userModel.confirmarCorreoEnAuth(req.supabase, { code, tokenHash, type });
    if (error) {
      console.error('⚠️  No se pudo confirmar el correo:', error.code, error.message);
      return res.redirect('/login?msg=Enlace_invalido');
    }
    const meta = (data.user && data.user.user_metadata) || {};
    return res.redirect(rutaDeInicio(meta.rol_inicio));
  } catch (err) {
    return next(err);
  }
}

async function iniciarSesion(req, res, next) {
  const { correo } = req.datosFormulario;

  try {
    const { data, error } = await userModel.iniciarSesionEnAuth(req.supabase, {
      correo,
      password: req.body.password,
    });

    if (error) {
      const status = error.code === 'invalid_credentials' ? 401 : 400;
      return res.status(status).render('login', {
        pagina: 'auth',
        titulo: 'Iniciar sesión',
        errores: [traducirErrorSupabase(error)],
        datos: { correo },
        aviso: null,
      });
    }

    const perfil = await userModel.findByAuthId(data.user.id);
    if (perfil && perfil.activo === false) {
      await userModel.cerrarSesionEnAuth(req.supabase).catch(() => {});
      return res.status(403).render('login', {
        pagina: 'auth',
        titulo: 'Iniciar sesión',
        errores: [MSG_CUENTA_DESACTIVADA],
        datos: { correo },
        aviso: null,
      });
    }

    // AP-001: las cuentas del panel solo entran por /admin/login; aquí valen lo mismo que unas credenciales malas.
    if (perfil && /^(super)?administrador$/i.test(perfil.rol || '')) {
      await userModel.cerrarSesionEnAuth(req.supabase).catch(() => {});
      return res.status(401).render('login', {
        pagina: 'auth',
        titulo: 'Iniciar sesión',
        errores: [ERRORES_SUPABASE.invalid_credentials],
        datos: { correo },
        aviso: null,
      });
    }

    return res.redirect(rutaDeInicio(data.user.user_metadata && data.user.user_metadata.rol_inicio));
  } catch (err) {
    return next(err);
  }
}

// ---------------------------------------------------------------
// GET /auth/google → manda a la pantalla de Google (Supabase OAuth)
// ---------------------------------------------------------------
async function iniciarConGoogle(req, res, next) {
  try {
    if (!(await proveedorHabilitado('google'))) {
      console.error('⚠️  Google no está habilitado en Supabase (Authentication → Sign In / Providers → Google).');
      return res.redirect('/login?msg=Google_no_configurado');
    }
    const appUrl = process.env.APP_URL || `http://localhost:${process.env.PORT || 3000}`;
    // El verificador PKCE es una cookie de este host: si se entró por otro (p. ej. 127.0.0.1 en vez
    // de localhost), se reinicia desde APP_URL para que la cookie llegue a /auth/callback.
    if (req.get('host') !== new URL(appUrl).host) return res.redirect(`${appUrl}/auth/google`);
    const { data, error } = await userModel.urlInicioConGoogle(req.supabase, `${appUrl}/auth/callback`);
    if (error || !data.url) {
      if (error) console.error('⚠️  No se pudo iniciar el acceso con Google:', error.code, error.message);
      return res.redirect('/login?msg=Google_error');
    }
    return res.redirect(data.url);
  } catch (err) {
    return next(err);
  }
}

// ---------------------------------------------------------------
// GET /auth/callback → Google vuelve aquí con ?code: se crea la sesión si el correo ya
// tiene cuenta en SearchMatch; si no, se manda a /registro.
// ---------------------------------------------------------------
async function callbackGoogle(req, res, next) {
  const { code, error: errorOAuth } = req.query;
  if (errorOAuth || !code) {
    return res.redirect(errorOAuth === 'access_denied' ? '/login?msg=Google_cancelado' : '/login?msg=Google_error');
  }

  try {
    const { data, error } = await userModel.canjearCodigoOAuth(req.supabase, code);
    if (error || !data.user) {
      if (error) console.error('⚠️  No se pudo completar el acceso con Google:', error.code, error.message);
      return res.redirect('/login?msg=Google_error');
    }

    const usuarioAuth = data.user;
    const perfil = await userModel.findByAuthId(usuarioAuth.id);

    if (perfil && perfil.activo === false) {
      await userModel.cerrarSesionEnAuth(req.supabase).catch(() => {});
      return res.redirect('/login?msg=Cuenta_desactivada');
    }

    // AP-001: las cuentas del panel solo entran por /admin/login.
    if (perfil && /^(super)?administrador$/i.test(perfil.rol || '')) {
      await userModel.cerrarSesionEnAuth(req.supabase).catch(() => {});
      return res.redirect('/login?msg=Google_error');
    }

    // Sin cuenta en SearchMatch: Google no crea cuentas, se manda a registrarse.
    if (!perfil) {
      await userModel.cerrarSesionEnAuth(req.supabase).catch(() => {});
      // Supabase acaba de crear el usuario de Auth al volver de Google: se borra para que el
      // correo quede libre en /registro (solo si es exclusivamente de Google).
      const proveedores = (usuarioAuth.app_metadata && usuarioAuth.app_metadata.providers) || [];
      if (proveedores.length === 1 && proveedores[0] === 'google' && !(await userModel.eliminarDeAuth(usuarioAuth.id))) {
        console.error(`⚠️  No se pudo borrar la cuenta de Auth ${usuarioAuth.id} creada por Google sin perfil.`);
      }
      return res.redirect('/registro?msg=Google_sin_cuenta');
    }

    // Cuenta antigua creada con Google sin estos datos: se completan antes de seguir.
    if (!perfil.fecha_nacimiento) return res.redirect('/completar-perfil');

    return res.redirect(rutaDeInicio(usuarioAuth.user_metadata && usuarioAuth.user_metadata.rol_inicio));
  } catch (err) {
    return next(err);
  }
}

// ---------------------------------------------------------------
// GET/POST /completar-perfil → onboarding tras el primer acceso con Google
// ---------------------------------------------------------------
function renderCompletarPerfil(res, { status = 200, errores = [], datos = {} } = {}) {
  return res.status(status).render('completar-perfil', {
    titulo: 'Completa tu carta',
    pagina: 'equipo',
    errores,
    datos,
    posiciones: POSICIONES,
    rangos: { ALTURA_CM, PESO_KG },
  });
}

function mostrarCompletarPerfil(req, res) {
  if (!req.usuario.faltaEdad) return res.redirect('/dashboard');
  return renderCompletarPerfil(res);
}

async function guardarCompletarPerfil(req, res, next) {
  const datos = {
    fecha_nacimiento: (req.body.fecha_nacimiento || '').trim(),
    altura: (req.body.altura || '').trim(),
    peso: (req.body.peso || '').trim(),
    posicion: req.body.posicion || '',
  };
  const altura = Number(datos.altura);
  const peso = Number(datos.peso);

  const errores = [];
  const errorFecha = validarFechaNacimiento(datos.fecha_nacimiento);
  if (errorFecha) errores.push(errorFecha);
  if (!(altura >= ALTURA_CM.min && altura <= ALTURA_CM.max)) {
    errores.push(`La altura debe estar entre ${ALTURA_CM.min} y ${ALTURA_CM.max} cm.`);
  }
  if (!(peso >= PESO_KG.min && peso <= PESO_KG.max)) {
    errores.push(`El peso debe estar entre ${PESO_KG.min} y ${PESO_KG.max} kg.`);
  }
  if (!Object.hasOwn(POSICIONES, datos.posicion)) errores.push('Elige tu posición.');
  if (errores.length) return renderCompletarPerfil(res, { status: 400, errores, datos });

  try {
    await userModel.completarPerfil(req.usuario.idAuth, {
      fechaNacimiento: datos.fecha_nacimiento,
      altura,
      peso,
      posicionDb: POSICIONES[datos.posicion].db,
    });
    return res.redirect('/dashboard');
  } catch (err) {
    return next(err);
  }
}

async function cerrarSesion(req, res) {
  const { error } = await userModel.cerrarSesionEnAuth(req.supabase).catch((err) => ({ error: err }));
  if (error) console.error('⚠️  No se pudo revocar la sesión en Supabase:', error.message);
  res.set('Clear-Site-Data', '"cache"');
  return res.redirect('/login?msg=Sesion_cerrada');
}

module.exports = {
  mostrarRegistro,
  registrar,
  confirmarCorreo,
  mostrarLogin,
  reenviarVerificacion,
  iniciarSesion,
  iniciarConGoogle,
  callbackGoogle,
  mostrarCompletarPerfil,
  guardarCompletarPerfil,
  cerrarSesion,
};
