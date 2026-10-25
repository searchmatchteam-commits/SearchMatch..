const userModel = require('../models/userModel');
const { ROLES_INICIO } = require('../middlewares/authMiddleware');

function renderSeleccion(res, { status = 200, rolElegido = null, errores = [] } = {}) {
  return res.status(status).render('seleccionar-rol', {
    titulo: '¿Cómo quieres empezar?',
    pagina: 'rol',
    rolElegido,
    errores,
  });
}

function mostrarSeleccion(req, res) {
  return renderSeleccion(res, { rolElegido: req.usuario.rolInicio });
}

async function guardarSeleccion(req, res, next) {
  const rol = req.body.rol;

  if (!ROLES_INICIO[rol]) {
    return renderSeleccion(res, { status: 400, errores: ['Elige cómo quieres usar Search Match para continuar.'] });
  }

  try {
    const { error } = await userModel.guardarRolInicio(req.supabase, rol);
    if (error) {
      console.error('⚠️  No se pudo guardar el rol de inicio:', error.code, error.message);
      return renderSeleccion(res, {
        status: 500,
        rolElegido: rol,
        errores: ['No pudimos guardar tu elección. Inténtalo de nuevo en unos segundos.'],
      });
    }
    return res.redirect(ROLES_INICIO[rol]);
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  mostrarSeleccion,
  guardarSeleccion,
};
