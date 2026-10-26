const express = require('express');
const router = express.Router();

const authController = require('../controllers/authController');
const { validarRegistro, validarLogin } = require('../middlewares/validators');
const { validarRecuperar } = require('../middlewares/validadoresCuenta');
const { redirectIfAuthenticated } = require('../middlewares/authMiddleware');

router.get('/registro', redirectIfAuthenticated, authController.mostrarRegistro);

router.post('/registro', redirectIfAuthenticated, validarRegistro, authController.registrar);

router.get('/auth/confirmar', authController.confirmarCorreo);

// AR-007: reenviar el enlace de verificación sin sesión (mismo validador de correo que /recuperar)
router.post('/verificacion/reenviar', validarRecuperar, authController.reenviarVerificacion);

router.get('/login', redirectIfAuthenticated, authController.mostrarLogin);

router.post('/login', redirectIfAuthenticated, validarLogin, authController.iniciarSesion);

router.post('/logout', authController.cerrarSesion);

module.exports = router;
