// routes/partidoRoutes.js
// Fase 7 · Reservas, partidos y agenda (montado en "/" desde app.js).

const express = require('express');
const router = express.Router();

const reservas = require('../controllers/reservaController');
const partidos = require('../controllers/partidoController');
const agenda = require('../controllers/agendaController');
const { requireAuth, requireRol } = require('../middlewares/authMiddleware');
const { validarReserva, validarProgramacion, validarResultado } = require('../middlewares/validadoresPartido');

const conSesion = [requireAuth, requireRol];

router.get('/canchas/:id/reservar', conSesion, reservas.formulario); // PA-002
router.post('/canchas/:id/reservar', conSesion, validarReserva, reservas.reservar); // PA-002
router.get('/reservas', conSesion, reservas.misReservas); // AG-003
router.post('/reservas/:id/cancelar', conSesion, reservas.cancelar); // PA-003

router.get('/partidos/programar/:idDesafio', conSesion, partidos.formularioProgramar); // PA-001
router.post('/partidos/programar/:idDesafio', conSesion, validarProgramacion, partidos.programar); // PA-001
router.get('/partidos/:id', conSesion, partidos.detalle); // AG-002
router.post('/partidos/:id/resultado', conSesion, validarResultado, partidos.registrarResultado); // PA-005
router.post('/partidos/:id/cancelar', conSesion, partidos.cancelar); // PA-007

router.get('/agenda', conSesion, agenda.agenda); // AG-001
router.get('/inicio/equipo', conSesion, agenda.elegirEquipo); // IN-005

module.exports = router;
