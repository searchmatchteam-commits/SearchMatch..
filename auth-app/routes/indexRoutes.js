const express = require('express');
const router = express.Router();

const pageController = require('../controllers/pageController');
const rolController = require('../controllers/rolController');
const jugadorController = require('../controllers/jugadorController');
const equipoController = require('../controllers/equipoController');
const { requireAuth, requireRol } = require('../middlewares/authMiddleware');
const {
  validarPerfilJugador,
  validarEdicionPerfil,
  validarEquipo,
  validarDesafio,
  validarSolicitudUnion,
} = require('../middlewares/validators');

const subirImagen = express.raw({ type: ['image/jpeg', 'image/png', 'image/webp'], limit: '2mb' });

router.get('/', pageController.landing);

router.get('/select-role', requireAuth, rolController.mostrarSeleccion);
router.post('/select-role', requireAuth, rolController.guardarSeleccion);

router.get('/perfil-jugador', requireAuth, requireRol, jugadorController.mostrarWizard);
router.post('/perfil-jugador', requireAuth, requireRol, validarPerfilJugador, jugadorController.guardarWizard);
router.get('/perfil', requireAuth, requireRol, jugadorController.mostrarPerfil);
router.get('/perfil/editar', requireAuth, requireRol, jugadorController.mostrarEditor);
router.post('/perfil/editar', requireAuth, requireRol, validarEdicionPerfil, jugadorController.guardarEditor);
router.get('/perfil/foto', requireAuth, jugadorController.servirFoto);
router.post('/perfil/foto', requireAuth, requireRol, subirImagen, jugadorController.subirFoto);
router.post('/perfil/foto/eliminar', requireAuth, requireRol, jugadorController.eliminarFoto);
router.get('/jugadores/:id/foto', requireAuth, jugadorController.servirFotoJugador);

router.get('/crear-equipo', requireAuth, requireRol, equipoController.mostrarCrear);
router.post('/crear-equipo', requireAuth, requireRol, validarEquipo, equipoController.crear);
router.get('/crear-equipo/listo', requireAuth, requireRol, equipoController.confirmacion);
router.get('/mi-equipo', requireAuth, requireRol, equipoController.panel);
router.post('/mi-equipo/solicitudes/:id/:accion', requireAuth, requireRol, equipoController.responder);
router.get('/mi-equipo/solicitudes/:id', requireAuth, requireRol, equipoController.verSolicitud);
router.get('/mi-equipo/solicitudes/:id/foto', requireAuth, requireRol, equipoController.fotoSolicitud);
router.post('/mi-equipo/desafios/:id', requireAuth, requireRol, validarDesafio, equipoController.desafiar);
router.post('/equipos/:id/invitaciones/:idJugador', requireAuth, requireRol, equipoController.invitar);
router.post('/invitaciones/:id/:accion', requireAuth, requireRol, equipoController.responderInvitacion);
router.get('/mis-equipos', requireAuth, requireRol, equipoController.misEquipos);
router.get('/equipos', requireAuth, requireRol, equipoController.directorio);
router.post('/equipos/:id/unirme', requireAuth, requireRol, validarSolicitudUnion, equipoController.unirse);
router.post('/equipos/:id/plantel/:idJugador/posicion', requireAuth, requireRol, equipoController.guardarPosicion);
router.post('/equipos/:id/plantel/:idJugador/sacar', requireAuth, requireRol, equipoController.sacar);
router.post('/equipos/:id/salir', requireAuth, requireRol, equipoController.salir);
router.get('/equipos/:id/escudo', requireAuth, equipoController.servirEscudo);
router.post('/equipos/:id/escudo', requireAuth, requireRol, subirImagen, equipoController.subirEscudo);
router.get('/registro-equipo', (req, res) => res.redirect('/mi-equipo'));

router.get('/torneos', requireAuth, requireRol, pageController.torneos);

router.get('/dashboard', requireAuth, requireRol, pageController.dashboard);

module.exports = router;
