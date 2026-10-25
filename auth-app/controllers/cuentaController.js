const cuentaModel = require('../models/cuentaModel');
const { TERMINOS, PRIVACIDAD } = require('../config/legal');

const COOKIE_RECUPERACION = 'sm_recuperacion';
const DURACION_RECUPERACION_MS = 15 * 60 * 1000;

const MSG_ENLACE_ENVIADO = 'Si el correo pertenece a una cuenta de SearchMatch (principal o secundario), '
  + 'enviamos un enlace al correo principal de esa cuenta para crear una contraseña nueva. Revisa tu bandeja y el spam.';

const AVISOS_CUENTA = {
  guardado: 'Tus datos se guardaron correctamente.',
  'correo-pendiente': 'Datos guardados. Te enviamos un enlace al correo nuevo: el cambio de correo principal se aplica al confirmarlo.',
  contrasena: 'Tu contraseña se cambió correctamente.',
};

function urlApp() {
  return process.env.APP_URL || `http://localhost:${process.env.PORT || 3000}`;
}

function listaErrores(erroresCampo) {
  return Object.values(erroresCampo);
}

function renderRecuperar(res, { status = 200, datos = {}, erroresCampo = {}, enviado = false, aviso = null } = {}) {
  return res.status(status).render('cuenta/recuperar', {
    titulo: 'Recuperar contraseña',
    pagina: 'auth',
    datos,
    erroresCampo,
    errores: listaErrores(erroresCampo),
    enviado,
    mensajeEnviado: MSG_ENLACE_ENVIADO,
    aviso,
  });
}

function mostrarRecuperar(req, res) {
  const aviso = req.query.msg === 'enlace-vencido'
    ? 'El enlace expiró o ya se usó. Pide uno nuevo aquí abajo.'
    : null;
  return renderRecuperar(res, { datos: { correo: '' }, aviso });
}

async function enviarRecuperacion(req, res, next) {
  const { correo } = req.datosFormulario;
  if (Object.keys(req.erroresCampo).length > 0) {
    return renderRecuperar(res, { status: 400, datos: { correo }, erroresCampo: req.erroresCampo });
  }
  try {
    const principal = await cuentaModel.correoPrincipalParaRecuperar(correo);
    if (principal) {
      const { error } = await cuentaModel.enviarEnlaceRecuperacion(req.supabase, principal, `${urlApp()}/recuperar/nueva`);
      if (error) console.error('⚠️  No se pudo enviar el correo de recuperación:', error.code, error.message);
    }
    return renderRecuperar(res, { datos: { correo }, enviado: true });
  } catch (err) {
    return next(err);
  }
}

function renderNuevaPassword(res, { status = 200, erroresCampo = {} } = {}) {
  return res.status(status).render('cuenta/nueva-contrasena', {
    titulo: 'Nueva contraseña',
    pagina: 'auth',
    erroresCampo,
    errores: listaErrores(erroresCampo),
  });
}

async function abrirEnlaceRecuperacion(req, res, next) {
  const { code, token_hash: tokenHash } = req.query;
  try {
    if (code || tokenHash) {
      const { error } = await cuentaModel.validarEnlaceRecuperacion(req.supabase, { code, tokenHash });
      if (error) return res.redirect('/recuperar?msg=enlace-vencido');
      res.cookie(COOKIE_RECUPERACION, '1', {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        maxAge: DURACION_RECUPERACION_MS,
      });
      return res.redirect('/recuperar/nueva');
    }
    if (!req.usuario || !req.cookies[COOKIE_RECUPERACION]) return res.redirect('/recuperar?msg=enlace-vencido');
    return renderNuevaPassword(res);
  } catch (err) {
    return next(err);
  }
}

async function guardarNuevaPassword(req, res, next) {
  if (!req.usuario || !req.cookies[COOKIE_RECUPERACION]) return res.redirect('/recuperar?msg=enlace-vencido');
  if (Object.keys(req.erroresCampo).length > 0) return renderNuevaPassword(res, { status: 400, erroresCampo: req.erroresCampo });
  try {
    const { error } = await cuentaModel.cambiarPassword(req.supabase, req.datosFormulario.password);
    if (error) {
      const mensaje = error.code === 'same_password'
        ? 'La contraseña nueva debe ser distinta de la anterior.'
        : 'No pudimos guardar la contraseña. Pide un enlace nuevo e inténtalo otra vez.';
      return renderNuevaPassword(res, { status: 400, erroresCampo: { password: mensaje } });
    }
    await req.supabase.auth.signOut({ scope: 'global' }).catch(() => {});
    res.clearCookie(COOKIE_RECUPERACION);
    return res.redirect('/login?msg=Contrasena_actualizada');
  } catch (err) {
    return next(err);
  }
}

function renderCambiarPassword(res, { status = 200, erroresCampo = {} } = {}) {
  return res.status(status).render('cuenta/contrasena', {
    titulo: 'Cambiar contraseña',
    pagina: 'equipo',
    erroresCampo,
    errores: listaErrores(erroresCampo),
  });
}

function mostrarCambiarPassword(req, res) {
  return renderCambiarPassword(res);
}

async function cambiarPassword(req, res, next) {
  const { actual, nueva } = req.datosFormulario;
  if (Object.keys(req.erroresCampo).length > 0) return renderCambiarPassword(res, { status: 400, erroresCampo: req.erroresCampo });
  try {
    if (!(await cuentaModel.passwordEsCorrecta(req.usuario.correo, actual))) {
      return renderCambiarPassword(res, { status: 400, erroresCampo: { password_actual: 'La contraseña actual no es correcta.' } });
    }
    const { error } = await cuentaModel.cambiarPassword(req.supabase, nueva);
    if (error) {
      console.error('⚠️  No se pudo cambiar la contraseña:', error.code, error.message);
      return renderCambiarPassword(res, { status: 400, erroresCampo: { password: 'No pudimos cambiar la contraseña. Inténtalo de nuevo.' } });
    }
    return res.redirect('/cuenta?aviso=contrasena');
  } catch (err) {
    return next(err);
  }
}

async function renderCuenta(req, res, { status = 200, datos = null, erroresCampo = {}, aviso = null } = {}) {
  const guardados = await cuentaModel.obtenerDatosCuenta(req.usuario.idAuth);
  return res.status(status).render('cuenta/datos', {
    titulo: 'Mi cuenta',
    pagina: 'equipo',
    datos: datos || guardados,
    guardados,
    legal: { terminos: TERMINOS, privacidad: PRIVACIDAD },
    erroresCampo,
    errores: listaErrores(erroresCampo),
    aviso,
  });
}

async function mostrarCuenta(req, res, next) {
  try {
    return await renderCuenta(req, res, { aviso: AVISOS_CUENTA[req.query.aviso] || null });
  } catch (err) {
    return next(err);
  }
}

async function guardarCuenta(req, res, next) {
  const datos = req.datosFormulario;
  const errores = { ...req.erroresCampo };
  try {
    const actuales = await cuentaModel.obtenerDatosCuenta(req.usuario.idAuth);
    const cambiaCorreo = datos.correo && datos.correo !== actuales.correo.toLowerCase();

    if (!errores.correo && cambiaCorreo && (await cuentaModel.correoUsadoPorOtraCuenta(datos.correo, req.usuario.idAuth))) {
      errores.correo = 'Ese correo ya está registrado en otra cuenta.';
    }
    if (!errores.correo_secundario && datos.correoSecundario
        && (await cuentaModel.correoUsadoPorOtraCuenta(datos.correoSecundario, req.usuario.idAuth))) {
      errores.correo_secundario = 'Ese correo ya está registrado en otra cuenta.';
    }
    if (Object.keys(errores).length === 0 && !(await cuentaModel.passwordEsCorrecta(req.usuario.correo, datos.passwordActual))) {
      errores.password_actual = 'La contraseña actual no es correcta.';
    }
    if (Object.keys(errores).length > 0) {
      return await renderCuenta(req, res, { status: 400, datos, erroresCampo: errores });
    }

    await cuentaModel.actualizarContacto(req.usuario.idAuth, datos);

    if (cambiaCorreo) {
      const { error } = await cuentaModel.solicitarCambioCorreo(req.supabase, datos.correo, `${urlApp()}/auth/confirmar`);
      if (error) {
        console.error('⚠️  No se pudo pedir el cambio de correo:', error.code, error.message);
        return await renderCuenta(req, res, {
          status: 400,
          datos,
          erroresCampo: { correo: 'No pudimos cambiar el correo principal ahora. El resto de tus datos sí se guardó.' },
        });
      }
      return res.redirect('/cuenta?aviso=correo-pendiente');
    }
    return res.redirect('/cuenta?aviso=guardado');
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  mostrarRecuperar,
  enviarRecuperacion,
  abrirEnlaceRecuperacion,
  guardarNuevaPassword,
  mostrarCambiarPassword,
  cambiarPassword,
  mostrarCuenta,
  guardarCuenta,
};
