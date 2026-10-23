// middlewares/rolMiddleware.js
// AR-004 · Control de acceso según el rol de aplicación (usuario.id_rol_aplicacion).
// requireAdmin va en TODAS las rutas /admin (routes/adminRoutes.js lo aplica a todo el router):
// aunque alguien escriba la URL a mano, sin rol Administrador no entra.

/**
 * Deja pasar solo a cuentas con rol Administrador.
 *  - Sin sesión → al login.
 *  - Con sesión pero sin el rol → página 403 (no se revela qué hay dentro).
 */
function requireAdmin(req, res, next) {
  if (!req.usuario) return res.redirect('/login?msg=Debes_iniciar_sesion');
  if (!req.usuario.esAdmin) {
    return res.status(403).render('error', {
      titulo: 'Sin permiso',
      codigo: 403,
      mensaje: 'Esta sección es solo para administradores de SearchMatch.',
    });
  }
  res.set('Cache-Control', 'no-store'); // el navegador no guarda páginas de administración
  return next();
}

module.exports = { requireAdmin };
