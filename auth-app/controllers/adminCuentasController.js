const cuentaAdminModel = require('../models/cuentaAdminModel');
const { idValido, leerMotivo, MSG_MOTIVO } = require('../middlewares/validadoresAdmin');

const AVISOS = {
  desactivada: 'Cuenta desactivada: su sesión se cerró y ya no puede entrar.',
  activada: 'Cuenta reactivada: ya puede volver a iniciar sesión.',
  propia: 'No puedes desactivar tu propia cuenta desde este módulo.',
  protegida: 'Las cuentas del panel se gestionan en Administradores.',
  motivo: MSG_MOTIVO,
  'sin-cambio': 'No hubo cambios: la cuenta ya estaba en ese estado.',
};

async function listar(req, res, next) {
  const texto = String(req.query.texto || '').trim();
  try {
    const cuentas = await cuentaAdminModel.buscarCuentas(texto);
    return res.render('admin/cuentas', {
      titulo: 'Cuentas de usuario',
      pagina: 'equipo',
      seccion: 'usuarios',
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
      const motivo = leerMotivo(req.body.motivo);
      const admin = { id: req.usuario.id, nombre: req.usuario.nombre, idAuth: req.usuario.idAuth };
      const resultado = !motivo ? 'motivo'
        : idUsuario ? await cuentaAdminModel.cambiarEstadoCuenta(idUsuario, activo, admin, motivo) : 'sin-cambio';
      const aviso = resultado === 'cambiada' ? (activo ? 'activada' : 'desactivada') : resultado;
      const texto = String(req.body.texto || '');
      return res.redirect(`/admin/cuentas?aviso=${aviso}&texto=${encodeURIComponent(texto)}`);
    } catch (err) {
      return next(err);
    }
  };
}

module.exports = { listar, desactivar: cambiarEstado(false), activar: cambiarEstado(true) };
