// middlewares/authMiddleware.js
// Middlewares relacionados con la sesión del usuario:
//  - requireAuth: protege rutas (solo accesibles con sesión iniciada).
//  - redirectIfAuthenticated: evita que un usuario logueado vea login/registro.

/**
 * Protege una ruta: si no hay usuario en la sesión, redirige al login.
 * Se usa antes del controlador de la página protegida, por ejemplo:
 *   router.get('/dashboard', requireAuth, pageController.dashboard);
 */
function requireAuth(req, res, next) {
  // req.session.usuario lo escribimos en authController al hacer login.
  if (!req.session.usuario) {
    return res.redirect('/login?msg=Debes_iniciar_sesion');
  }
  // Todo bien: dejamos pasar al controlador.
  return next();
}

/**
 * Redirige al dashboard si el usuario ya tiene sesión activa.
 * Se aplica a las rutas /login y /registro.
 */
function redirectIfAuthenticated(req, res, next) {
  if (req.session.usuario) {
    return res.redirect('/dashboard');
  }
  return next();
}

module.exports = { requireAuth, redirectIfAuthenticated };
