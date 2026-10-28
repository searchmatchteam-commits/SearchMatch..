const superAdminModel = require('../models/superAdminModel');
const cuentaAdminModel = require('../models/cuentaAdminModel');
const { idValido, leerMotivo, MSG_MOTIVO } = require('../middlewares/validadoresAdmin');

const AVISOS = {
  eliminado: 'Eliminado definitivamente.',
  desactivada: 'Cuenta desactivada: su sesión se cerró y ya no puede entrar.',
  activada: 'Cuenta reactivada: ya puede volver a iniciar sesión.',
  protegida: 'Las cuentas del panel se gestionan en Administradores.',
  motivo: MSG_MOTIVO,
  'sin-cambio': 'No hubo cambios: el registro ya no existe.',
  propia: 'No puedes eliminar tu propia cuenta desde este panel.',
  super: 'Las cuentas del panel no se eliminan: se revocan en Administradores.',
  capitan: 'Esta cuenta creó equipos: elimínalos primero en la pestaña Equipos.',
  'sin-auth': 'No se pudo borrar el usuario en Supabase Auth (revisa SUPABASE_SERVICE_ROLE_KEY). No se eliminó nada.',
};

const FILTROS = [
  { clave: 'todos', texto: 'Todos' },
  { clave: 'conectados', texto: 'Conectados (últimos 7 días)' },
  { clave: 'activas', texto: 'Cuentas activas' },
  { clave: 'inactivas', texto: 'Cuentas desactivadas' },
];

function adminDe(req) {
  return { id: req.usuario.id, nombre: req.usuario.nombre, idAuth: req.usuario.idAuth };
}

async function equipos(req, res, next) {
  const texto = String(req.query.texto || '').trim();
  try {
    return res.render('admin/super-equipos', {
      titulo: 'Equipos',
      pagina: 'equipo',
      seccion: 'equipos',
      equipos: await superAdminModel.buscarEquipos(texto),
      texto,
      aviso: AVISOS[req.query.aviso] || null,
    });
  } catch (err) {
    return next(err);
  }
}

async function eliminarEquipo(req, res, next) {
  try {
    const idEquipo = idValido(req.params.id);
    const motivo = leerMotivo(req.body.motivo);
    const resultado = !motivo ? 'motivo' : idEquipo ? await superAdminModel.eliminarEquipo(idEquipo, adminDe(req), motivo) : 'sin-cambio';
    return res.redirect(`/admin/super/equipos?aviso=${resultado}&texto=${encodeURIComponent(String(req.body.texto || ''))}`);
  } catch (err) {
    return next(err);
  }
}

async function jugadores(req, res, next) {
  const texto = String(req.query.texto || '').trim();
  const filtro = superAdminModel.FILTROS_JUGADOR[req.query.filtro] ? req.query.filtro : 'todos';
  try {
    return res.render('admin/super-jugadores', {
      titulo: 'Jugadores',
      pagina: 'equipo',
      seccion: 'usuarios',
      jugadores: await superAdminModel.buscarJugadores(texto, filtro),
      texto,
      filtro,
      filtros: FILTROS,
      miAuthId: req.usuario.idAuth,
      aviso: AVISOS[req.query.aviso] || null,
    });
  } catch (err) {
    return next(err);
  }
}

function volverAJugadores(req, res, aviso) {
  const texto = encodeURIComponent(String(req.body.texto || ''));
  const filtro = encodeURIComponent(String(req.body.filtro || 'todos'));
  return res.redirect(`/admin/super/jugadores?aviso=${aviso}&texto=${texto}&filtro=${filtro}`);
}

async function eliminarJugador(req, res, next) {
  try {
    const idUsuario = idValido(req.params.id);
    const motivo = leerMotivo(req.body.motivo);
    const resultado = !motivo ? 'motivo' : idUsuario ? await superAdminModel.eliminarJugador(idUsuario, adminDe(req), motivo) : 'sin-cambio';
    return volverAJugadores(req, res, resultado);
  } catch (err) {
    return next(err);
  }
}

function cambiarEstado(activo) {
  return async (req, res, next) => {
    try {
      const idUsuario = idValido(req.params.id);
      const motivo = leerMotivo(req.body.motivo);
      const resultado = !motivo ? 'motivo'
        : idUsuario ? await cuentaAdminModel.cambiarEstadoCuenta(idUsuario, activo, adminDe(req), motivo) : 'sin-cambio';
      return volverAJugadores(req, res, resultado === 'cambiada' ? (activo ? 'activada' : 'desactivada') : resultado);
    } catch (err) {
      return next(err);
    }
  };
}

module.exports = {
  equipos, eliminarEquipo, jugadores, eliminarJugador,
  desactivarJugador: cambiarEstado(false), activarJugador: cambiarEstado(true),
};
