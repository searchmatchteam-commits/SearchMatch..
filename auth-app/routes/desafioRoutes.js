const express = require('express');
const router = express.Router();

const desafioController = require('../controllers/desafioController');
const { requireAuth, requireRol } = require('../middlewares/authMiddleware');

router.use(requireAuth, requireRol);

router.get('/', desafioController.listar);
router.get('/:id', desafioController.detalle);
router.post('/:id/aceptar', desafioController.aceptar);
router.post('/:id/rechazar', desafioController.rechazar);
router.post('/:id/cancelar', desafioController.cancelar);

module.exports = router;
