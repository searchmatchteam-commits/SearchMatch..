// routes/canchasRoutes.js
// Canchas para los usuarios (montado en /canchas desde app.js). Requieren sesión, como el resto de módulos internos.

const express = require('express');
const router = express.Router();

const canchasController = require('../controllers/canchasController');
const { requireAuth, requireRol } = require('../middlewares/authMiddleware');

router.get('/', requireAuth, requireRol, canchasController.listar); // DE-002 a DE-005
router.get('/:id', requireAuth, requireRol, canchasController.ficha); // DE-003 (ficha) y DE-006

module.exports = router;
