// routes/notificacionRoutes.js
// Fase 4 · Notificaciones (montado en /notificaciones desde app.js).

const express = require('express');
const router = express.Router();

const notificacionController = require('../controllers/notificacionController');
const { requireAuth } = require('../middlewares/authMiddleware');

router.get('/', requireAuth, notificacionController.listar); // NT-002
router.post('/leidas', requireAuth, notificacionController.marcarTodas); // NT-003
router.get('/:id/abrir', requireAuth, notificacionController.abrir); // NT-003 / NT-004

module.exports = router;
