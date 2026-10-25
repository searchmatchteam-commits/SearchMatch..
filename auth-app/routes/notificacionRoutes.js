const express = require('express');
const router = express.Router();

const notificacionController = require('../controllers/notificacionController');
const { requireAuth } = require('../middlewares/authMiddleware');

router.get('/', requireAuth, notificacionController.listar);
router.post('/leidas', requireAuth, notificacionController.marcarTodas);
router.get('/:id/abrir', requireAuth, notificacionController.abrir);

module.exports = router;
