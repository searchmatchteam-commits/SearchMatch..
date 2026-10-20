// routes/authRoutes.js
// Rutas de autenticación.
// Las rutas SOLO definen el camino y encadenan middlewares/controladores:
// aquí no hay lógica de negocio ni consultas a la base de datos.

const express = require('express');
const router = express.Router();

const authController = require('../controllers/authController');
const { validarRegistro, validarLogin } = require('../middlewares/validators');
const { redirectIfAuthenticated } = require('../middlewares/authMiddleware');

// GET /registro → formulario de registro (si ya está logueado, lo manda al dashboard).
router.get('/registro', redirectIfAuthenticated, authController.mostrarRegistro);

// POST /registro → valida los datos y crea el usuario.
router.post('/registro', redirectIfAuthenticated, validarRegistro, authController.registrar);

// GET /auth/confirmar → enlace del correo de confirmación: confirma y abre la sesión.
router.get('/auth/confirmar', authController.confirmarCorreo);

// GET /login → formulario de login.
router.get('/login', redirectIfAuthenticated, authController.mostrarLogin);

// POST /login → valida los datos y crea la sesión.
router.post('/login', redirectIfAuthenticated, validarLogin, authController.iniciarSesion);

// POST /logout → revoca la sesión en Supabase y borra las cookies.
router.post('/logout', authController.cerrarSesion);

module.exports = router;
