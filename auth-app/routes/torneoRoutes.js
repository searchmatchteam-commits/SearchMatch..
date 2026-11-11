const express = require('express');
const router = express.Router();

const torneoController = require('../controllers/torneoController');
const { requireAuth, requireRol } = require('../middlewares/authMiddleware');

// Imágenes: también las ve el superadministrador desde su panel (sin requireRol).
router.get('/:id/foto', requireAuth, torneoController.foto);
router.get('/patrocinadores/:id/logo', requireAuth, torneoController.logo);

// Vuelta desde Webpay: sin requireAuth (Transbank vuelve con un POST desde su sitio, sin la cookie de sesión);
// el pago se reconoce por su token y se confirma con Transbank antes de inscribir.
router.all('/pagos/webpay/retorno', torneoController.retornoWebpay);

router.get('/', requireAuth, requireRol, torneoController.listar);
router.get('/:id', requireAuth, requireRol, torneoController.detalle);
router.post('/:id/inscribir', requireAuth, requireRol, torneoController.inscribir);
router.post('/:id/retirar/:idEquipo', requireAuth, requireRol, torneoController.retirar);
router.post('/:id/habilitar-modalidad', requireAuth, requireRol, torneoController.habilitarModalidad);

module.exports = router;
