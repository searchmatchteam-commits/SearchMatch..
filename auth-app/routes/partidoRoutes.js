const express = require('express');
const router = express.Router();

const reservas = require('../controllers/reservaController');
const partidos = require('../controllers/partidoController');
const agenda = require('../controllers/agendaController');
const { requireAuth, requireRol } = require('../middlewares/authMiddleware');
const { validarReserva, validarProgramacion, validarResultado } = require('../middlewares/validadoresPartido');

const conSesion = [requireAuth, requireRol];

router.get('/canchas/:id/reservar', conSesion, reservas.formulario);
router.post('/canchas/:id/reservar', conSesion, validarReserva, reservas.reservar);
router.get('/reservas', conSesion, reservas.misReservas);
router.post('/reservas/:id/cancelar', conSesion, reservas.cancelar);

router.get('/partidos/programar/:idDesafio', conSesion, partidos.formularioProgramar);
router.post('/partidos/programar/:idDesafio', conSesion, validarProgramacion, partidos.programar);
router.get('/partidos/:id', conSesion, partidos.detalle);
router.post('/partidos/:id/resultado', conSesion, validarResultado, partidos.registrarResultado);
router.post('/partidos/:id/cancelar', conSesion, partidos.cancelar);

router.get('/agenda', conSesion, agenda.agenda);
router.get('/inicio/equipo', conSesion, agenda.elegirEquipo);
// JSON de los calendarios (dashboard y agenda): responde 401 en JSON sin sesión, por eso no usa conSesion.
router.get('/api/calendario/eventos', agenda.eventos);

module.exports = router;
