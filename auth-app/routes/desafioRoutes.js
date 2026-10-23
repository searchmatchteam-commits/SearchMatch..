// routes/desafioRoutes.js
// Fase 5 · Responder y consultar desafíos (montado en /desafios desde app.js).
// Los permisos de capitán los valida desafioModel.cambiarEstado (no basta con conocer la URL).

const express = require('express');
const router = express.Router();

const desafioController = require('../controllers/desafioController');
const { requireAuth, requireRol } = require('../middlewares/authMiddleware');

router.use(requireAuth, requireRol);

router.get('/', desafioController.listar); // DE-011 / DE-012
router.get('/:id', desafioController.detalle); // DE-014
router.post('/:id/aceptar', desafioController.aceptar); // DE-009
router.post('/:id/rechazar', desafioController.rechazar); // DE-010
router.post('/:id/cancelar', desafioController.cancelar); // DE-013

module.exports = router;
