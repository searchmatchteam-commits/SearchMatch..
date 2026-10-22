// routes/cuentaRoutes.js
// Rutas de la Fase 1: documentos legales, aceptar términos, recuperar y cambiar contraseña y datos de la cuenta.
// Solo definen el camino y encadenan middlewares y controladores.

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

// AR-010 · Documentos públicos (sin sesión)
router.get('/terminos', legalController.mostrarTerminos);
router.get('/privacidad', legalController.mostrarPrivacidad);

// AR-011 · Aceptar la versión vigente (bloquea los módulos internos hasta hacerlo)
router.get('/aceptar-terminos', requireAuth, legalController.mostrarAceptar);
router.post('/aceptar-terminos', requireAuth, legalController.aceptar);

// AR-008 · Recuperar contraseña (sin sesión; el enlace del correo abre una sesión temporal)
router.get('/recuperar', cuentaController.mostrarRecuperar);
router.post('/recuperar', validarRecuperar, cuentaController.enviarRecuperacion);
router.get('/recuperar/nueva', cuentaController.abrirEnlaceRecuperacion);
router.post('/recuperar/nueva', validarNuevaPassword, cuentaController.guardarNuevaPassword);

// AR-012 · Datos de la cuenta y AR-009 · Cambiar contraseña
router.get('/cuenta', requireAuth, cuentaController.mostrarCuenta);
router.post('/cuenta', requireAuth, validarDatosCuenta, cuentaController.guardarCuenta);
router.get('/cuenta/contrasena', requireAuth, cuentaController.mostrarCambiarPassword);
router.post('/cuenta/contrasena', requireAuth, validarCambioPassword, cuentaController.cambiarPassword);

module.exports = router;
