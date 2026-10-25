function requireAdmin(req, res, next) {
  if (!req.usuario) return res.redirect('/login?msg=Debes_iniciar_sesion');
  if (!req.usuario.esAdmin) {
    return res.status(403).render('error', {
      titulo: 'Sin permiso',
      codigo: 403,
      mensaje: 'Esta sección es solo para administradores de SearchMatch.',
    });
  }
  res.set('Cache-Control', 'no-store');
  return next();
}

module.exports = { requireAdmin };
