// routes/indexRoutes.js
// Rutas de las páginas del sitio: landing y dashboard protegido.
// Solo llaman a los controladores; sin lógica de negocio.

const express = require('express');
const router = express.Router();

const pageController = require('../controllers/pageController');
const { requireAuth } = require('../middlewares/authMiddleware');

// GET / → landing page.
router.get('/', pageController.landing);

// GET /dashboard → página protegida: requireAuth verifica la sesión
// y solo si existe deja pasar al controlador.
router.get('/dashboard', requireAuth, pageController.dashboard);

module.exports = router;
