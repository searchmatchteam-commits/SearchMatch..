const cuentaModel = require('../models/cuentaModel');
const { TERMINOS, PRIVACIDAD, DOCUMENTOS, aceptoVersionesVigentes } = require('../config/legal');
const { rutaDeInicio } = require('../middlewares/authMiddleware');

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

function renderAceptar(res, { status = 200, error = null } = {}) {
  return res.status(status).render('legal/aceptar', {
    titulo: 'Nuevos términos',
    pagina: 'equipo',
    terminos: { ...TERMINOS, fecha: fechaLarga(TERMINOS.actualizado) },
    privacidad: { ...PRIVACIDAD, fecha: fechaLarga(PRIVACIDAD.actualizado) },
    error,
  });
}

function mostrarAceptar(req, res) {
  if (aceptoVersionesVigentes(req.usuario)) return res.redirect(rutaDeInicio(req.usuario.rolInicio));
  return renderAceptar(res);
}

async function aceptar(req, res, next) {
  if (req.body.acepto !== 'si') {
    return renderAceptar(res, { status: 400, error: 'Para seguir usando SearchMatch debes aceptar los términos y la política de privacidad.' });
  }
  try {
    await cuentaModel.guardarAceptacion(req.usuario.idAuth, { terminos: TERMINOS.version, privacidad: PRIVACIDAD.version });
    return res.redirect(rutaDeInicio(req.usuario.rolInicio));
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
