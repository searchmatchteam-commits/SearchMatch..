const express = require('express');
const router = express.Router();

const legalController = require('../controllers/legalController');
const cuentaController = require('../controllers/cuentaController');
const { requireAuth } = require('../middlewares/authMiddleware');
const {
  validarRecuperar,
  validarNuevaPassword,
  validarCambioPassword,
  validarDatosCuenta,
} = require('../middlewares/validadoresCuenta');

router.get('/terminos', legalController.mostrarTerminos);
router.get('/privacidad', legalController.mostrarPrivacidad);

router.get('/aceptar-terminos', requireAuth, legalController.mostrarAceptar);
router.post('/aceptar-terminos', requireAuth, legalController.aceptar);

router.get('/recuperar', cuentaController.mostrarRecuperar);
router.post('/recuperar', validarRecuperar, cuentaController.enviarRecuperacion);
router.get('/recuperar/nueva', cuentaController.abrirEnlaceRecuperacion);
router.post('/recuperar/nueva', validarNuevaPassword, cuentaController.guardarNuevaPassword);

router.get('/cuenta', requireAuth, cuentaController.mostrarCuenta);
router.post('/cuenta', requireAuth, validarDatosCuenta, cuentaController.guardarCuenta);
router.get('/cuenta/contrasena', requireAuth, cuentaController.mostrarCambiarPassword);
router.post('/cuenta/contrasena', requireAuth, validarCambioPassword, cuentaController.cambiarPassword);

module.exports = router;
