const express = require('express');
const router = express.Router();

const recintos = require('../controllers/adminRecintosController');
const cuentas = require('../controllers/adminCuentasController');
const catalogos = require('../controllers/adminCatalogosController');
const { requireAuth } = require('../middlewares/authMiddleware');
const { requireAdmin } = require('../middlewares/rolMiddleware');
const { validarRecinto, validarCancha, validarBloque, validarCatalogo } = require('../middlewares/validadoresAdmin');

router.use(requireAuth, requireAdmin);

router.get('/', (req, res) => res.redirect('/admin/recintos'));

router.get('/recintos', recintos.listar);
router.get('/recintos/nuevo', recintos.formularioNuevo);
router.post('/recintos', validarRecinto, recintos.crear);
router.get('/recintos/:id', recintos.detalle);
router.get('/recintos/:id/editar', recintos.formularioEditar);
router.post('/recintos/:id/editar', validarRecinto, recintos.editar);
router.post('/recintos/:id/desactivar', recintos.desactivarRecinto);
router.post('/recintos/:id/activar', recintos.activarRecinto);

router.post('/recintos/:id/canchas', validarCancha, recintos.crearCancha);
router.get('/canchas/:id', recintos.detalleCancha);
router.post('/canchas/:id/editar', validarCancha, recintos.editarCancha);
router.post('/canchas/:id/desactivar', recintos.desactivarCancha);
router.post('/canchas/:id/activar', recintos.activarCancha);

router.post('/canchas/:id/disponibilidad', validarBloque, recintos.crearBloque);
router.post('/disponibilidad/:id/eliminar', recintos.eliminarBloque);

router.get('/cuentas', cuentas.listar);
router.post('/cuentas/:id/desactivar', cuentas.desactivar);
router.post('/cuentas/:id/activar', cuentas.activar);

router.get('/catalogos', catalogos.listar);
router.post('/catalogos/:tipo', validarCatalogo, catalogos.crear);
router.post('/catalogos/:tipo/:id', validarCatalogo, catalogos.editar);
router.post('/catalogos/:tipo/:id/eliminar', catalogos.eliminar);

module.exports = router;
