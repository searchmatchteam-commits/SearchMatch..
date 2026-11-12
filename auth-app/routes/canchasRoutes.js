const express = require('express');
const router = express.Router();

const canchasController = require('../controllers/canchasController');
const { requireAuth, requireRol } = require('../middlewares/authMiddleware');

router.get('/', requireAuth, requireRol, canchasController.listar);
router.get('/mapa.json', requireAuth, requireRol, canchasController.mapaJson);
router.get('/:id', requireAuth, requireRol, canchasController.ficha);

module.exports = router;
