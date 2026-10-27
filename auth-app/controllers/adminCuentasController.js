const cuentaAdminModel = require('../models/cuentaAdminModel');
const { idValido } = require('../middlewares/validadoresAdmin');

const AVISOS = {
  desactivada: 'Cuenta desactivada: su sesión se cerró y ya no puede entrar.',
  activada: 'Cuenta reactivada: ya puede volver a iniciar sesión.',
  propia: 'No puedes desactivar tu propia cuenta desde este módulo.',
  protegida: 'La cuenta del superadministrador no se puede desactivar.',
  'sin-cambio': 'No hubo cambios: la cuenta ya estaba en ese estado.',
};

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
      const texto = String(req.body.texto || '');
      return res.redirect(`/admin/cuentas?aviso=${aviso}&texto=${encodeURIComponent(texto)}`);
    } catch (err) {
      return next(err);
    }
  };
}

module.exports = { listar, desactivar: cambiarEstado(false), activar: cambiarEstado(true) };
