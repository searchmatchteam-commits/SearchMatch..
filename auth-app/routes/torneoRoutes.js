const express = require('express');
const router = express.Router();

const torneoController = require('../controllers/torneoController');
const { requireAuth, requireRol } = require('../middlewares/authMiddleware');

// Imágenes: también las ve el superadministrador desde su panel (sin requireRol).
router.get('/:id/foto', requireAuth, torneoController.foto);
router.get('/patrocinadores/:id/logo', requireAuth, torneoController.logo);

router.get('/', requireAuth, requireRol, torneoController.listar);
router.get('/:id', requireAuth, requireRol, torneoController.detalle);
router.post('/:id/inscribir', requireAuth, requireRol, torneoController.inscribir);
router.post('/:id/retirar/:idEquipo', requireAuth, requireRol, torneoController.retirar);

module.exports = router;
