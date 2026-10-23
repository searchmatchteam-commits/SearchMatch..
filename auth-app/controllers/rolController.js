// controllers/rolController.js
// Onboarding: pantalla de bienvenida al registro. Por ahora no se elige rol en pantalla:
// el formulario envía "jugador" y lleva a sus datos (/perfil-jugador). "equipo" se sigue aceptando.
// El rol se guarda en user_metadata.rol_inicio de Supabase Auth
// (userModel.guardarRolInicio), así que viaja con la sesión en cualquier dispositivo.

const userModel = require('../models/userModel');
const { ROLES_INICIO } = require('../middlewares/authMiddleware');

function renderSeleccion(res, { status = 200, rolElegido = null, errores = [] } = {}) {
  return res.status(status).render('seleccionar-rol', {
    titulo: 'Completa tu registro',
    pagina: 'rol',
    rolElegido,
    errores,
  });
}

// ---------------------------------------------------------------
// GET /select-role → bienvenida + botón "Siguiente: Mis datos"
// ---------------------------------------------------------------
function mostrarSeleccion(req, res) {
  // Si ya eligió antes, su rol viene marcado (puede cambiarlo).
  return renderSeleccion(res, { rolElegido: req.usuario.rolInicio });
}

// ---------------------------------------------------------------
// POST /select-role → guardar el rol y seguir al siguiente paso
// ---------------------------------------------------------------
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

// El siguiente paso de cada rol está en jugadorController (wizard) y equipoController (crear equipo).

module.exports = {
  mostrarSeleccion,
  guardarSeleccion,
};
