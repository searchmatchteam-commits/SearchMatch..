const express = require('express');
const router = express.Router();

const recintos = require('../controllers/adminRecintosController');
const cuentas = require('../controllers/adminCuentasController');
const catalogos = require('../controllers/adminCatalogosController');
const superAdmin = require('../controllers/superAdminController');
const torneos = require('../controllers/adminTorneosController');
const { requireAuth } = require('../middlewares/authMiddleware');
const { requireAdmin, requireSuperAdmin } = require('../middlewares/rolMiddleware');
const {
  validarRecinto, validarCancha, validarBloque, validarCatalogo, validarTorneo, subirImagenesTorneo,
} = require('../middlewares/validadoresAdmin');

router.use(requireAuth, requireAdmin);

router.get('/', (req, res) => res.redirect(req.usuario.esSuperAdmin ? '/admin/super' : '/admin/recintos'));

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

// El superadministrador gestiona las cuentas desde /admin/super/jugadores (una sola lista).
router.get('/cuentas', (req, res, next) => (req.usuario.esSuperAdmin ? res.redirect('/admin/super/jugadores') : next()), cuentas.listar);
router.post('/cuentas/:id/desactivar', cuentas.desactivar);
router.post('/cuentas/:id/activar', cuentas.activar);

router.get('/catalogos', catalogos.listar);
router.post('/catalogos/:tipo', validarCatalogo, catalogos.crear);
router.post('/catalogos/:tipo/:id', validarCatalogo, catalogos.editar);
router.post('/catalogos/:tipo/:id/eliminar', catalogos.eliminar);

router.get('/super', requireSuperAdmin, superAdmin.resumen);
router.get('/super/equipos', requireSuperAdmin, superAdmin.equipos);
router.post('/super/equipos/:id/eliminar', requireSuperAdmin, superAdmin.eliminarEquipo);
router.get('/super/jugadores', requireSuperAdmin, superAdmin.jugadores);
router.post('/super/jugadores/:id/eliminar', requireSuperAdmin, superAdmin.eliminarJugador);
router.post('/super/jugadores/:id/desactivar', requireSuperAdmin, superAdmin.desactivarJugador);
router.post('/super/jugadores/:id/activar', requireSuperAdmin, superAdmin.activarJugador);

router.get('/super/torneos', requireSuperAdmin, torneos.listar);
router.get('/super/torneos/nuevo', requireSuperAdmin, torneos.formularioNuevo);
router.post('/super/torneos', requireSuperAdmin, subirImagenesTorneo, validarTorneo, torneos.crear);
router.get('/super/torneos/:id', requireSuperAdmin, torneos.detalle);
router.get('/super/torneos/:id/editar', requireSuperAdmin, torneos.formularioEditar);
router.post('/super/torneos/:id/editar', requireSuperAdmin, subirImagenesTorneo, validarTorneo, torneos.editar);
router.post('/super/torneos/:id/eliminar', requireSuperAdmin, torneos.eliminar);
router.post('/super/torneos/:id/empezar', requireSuperAdmin, torneos.empezar);
router.post('/super/torneos/:id/equipos/:idEquipo/quitar', requireSuperAdmin, torneos.quitarEquipo);
router.post('/super/torneos/:id/partidos/:idPartido', requireSuperAdmin, torneos.registrarResultado);

module.exports = router;
