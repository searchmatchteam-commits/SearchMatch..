const superAdminModel = require('../models/superAdminModel');
const cuentaAdminModel = require('../models/cuentaAdminModel');
const { idValido } = require('../middlewares/validadoresAdmin');

const AVISOS = {
  eliminado: 'Eliminado definitivamente.',
  desactivada: 'Cuenta desactivada: su sesión se cerró y ya no puede entrar.',
  activada: 'Cuenta reactivada: ya puede volver a iniciar sesión.',
  protegida: 'La cuenta del superadministrador no se puede desactivar.',
  'sin-cambio': 'No hubo cambios: el registro ya no existe.',
  propia: 'No puedes eliminar tu propia cuenta desde este panel.',
  super: 'No se puede eliminar a otro superadministrador.',
  capitan: 'Esta cuenta creó equipos: elimínalos primero en la pestaña Equipos.',
  'sin-auth': 'No se pudo borrar el usuario en Supabase Auth (revisa SUPABASE_SERVICE_ROLE_KEY). No se eliminó nada.',
};

const FILTROS = [
  { clave: 'todos', texto: 'Todos' },
  { clave: 'conectados', texto: 'Conectados (últimos 7 días)' },
  { clave: 'activas', texto: 'Cuentas activas' },
  { clave: 'inactivas', texto: 'Cuentas desactivadas' },
];

async function resumen(req, res, next) {
  try {
    return res.render('admin/super-resumen', {
      titulo: 'Superadministración',
      pagina: 'equipo',
      seccion: 'super',
      cifras: await superAdminModel.resumen(),
    });
  } catch (err) {
    return next(err);
  }
}

async function equipos(req, res, next) {
  const texto = String(req.query.texto || '').trim();
  try {
    return res.render('admin/super-equipos', {
      titulo: 'Equipos',
      pagina: 'equipo',
      seccion: 'super-equipos',
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
    const resultado = idEquipo ? await superAdminModel.eliminarEquipo(idEquipo) : 'sin-cambio';
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
      seccion: 'super-jugadores',
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
    const resultado = idUsuario ? await superAdminModel.eliminarJugador(idUsuario, req.usuario.idAuth) : 'sin-cambio';
    return volverAJugadores(req, res, resultado);
  } catch (err) {
    return next(err);
  }
}

function cambiarEstado(activo) {
  return async (req, res, next) => {
    try {
      const idUsuario = idValido(req.params.id);
      const resultado = idUsuario ? await cuentaAdminModel.cambiarEstadoCuenta(idUsuario, activo, req.usuario.idAuth) : 'sin-cambio';
      return volverAJugadores(req, res, resultado === 'cambiada' ? (activo ? 'activada' : 'desactivada') : resultado);
    } catch (err) {
      return next(err);
    }
  };
}

module.exports = {
  resumen, equipos, eliminarEquipo, jugadores, eliminarJugador,
  desactivarJugador: cambiarEstado(false), activarJugador: cambiarEstado(true),
};
