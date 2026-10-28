// controllers/torneoController.js
// Sección Torneos de los jugadores: ver torneos, inscribir o retirar un equipo (solo su capitán)
// y ver el fixture, la tabla (liga) o la llave (relámpago). Los organiza el superadministrador.

const torneoModel = require('../models/torneoModel');
const equipoModel = require('../models/equipoModel');
const { idValido } = require('../middlewares/validadoresAdmin');

const AVISOS = {
  inscrito: '¡Equipo inscrito! Te avisaremos cuando empiece el torneo.',
  retirado: 'Retiraste a tu equipo del torneo.',
  cerrado: 'Las inscripciones de este torneo ya cerraron.',
  lleno: 'El torneo ya no tiene cupos.',
  'no-capitan': 'Solo el capitán que creó el equipo puede inscribirlo.',
  modalidad: 'Tu equipo no juega la modalidad de este torneo.',
  'ya-inscrito': 'Ese equipo ya está inscrito.',
  inexistente: 'Ese torneo ya no existe.',
  reglas: 'Debes aceptar las reglas del torneo para inscribir a tu equipo.',
  'modalidad-agregada': 'Listo: tu equipo ya juega esta modalidad. Ahora puedes inscribirlo.',
};

async function listar(req, res, next) {
  try {
    return res.render('torneos', {
      titulo: 'Torneos',
      pagina: 'equipo',
      torneoLista: true, // carga torneos-lista.css/.js (cartas, pestañas, foto con fondo blanco)
      torneos: await torneoModel.listar(),
      misTorneos: await torneoModel.idsMisTorneos(req.usuario.idAuth),
      aviso: AVISOS[req.query.aviso] || null,
    });
  } catch (err) {
    return next(err);
  }
}

async function detalle(req, res, next) {
  try {
    const torneo = await torneoModel.obtener(idValido(req.params.id));
    if (!torneo) return res.redirect('/torneos?aviso=inexistente');
    return res.render('torneos/detalle', {
      titulo: torneo.nombre,
      pagina: 'equipo',
      torneoDetalle: true, // carga torneo-detalle.css/.js (pestañas, cuadrante, rejilla)
      torneo,
      misEquipos: await torneoModel.equiposDelCapitan(req.usuario.idAuth, torneo.id),
      aviso: AVISOS[req.query.aviso] || null,
    });
  } catch (err) {
    return next(err);
  }
}

async function inscribir(req, res, next) {
  try {
    const idTorneo = idValido(req.params.id);
    const idEquipo = idValido(req.body.id_equipo);
    // El modal de inscripción pide aceptar las reglas antes de enviar.
    if (req.body.acepto_reglas !== 'si') return res.redirect(`/torneos/${idTorneo}?aviso=reglas`);
    const resultado = idTorneo && idEquipo ? await torneoModel.inscribir(req.usuario.idAuth, idTorneo, idEquipo) : 'no-capitan';
    return res.redirect(`/torneos/${idTorneo}?aviso=${resultado}`);
  } catch (err) {
    return next(err);
  }
}

// POST /torneos/:id/habilitar-modalidad → suma la modalidad del torneo al equipo (botón del panel de inscripción)
async function habilitarModalidad(req, res, next) {
  try {
    const torneo = await torneoModel.obtener(idValido(req.params.id));
    if (!torneo) return res.redirect('/torneos?aviso=inexistente');
    if (torneo.estado !== 'inscripcion') return res.redirect(`/torneos/${torneo.id}?aviso=cerrado`);
    const idEquipo = idValido(req.body.id_equipo);
    const resultado = idEquipo ? await equipoModel.agregarModalidad(req.usuario.idAuth, idEquipo, torneo.idModalidad) : 'sin-permiso';
    return res.redirect(`/torneos/${torneo.id}?aviso=${resultado === 'actualizadas' ? 'modalidad-agregada' : 'no-capitan'}`);
  } catch (err) {
    return next(err);
  }
}

async function retirar(req, res, next) {
  try {
    const idTorneo = idValido(req.params.id);
    const idEquipo = idValido(req.params.idEquipo);
    const retirado = idTorneo && idEquipo ? await torneoModel.retirar(req.usuario.idAuth, idTorneo, idEquipo) : false;
    return res.redirect(`/torneos/${idTorneo}?aviso=${retirado ? 'retirado' : 'cerrado'}`);
  } catch (err) {
    return next(err);
  }
}

function servirImagen(leer) {
  return async (req, res, next) => {
    try {
      const id = idValido(req.params.id);
      const imagen = id ? await leer(id) : null;
      if (!imagen) return next();
      res.set({
        'Content-Type': imagen.tipo,
        'Cache-Control': 'private, max-age=86400',
        'X-Content-Type-Options': 'nosniff',
      });
      return res.send(imagen.datos);
    } catch (err) {
      return next(err);
    }
  };
}

module.exports = {
  listar, detalle, inscribir, retirar, habilitarModalidad,
  foto: servirImagen(torneoModel.obtenerFoto),
  logo: servirImagen(torneoModel.obtenerLogo),
};
