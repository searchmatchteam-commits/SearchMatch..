// routes/equipoFichaRoutes.js
// Fase 6 · Equipos (montado en "/" desde app.js, después de indexRoutes: sus rutas no chocan con las existentes).

const express = require('express');
const router = express.Router();

const ficha = require('../controllers/equipoFichaController');
const { requireAuth, requireRol } = require('../middlewares/authMiddleware');
const { requireAdmin } = require('../middlewares/rolMiddleware');

router.get('/equipos/:id', requireAuth, requireRol, ficha.ficha); // PE-009
router.post('/equipos/:id/comentarios', requireAuth, requireRol, ficha.comentar); // PE-008
router.post('/comentarios/:id/ocultar', requireAuth, requireAdmin, ficha.ocultarComentario); // AD-013
router.get('/equipos/:id/posiciones', requireAuth, requireRol, ficha.formularioPosiciones); // PE-021
router.post('/equipos/:id/posiciones', requireAuth, requireRol, ficha.guardarPosiciones); // PE-021
router.post('/equipos/:id/desactivar', requireAuth, requireRol, ficha.desactivar); // PE-017
router.post('/equipos/:id/reactivar', requireAuth, requireRol, ficha.reactivar); // PE-017
router.get('/solicitudes', requireAuth, requireRol, ficha.misSolicitudes); // PE-011
router.post('/solicitudes/:id/cancelar', requireAuth, requireRol, ficha.cancelarSolicitud); // PE-011
router.get('/cuenta/desactivar', requireAuth, ficha.formularioDesactivarCuenta); // PE-020
router.post('/cuenta/desactivar', requireAuth, ficha.desactivarCuenta); // PE-020

module.exports = router;
