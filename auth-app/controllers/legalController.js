const cuentaModel = require('../models/cuentaModel');
const { TERMINOS, PRIVACIDAD, DOCUMENTOS, aceptoVersionesVigentes } = require('../config/legal');
const { rutaDeInicio } = require('../middlewares/authMiddleware');
const { validarFechaNacimiento } = require('../middlewares/validators');
const userModel = require('../models/userModel');

function fechaLarga(textoFecha) {
  return new Intl.DateTimeFormat('es-CL', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(`${textoFecha}T00:00:00Z`));
}

function mostrarDocumento(clave) {
  return (req, res) => {
    const documento = DOCUMENTOS[clave];
    res.render('legal/documento', {
      titulo: documento.titulo,
      pagina: 'equipo',
      documento,
      fecha: fechaLarga(documento.actualizado),
      otro: clave === 'terminos' ? PRIVACIDAD : TERMINOS,
    });
  };
}

// pedirEdad: quien se registró con Google aún no dio su fecha de nacimiento (exigimos 18+)
function renderAceptar(res, { status = 200, error = null, pedirEdad = false, fechaNacimiento = '', errorFecha = null } = {}) {
  return res.status(status).render('legal/aceptar', {
    titulo: pedirEdad ? 'Completa tu registro' : 'Nuevos términos',
    pagina: 'equipo',
    terminos: { ...TERMINOS, fecha: fechaLarga(TERMINOS.actualizado) },
    privacidad: { ...PRIVACIDAD, fecha: fechaLarga(PRIVACIDAD.actualizado) },
    error,
    pedirEdad,
    fechaNacimiento,
    errorFecha,
  });
}

function mostrarAceptar(req, res) {
  if (aceptoVersionesVigentes(req.usuario) && !req.usuario.faltaEdad) {
    return res.redirect(rutaDeInicio(req.usuario.rolInicio, req.usuario.esCuentaPanel));
  }
  return renderAceptar(res, { pedirEdad: req.usuario.faltaEdad });
}

async function aceptar(req, res, next) {
  const pedirEdad = req.usuario.faltaEdad;
  const fechaNacimiento = (req.body.fecha_nacimiento || '').trim();
  const errorFecha = pedirEdad ? validarFechaNacimiento(fechaNacimiento) : null;
  if (req.body.acepto !== 'si' || errorFecha) {
    let error = null;
    if (req.body.acepto !== 'si') {
      error = pedirEdad
        ? 'Para usar SearchMatch debes confirmar que tienes 18 años o más y aceptar los términos y la política de privacidad.'
        : 'Para seguir usando SearchMatch debes aceptar los términos y la política de privacidad.';
    }
    return renderAceptar(res, { status: 400, error, pedirEdad, fechaNacimiento, errorFecha });
  }
  try {
    if (pedirEdad) await userModel.guardarFechaNacimiento(req.usuario.idAuth, fechaNacimiento);
    await cuentaModel.guardarAceptacion(req.usuario.idAuth, { terminos: TERMINOS.version, privacidad: PRIVACIDAD.version });
    return res.redirect(rutaDeInicio(req.usuario.rolInicio, req.usuario.esCuentaPanel));
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  mostrarTerminos: mostrarDocumento('terminos'),
  mostrarPrivacidad: mostrarDocumento('privacidad'),
  mostrarAceptar,
  aceptar,
  fechaLarga,
};
