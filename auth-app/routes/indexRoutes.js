// routes/indexRoutes.js
// Rutas de las páginas del sitio: landing, selección de rol y dashboard protegido.
// Solo llaman a los controladores; sin lógica de negocio.

const express = require('express');
const router = express.Router();

const pageController = require('../controllers/pageController');
const rolController = require('../controllers/rolController');
const jugadorController = require('../controllers/jugadorController');
const equipoController = require('../controllers/equipoController');
const { requireAuth, requireRol, soloCapitanes } = require('../middlewares/authMiddleware');
const { validarPerfilJugador, validarEquipo, validarDesafio } = require('../middlewares/validators');

// GET / → landing page.
router.get('/', pageController.landing);

// GET/POST /select-role → "¿Cómo quieres empezar?" (solo con sesión).
router.get('/select-role', requireAuth, rolController.mostrarSeleccion);
router.post('/select-role', requireAuth, rolController.guardarSeleccion);

// Rol "jugador": wizard para crear/editar el perfil y la carta resultante.
router.get('/perfil-jugador', requireAuth, requireRol, jugadorController.mostrarWizard);
router.post('/perfil-jugador', requireAuth, requireRol, validarPerfilJugador, jugadorController.guardarWizard);
router.get('/perfil', requireAuth, requireRol, jugadorController.mostrarPerfil);

// Equipos: wizard para crear el equipo, panel del capitán y directorio con solicitudes.
// Crear equipo: solo capitanes (el jugador vuelve a /equipos con "Acceso denegado").
router.get('/crear-equipo', requireAuth, requireRol, soloCapitanes, equipoController.mostrarCrear);
router.post('/crear-equipo', requireAuth, requireRol, soloCapitanes, validarEquipo, equipoController.crear);
router.get('/crear-equipo/listo', requireAuth, requireRol, soloCapitanes, equipoController.confirmacion);
router.get('/mi-equipo', requireAuth, requireRol, equipoController.panel);
router.post('/mi-equipo/solicitudes/:id/:accion', requireAuth, requireRol, equipoController.responder);
router.post('/mi-equipo/desafios/:id', requireAuth, requireRol, soloCapitanes, validarDesafio, equipoController.desafiar);
router.get('/equipos', requireAuth, requireRol, equipoController.directorio);
router.post('/equipos/:id/unirme', requireAuth, requireRol, equipoController.unirse);
// Dirección antigua del paso de equipo (enlaces o marcadores guardados).
router.get('/registro-equipo', (req, res) => res.redirect('/mi-equipo'));

// GET /dashboard → página protegida: requireAuth verifica la sesión y
// requireRol manda a /select-role a quien aún no eligió rol.
router.get('/dashboard', requireAuth, requireRol, pageController.dashboard);

module.exports = router;
