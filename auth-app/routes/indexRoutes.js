// routes/indexRoutes.js
// Rutas de las páginas del sitio: landing, selección de rol y dashboard protegido.
// Solo llaman a los controladores; sin lógica de negocio.

const express = require('express');
const router = express.Router();

const pageController = require('../controllers/pageController');
const rolController = require('../controllers/rolController');
const jugadorController = require('../controllers/jugadorController');
const { requireAuth, requireRol } = require('../middlewares/authMiddleware');
const { validarPerfilJugador } = require('../middlewares/validators');

// GET / → landing page.
router.get('/', pageController.landing);

// GET/POST /select-role → "¿Cómo quieres empezar?" (solo con sesión).
router.get('/select-role', requireAuth, rolController.mostrarSeleccion);
router.post('/select-role', requireAuth, rolController.guardarSeleccion);

// Rol "jugador": wizard para crear/editar el perfil y la carta resultante.
router.get('/perfil-jugador', requireAuth, requireRol, jugadorController.mostrarWizard);
router.post('/perfil-jugador', requireAuth, requireRol, validarPerfilJugador, jugadorController.guardarWizard);
router.get('/perfil', requireAuth, requireRol, jugadorController.mostrarPerfil);

// Rol "equipo": siguiente paso (por construir).
router.get('/registro-equipo', requireAuth, requireRol, rolController.registroEquipo);

// GET /dashboard → página protegida: requireAuth verifica la sesión y
// requireRol manda a /select-role a quien aún no eligió rol.
router.get('/dashboard', requireAuth, requireRol, pageController.dashboard);

module.exports = router;
