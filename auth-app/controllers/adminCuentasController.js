// controllers/adminCuentasController.js
// AD-012 · Gestionar cuentas de usuario (solo administradores, por requireAdmin):
//  GET  /admin/cuentas?texto=...             → buscar por correo o nombre; muestra rol y estado
//  POST /admin/cuentas/:id/(desactivar|activar)
// Al desactivar, la persona pierde el acceso en su siguiente clic (authMiddleware revisa usuario.activo)
// y no puede volver a iniciar sesión hasta que la reactiven.

const cuentaAdminModel = require('../models/cuentaAdminModel');
const { idValido } = require('../middlewares/validadoresAdmin');

const AVISOS = {
  desactivada: 'Cuenta desactivada: su sesión se cerró y ya no puede entrar.',
  activada: 'Cuenta reactivada: ya puede volver a iniciar sesión.',
  propia: 'No puedes desactivar tu propia cuenta desde este módulo.',
  'sin-cambio': 'No hubo cambios: la cuenta ya estaba en ese estado.',
};

// GET /admin/cuentas
async function listar(req, res, next) {
  const texto = String(req.query.texto || '').trim();
  try {
    const cuentas = await cuentaAdminModel.buscarCuentas(texto);
    return res.render('admin/cuentas', {
      titulo: 'Cuentas de usuario',
      pagina: 'equipo',
      seccion: 'cuentas',
      cuentas,
      texto,
      miAuthId: req.usuario.idAuth,
      aviso: AVISOS[req.query.aviso] || null,
    });
  } catch (err) {
    return next(err);
  }
}

function cambiarEstado(activo) {
  return async (req, res, next) => {
    try {
      const idUsuario = idValido(req.params.id);
      const resultado = idUsuario ? await cuentaAdminModel.cambiarEstadoCuenta(idUsuario, activo, req.usuario.idAuth) : 'sin-cambio';
      const aviso = resultado === 'cambiada' ? (activo ? 'activada' : 'desactivada') : resultado;
      // Vuelve a la misma búsqueda (el texto se pasa codificado, nunca se inserta tal cual)
      const texto = String(req.body.texto || '');
      return res.redirect(`/admin/cuentas?aviso=${aviso}&texto=${encodeURIComponent(texto)}`);
    } catch (err) {
      return next(err);
    }
  };
}

module.exports = { listar, desactivar: cambiarEstado(false), activar: cambiarEstado(true) };
