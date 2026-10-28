const express = require('express');
const router = express.Router();

const acceso = require('../controllers/adminAccesoController');
const panel = require('../controllers/adminPanelController');
const administradores = require('../controllers/administradoresController');
const recintos = require('../controllers/adminRecintosController');
const cuentas = require('../controllers/adminCuentasController');
const catalogos = require('../controllers/adminCatalogosController');
const superAdmin = require('../controllers/superAdminController');
const torneos = require('../controllers/adminTorneosController');
const { requireAdmin, requirePrincipal } = require('../middlewares/rolMiddleware');
const {
  validarRecinto, validarCancha, validarBloque, validarCatalogo, validarTorneo, subirImagenesTorneo,
} = require('../middlewares/validadoresAdmin');

// AP-001: acceso propio del panel (sin registro). Son las únicas rutas de /admin sin sesión del panel.
router.get('/login', acceso.mostrarLogin);
router.post('/login', acceso.ingresar);
router.post('/logout', acceso.salir);

// Todo lo demás exige una sesión del panel vigente (así ninguna ruta nueva queda sin proteger).
router.use(requireAdmin);

router.get('/', panel.resumen);
router.get('/avisos/:id', panel.abrirAviso);

// AP-011 · solo el Administrador principal
router.get('/administradores', requirePrincipal, administradores.listar);
router.post('/administradores', requirePrincipal, administradores.crear);
router.post('/administradores/traspasar', requirePrincipal, administradores.traspasar);
router.post('/administradores/:id/revocar', requirePrincipal, administradores.revocar);
router.post('/administradores/:id/reactivar', requirePrincipal, administradores.reactivar);

// AP-032
router.get('/actividad', panel.listarActividad);
router.get('/actividad/:id', panel.detalleActividad);

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

// Usuarios: el Administrador principal usa la lista con eliminación definitiva (/admin/super/jugadores).
router.get('/cuentas', (req, res, next) => (req.usuario.esSuperAdmin ? res.redirect('/admin/super/jugadores') : next()), cuentas.listar);
router.post('/cuentas/:id/desactivar', cuentas.desactivar);
router.post('/cuentas/:id/activar', cuentas.activar);

router.get('/catalogos', catalogos.listar);
router.post('/catalogos/:tipo', validarCatalogo, catalogos.crear);
router.post('/catalogos/:tipo/:id', validarCatalogo, catalogos.editar);
router.post('/catalogos/:tipo/:id/eliminar', catalogos.eliminar);

// Equipos y Torneos: hoy solo existen en /admin/super (AP-012 y la fase 1 los abren a todos los administradores).
router.get('/equipos', (req, res, next) => (req.usuario.esSuperAdmin
  ? res.redirect(`/admin/super/equipos${req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : ''}`) : next()),
  (req, res) => res.render('admin/proximamente', { titulo: 'Equipos', pagina: 'equipo', seccion: 'equipos', fase: 5 }));
router.get('/torneos', (req, res, next) => (req.usuario.esSuperAdmin ? res.redirect('/admin/super/torneos') : next()),
  (req, res) => res.render('admin/proximamente', { titulo: 'Torneos', pagina: 'equipo', seccion: 'torneos', fase: 1 }));

// Secciones de fases siguientes (AP-002: el menú ya las muestra)
['desafios', 'partidos', 'reservas', 'valoraciones', 'comentarios', 'anuncios', 'apelaciones', 'pagos', 'estadisticas']
  .forEach((clave) => router.get(`/${clave}`, panel.proximamente(clave)));

router.get('/super', (req, res) => res.redirect('/admin'));
router.get('/super/equipos', requirePrincipal, superAdmin.equipos);
router.post('/super/equipos/:id/eliminar', requirePrincipal, superAdmin.eliminarEquipo);
router.get('/super/jugadores', requirePrincipal, superAdmin.jugadores);
router.post('/super/jugadores/:id/eliminar', requirePrincipal, superAdmin.eliminarJugador);
router.post('/super/jugadores/:id/desactivar', requirePrincipal, superAdmin.desactivarJugador);
router.post('/super/jugadores/:id/activar', requirePrincipal, superAdmin.activarJugador);

router.get('/super/torneos', requirePrincipal, torneos.listar);
router.get('/super/torneos/nuevo', requirePrincipal, torneos.formularioNuevo);
router.post('/super/torneos', requirePrincipal, subirImagenesTorneo, validarTorneo, torneos.crear);
router.get('/super/torneos/:id', requirePrincipal, torneos.detalle);
router.get('/super/torneos/:id/editar', requirePrincipal, torneos.formularioEditar);
router.post('/super/torneos/:id/editar', requirePrincipal, subirImagenesTorneo, validarTorneo, torneos.editar);
router.post('/super/torneos/:id/eliminar', requirePrincipal, torneos.eliminar);
router.post('/super/torneos/:id/empezar', requirePrincipal, torneos.empezar);
router.post('/super/torneos/:id/equipos/:idEquipo/quitar', requirePrincipal, torneos.quitarEquipo);
router.post('/super/torneos/:id/partidos/:idPartido', requirePrincipal, torneos.registrarResultado);

module.exports = router;
