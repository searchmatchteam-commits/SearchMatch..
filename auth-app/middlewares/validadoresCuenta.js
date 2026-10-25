const { REGEX_CORREO, errorPasswordSegura, normalizarTelefono } = require('./validators');

const LONGITUD_MAXIMA_CORREO = 150;

function revisarCorreo(valor, { obligatorio = true } = {}) {
  const correo = String(valor || '').trim().toLowerCase();
  if (!correo) return { correo, error: obligatorio ? 'El correo es obligatorio.' : null };
  if (!REGEX_CORREO.test(correo) || correo.length > LONGITUD_MAXIMA_CORREO) {
    return { correo, error: 'El formato del correo no es válido.' };
  }
  return { correo, error: null };
}

function validarRecuperar(req, res, next) {
  const { correo, error } = revisarCorreo(req.body.correo);
  req.datosFormulario = { correo };
  req.erroresCampo = error ? { correo: error } : {};
  next();
}

function validarNuevaPassword(req, res, next) {
  const password = req.body.password || '';
  const confirmar = req.body.confirmar_password || '';
  const errores = {};
  const errorPassword = errorPasswordSegura(password);
  if (errorPassword) errores.password = errorPassword;
  if (!confirmar) errores.confirmar_password = 'Confirma la contraseña nueva.';
  else if (confirmar !== password) errores.confirmar_password = 'Las contraseñas no coinciden.';
  req.datosFormulario = { password };
  req.erroresCampo = errores;
  next();
}

function validarCambioPassword(req, res, next) {
  const actual = req.body.password_actual || '';
  const nueva = req.body.password || '';
  const confirmar = req.body.confirmar_password || '';
  const errores = {};

  if (!actual) errores.password_actual = 'Escribe tu contraseña actual.';
  const errorNueva = errorPasswordSegura(nueva);
  if (errorNueva) errores.password = errorNueva;
  else if (actual && nueva === actual) errores.password = 'La contraseña nueva debe ser distinta de la actual.';
  if (!confirmar) errores.confirmar_password = 'Confirma la contraseña nueva.';
  else if (confirmar !== nueva) errores.confirmar_password = 'La confirmación no coincide con la contraseña nueva.';

  req.datosFormulario = { actual, nueva };
  req.erroresCampo = errores;
  next();
}

function validarDatosCuenta(req, res, next) {
  const principal = revisarCorreo(req.body.correo);
  const secundario = revisarCorreo(req.body.correo_secundario, { obligatorio: false });
  const telefonoIngresado = String(req.body.telefono || '').trim();
  const telefono = normalizarTelefono(telefonoIngresado);
  const passwordActual = req.body.password_actual || '';
  const errores = {};

  if (principal.error) errores.correo = principal.error;
  if (secundario.error) errores.correo_secundario = secundario.error;
  else if (secundario.correo && secundario.correo === principal.correo) {
    errores.correo_secundario = 'El correo secundario debe ser distinto del principal.';
  }
  if (!telefonoIngresado) errores.telefono = 'El teléfono es obligatorio.';
  else if (!telefono) errores.telefono = 'El teléfono debe ser un celular chileno, por ejemplo +56 9 1234 5678.';
  if (!passwordActual) errores.password_actual = 'Escribe tu contraseña actual para guardar los cambios.';

  req.datosFormulario = {
    correo: principal.correo,
    correoSecundario: secundario.correo,
    telefono: telefono || telefonoIngresado,
    passwordActual,
  };
  req.erroresCampo = errores;
  next();
}

module.exports = { validarRecuperar, validarNuevaPassword, validarCambioPassword, validarDatosCuenta };
