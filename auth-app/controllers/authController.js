// controllers/authController.js
// Lógica de las acciones de autenticación con Supabase Auth: mostrar formularios,
// registrar, confirmar el correo, iniciar sesión y cerrar sesión.
// La validación de formato ya corrió en middlewares/validators.js;
// todo acceso a Supabase y a la base de datos pasa por models/userModel.js.
// Las cookies de sesión las escribe y borra el cliente de @supabase/ssr
// (req.supabase, creado en authMiddleware.cargarSesion).

const userModel = require('../models/userModel');
const { rutaDeInicio } = require('../middlewares/authMiddleware');

const MSG_CORREO_REGISTRADO = 'Este correo ya está registrado. Inicia sesión o usa otro correo.';

// Mensajes en español para los códigos de error más comunes de Supabase Auth.
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

/**
 * Traduce un error de Supabase a un mensaje para el usuario.
 * Primero por código; si no viene código (versiones antiguas), por el texto.
 */
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

  // Para la consola: todo lo que trae el error. Algunos (ej. "Invalid API key")
  // no traen code, así que también mostramos el status HTTP y el tipo de error.
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

// Re-pinta el registro con un error (conserva todo menos las contraseñas).
function renderRegistroConError(req, res, status, mensaje) {
  return res.status(status).render('registro', {
    pagina: 'auth',
    titulo: 'Crear cuenta',
    errores: [mensaje],
    datos: {
      nombre: req.datosFormulario.nombre,
      apellido: req.datosFormulario.apellido,
      correo: req.datosFormulario.correo,
      telefono: req.body.telefono || '',
      fecha_nacimiento: req.datosFormulario.fechaNacimiento,
    },
  });
}

// ---------------------------------------------------------------
// GET /registro → mostrar el formulario de registro
// ---------------------------------------------------------------
function mostrarRegistro(req, res) {
  res.render('registro', {
    pagina: 'auth',
    titulo: 'Crear cuenta',
    errores: [],
    datos: {},
  });
}

// ---------------------------------------------------------------
// POST /registro → crear la cuenta en Supabase Auth + perfil en usuario/jugador
// ---------------------------------------------------------------
async function registrar(req, res, next) {
  const { nombre, apellido, correo, telefono, fechaNacimiento } = req.datosFormulario;
  const password = req.body.password;

  try {
    // 1) Si el correo ya tiene perfil, avisamos sin llamar a Supabase.
    if (await userModel.findByEmail(correo)) {
      return renderRegistroConError(req, res, 400, MSG_CORREO_REGISTRADO);
    }

    // 2) Cuenta en Supabase Auth. El enlace del correo de confirmación vuelve a
    //    /auth/confirmar, que abre la sesión directamente.
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

    // Con "Confirm email" activo, Supabase no devuelve error si el correo ya existe:
    // devuelve un usuario sin identidades (para no revelar qué correos existen).
    if (!data.user || (data.user.identities && data.user.identities.length === 0)) {
      return renderRegistroConError(req, res, 400, MSG_CORREO_REGISTRADO);
    }

    // 3) Perfil en "usuario" + "jugador" (una sola transacción en el modelo).
    //    Si falla, la transacción ya hizo ROLLBACK; además deshacemos la cuenta de Auth.
    try {
      await userModel.create({
        authId: data.user.id,
        nombre,
        apellido,
        correo,
        telefono,
        fechaNacimiento,
      });
    } catch (err) {
      // Con la confirmación de correo desactivada, signUp ya dejó la sesión en cookies.
      if (data.session) {
        await userModel.cerrarSesionEnAuth(req.supabase).catch(() => {});
      }
      const eliminada = await userModel.eliminarDeAuth(data.user.id);
      if (!eliminada) {
        console.error(`⚠️  Cuenta de Auth ${data.user.id} quedó sin perfil (falta SUPABASE_SERVICE_ROLE_KEY para deshacerla).`);
      }
      // 23505 = unique_violation: el correo se registró entre la verificación y el INSERT.
      if (err.code === '23505') {
        return renderRegistroConError(req, res, 400, MSG_CORREO_REGISTRADO);
      }
      throw err;
    }

    // 4a) Confirmación de correo desactivada: Supabase ya entregó la sesión
    //     y el cliente la guardó en las cookies.
    //     Cuenta nueva = aún sin rol → "¿Cómo quieres empezar?".
    if (data.session) {
      return res.redirect('/select-role');
    }

    // 4b) Confirmación activada: hay que revisar el correo antes de entrar.
    return res.redirect('/login?msg=Confirma_tu_correo');
  } catch (err) {
    return next(err);
  }
}

// ---------------------------------------------------------------
// GET /login → mostrar el formulario de login
// ---------------------------------------------------------------
function mostrarLogin(req, res) {
  // Mensaje opcional que llega por query string (ej: ?msg=Confirma_tu_correo).
  const mensajes = {
    Confirma_tu_correo: 'Te enviamos un correo de confirmación. Ábrelo y luego inicia sesión.',
    Enlace_invalido: 'El enlace de confirmación no es válido o ya expiró. Inicia sesión para recibir uno nuevo.',
    Debes_iniciar_sesion: 'Debes iniciar sesión para acceder a esa página.',
    Sesion_cerrada: 'Cerraste sesión correctamente.',
  };

  res.render('login', {
    pagina: 'auth',
    titulo: 'Iniciar sesión',
    errores: [],
    datos: {},
    aviso: mensajes[req.query.msg] || null,
  });
}

// ---------------------------------------------------------------
// GET /auth/confirmar → enlace del correo de confirmación.
// Supabase redirige aquí con ?code=... (PKCE) o ?token_hash=...&type=...
// ---------------------------------------------------------------
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
    // Correo confirmado y sesión abierta (cookies ya escritas).
    const meta = (data.user && data.user.user_metadata) || {};
    return res.redirect(rutaDeInicio(meta.rol_inicio));
  } catch (err) {
    return next(err);
  }
}

// ---------------------------------------------------------------
// POST /login → validar credenciales con Supabase (la sesión queda en cookies)
// ---------------------------------------------------------------
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

    // Sin rol elegido → selección de rol; si ya eligió → dashboard.
    return res.redirect(rutaDeInicio(data.user.user_metadata && data.user.user_metadata.rol_inicio));
  } catch (err) {
    return next(err);
  }
}

// ---------------------------------------------------------------
// POST /logout → revocar la sesión en Supabase y borrar las cookies
// ---------------------------------------------------------------
async function cerrarSesion(req, res) {
  // signOut borra las cookies aunque Supabase no responda; el error solo se registra.
  const { error } = await userModel.cerrarSesionEnAuth(req.supabase).catch((err) => ({ error: err }));
  if (error) console.error('⚠️  No se pudo revocar la sesión en Supabase:', error.message);
  return res.redirect('/login?msg=Sesion_cerrada');
}

module.exports = {
  mostrarRegistro,
  registrar,
  confirmarCorreo,
  mostrarLogin,
  iniciarSesion,
  cerrarSesion,
};
