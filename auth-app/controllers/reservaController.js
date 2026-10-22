// controllers/reservaController.js
// Reservas de cancha (Fase 7):
//  PA-002 GET/POST /canchas/:id/reservar   → formulario con costo estimado y reserva confirmada
//  AG-003 GET      /reservas               → mis reservas (futuras primero; canceladas se distinguen)
//  PA-003 POST     /reservas/:id/cancelar  → cancelar (solo las propias y futuras; no las de un partido)

const reservaModel = require('../models/reservaModel');
const canchaModel = require('../models/canchaModel');
const disponibilidadModel = require('../models/disponibilidadModel');
const notificacionModel = require('../models/notificacionModel');
const { idValido } = require('../middlewares/validadoresAdmin');
const { DIAS_SEMANA } = require('../config/canchas');

const ERRORES_RESERVA = {
  'cancha-inactiva': 'Esta cancha ya no está disponible para reservas.',
  'fuera-de-horario': 'Ese horario está fuera del horario de funcionamiento de la cancha ese día.',
  ocupado: 'Ese horario se cruza con otra reserva confirmada. Elige otro.',
};

const AVISOS = {
  creada: '¡Reserva confirmada! Aquí está en tu lista.',
  cancelada: 'Reserva cancelada: el horario quedó libre.',
  pasada: 'Esa reserva ya pasó: no se puede cancelar.',
  partido: 'Esa reserva es de un partido: reprograma o cancela el partido para liberarla.',
  inexistente: 'Esa reserva no existe o ya estaba cancelada.',
};

async function renderFormulario(res, cancha, { status = 200, datos = {}, erroresCampo = {}, error = null } = {}) {
  const bloques = await disponibilidadModel.listarBloques(cancha.id);
  return res.status(status).render('reservas/nueva', {
    titulo: `Reservar ${cancha.nombre}`,
    pagina: 'equipo',
    cancha,
    horario: DIAS_SEMANA.map((d) => ({ ...d, bloques: bloques.filter((b) => b.dia === d.clave) })),
    datos,
    erroresCampo,
    error,
  });
}

// GET /canchas/:id/reservar
async function formulario(req, res, next) {
  try {
    const idCancha = idValido(req.params.id);
    const cancha = idCancha ? await canchaModel.obtenerFichaCancha(idCancha) : null;
    if (!cancha) return res.status(404).render('canchas/no-disponible', { titulo: 'Cancha no disponible', pagina: 'equipo' });
    return await renderFormulario(res, cancha);
  } catch (err) {
    return next(err);
  }
}

// POST /canchas/:id/reservar
async function reservar(req, res, next) {
  try {
    const idCancha = idValido(req.params.id);
    const cancha = idCancha ? await canchaModel.obtenerFichaCancha(idCancha) : null;
    if (!cancha) return res.status(404).render('canchas/no-disponible', { titulo: 'Cancha no disponible', pagina: 'equipo' });
    const datos = req.datosFormulario;
    if (Object.keys(req.erroresCampo).length > 0) {
      return await renderFormulario(res, cancha, { status: 400, datos, erroresCampo: req.erroresCampo });
    }
    const salida = await reservaModel.reservar(req.usuario.idAuth, { idCancha, ...datos });
    if (salida.resultado !== 'creada') {
      return await renderFormulario(res, cancha, { status: 400, datos, error: ERRORES_RESERVA[salida.resultado] });
    }
    const idUsuario = await notificacionModel.idUsuarioDe(req.usuario.idAuth);
    await notificacionModel.notificarUsuario(idUsuario, 'reserva',
      `Reserva confirmada: ${cancha.nombre} (${cancha.recinto}) el ${datos.fecha} de ${datos.inicio} a ${datos.fin}.`, '/reservas');
    return res.redirect('/reservas?aviso=creada');
  } catch (err) {
    return next(err);
  }
}

// GET /reservas
async function misReservas(req, res, next) {
  try {
    return res.render('reservas/index', {
      titulo: 'Mis reservas',
      pagina: 'equipo',
      reservas: await reservaModel.listarMisReservas(req.usuario.idAuth),
      aviso: AVISOS[req.query.aviso] || null,
    });
  } catch (err) {
    return next(err);
  }
}

// POST /reservas/:id/cancelar
async function cancelar(req, res, next) {
  try {
    const idReserva = idValido(req.params.id);
    const salida = idReserva ? await reservaModel.cancelar(req.usuario.idAuth, idReserva) : { resultado: 'inexistente' };
    return res.redirect(`/reservas?aviso=${salida.resultado}`);
  } catch (err) {
    return next(err);
  }
}

module.exports = { formulario, reservar, misReservas, cancelar };
