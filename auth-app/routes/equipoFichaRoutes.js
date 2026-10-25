const express = require('express');
const router = express.Router();

const ficha = require('../controllers/equipoFichaController');
const { requireAuth, requireRol } = require('../middlewares/authMiddleware');
const { requireAdmin } = require('../middlewares/rolMiddleware');

router.get('/equipos/:id', requireAuth, requireRol, ficha.ficha);
router.post('/equipos/:id/comentarios', requireAuth, requireRol, ficha.comentar);
router.post('/comentarios/:id/ocultar', requireAuth, requireAdmin, ficha.ocultarComentario);
router.get('/equipos/:id/posiciones', requireAuth, requireRol, ficha.formularioPosiciones);
router.post('/equipos/:id/posiciones', requireAuth, requireRol, ficha.guardarPosiciones);
router.post('/equipos/:id/desactivar', requireAuth, requireRol, ficha.desactivar);
router.post('/equipos/:id/reactivar', requireAuth, requireRol, ficha.reactivar);
router.get('/solicitudes', requireAuth, requireRol, ficha.misSolicitudes);
router.post('/solicitudes/:id/cancelar', requireAuth, requireRol, ficha.cancelarSolicitud);
router.get('/cuenta/desactivar', requireAuth, ficha.formularioDesactivarCuenta);
router.post('/cuenta/desactivar', requireAuth, ficha.desactivarCuenta);

module.exports = router;
