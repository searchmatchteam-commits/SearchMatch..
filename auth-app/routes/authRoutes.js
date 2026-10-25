const express = require('express');
const router = express.Router();

const authController = require('../controllers/authController');
const { validarRegistro, validarLogin } = require('../middlewares/validators');
const { redirectIfAuthenticated } = require('../middlewares/authMiddleware');

router.get('/registro', redirectIfAuthenticated, authController.mostrarRegistro);

router.post('/registro', redirectIfAuthenticated, validarRegistro, authController.registrar);

router.get('/auth/confirmar', authController.confirmarCorreo);

router.get('/login', redirectIfAuthenticated, authController.mostrarLogin);

router.post('/login', redirectIfAuthenticated, validarLogin, authController.iniciarSesion);

router.post('/logout', authController.cerrarSesion);

module.exports = router;
