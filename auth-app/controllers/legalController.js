// controllers/legalController.js
// AR-010 · Leer los términos y condiciones y la política de privacidad (sin iniciar sesión).
// AR-011 · Aceptar la versión vigente cuando cambió (las cuentas nuevas aceptan al registrarse).
//  - GET /terminos y GET /privacidad → el documento con su versión y fecha.
//  - GET/POST /aceptar-terminos       → pantalla que bloquea los módulos internos hasta aceptar.

const cuentaModel = require('../models/cuentaModel');
const { TERMINOS, PRIVACIDAD, DOCUMENTOS, aceptoVersionesVigentes } = require('../config/legal');
const { rutaDeInicio } = require('../middlewares/authMiddleware');

/** "2026-10-22" → "22 de octubre de 2026". */
function fechaLarga(textoFecha) {
  return new Intl.DateTimeFormat('es-CL', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(`${textoFecha}T00:00:00Z`));
}

// GET /terminos y GET /privacidad (la clave del documento viene de la ruta, no del usuario)
function mostrarDocumento(clave) {
  return (req, res) => {
    const documento = DOCUMENTOS[clave];
    res.render('legal/documento', {
      titulo: documento.titulo,
      pagina: 'equipo', // reutiliza los paneles y la cabecera de equipos
      documento,
      fecha: fechaLarga(documento.actualizado),
      otro: clave === 'terminos' ? PRIVACIDAD : TERMINOS,
    });
  };
}

function renderAceptar(res, { status = 200, error = null } = {}) {
  return res.status(status).render('legal/aceptar', {
    titulo: 'Nuevos términos',
    pagina: 'equipo', // reutiliza los paneles y la cabecera de equipos
    terminos: { ...TERMINOS, fecha: fechaLarga(TERMINOS.actualizado) },
    privacidad: { ...PRIVACIDAD, fecha: fechaLarga(PRIVACIDAD.actualizado) },
    error,
  });
}

// GET /aceptar-terminos
function mostrarAceptar(req, res) {
  if (aceptoVersionesVigentes(req.usuario)) return res.redirect(rutaDeInicio(req.usuario.rolInicio));
  return renderAceptar(res);
}

// POST /aceptar-terminos → guarda versión y fecha y deja entrar
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
