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
const config = require('../controllers/adminConfigController');
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

// Torneos (AP-027, TO-001 a TO-005): Administrador y Administrador principal.
router.get('/torneos', torneos.listar);
router.get('/torneos/nuevo', torneos.formularioNuevo);
router.get('/torneos/canchas', torneos.canchasJSON);
router.post('/torneos', subirImagenesTorneo, validarTorneo, torneos.crear);
router.get('/torneos/:id', torneos.detalle);
router.get('/torneos/:id/editar', torneos.formularioEditar);
router.post('/torneos/:id/editar', subirImagenesTorneo, validarTorneo, torneos.editar);
router.post('/torneos/:id/publicar', torneos.publicar);
router.post('/torneos/:id/cerrar', torneos.cerrar);
router.post('/torneos/:id/eliminar', torneos.eliminar);
router.post('/torneos/:id/empezar', torneos.empezar);
router.post('/torneos/:id/equipos/:idEquipo/quitar', torneos.quitarEquipo);
router.post('/torneos/:id/partidos/:idPartido', torneos.registrarResultado);

// Configuración → Pasarelas de pago (TO-013)
router.get('/configuracion', (req, res) => res.redirect('/admin/catalogos'));
router.get('/configuracion/pasarelas', config.mostrar);
router.post('/configuracion/pasarelas/:clave', config.guardar);
router.post('/configuracion/pasarelas/:clave/probar', config.probar);
router.post('/configuracion/pasarelas/:clave/activar', config.activar);
router.post('/configuracion/pasarelas/:clave/desactivar', config.desactivar);

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

// Las rutas antiguas de torneos redirigen a /admin/torneos (los formularios POST usan 307 para conservar el método).
router.all(/^\/super\/torneos(\/.*)?$/, (req, res) => res.redirect(req.method === 'GET' ? 301 : 307, `/admin/torneos${req.url.slice('/super/torneos'.length)}`));

module.exports = router;
