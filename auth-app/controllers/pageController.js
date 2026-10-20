// controllers/pageController.js
// Lógica de las páginas del sitio.

// GET / → la raíz redirige según el estado de la sesión:
// logueado va al dashboard; sin sesión va al login.
function raiz(req, res) {
  if (req.session.usuario) {
    return res.redirect('/dashboard');
  }
  return res.redirect('/login');
}

// GET /dashboard → página protegida.
// El middleware requireAuth (aplicado en la ruta) ya garantiza que hay sesión.
function dashboard(req, res) {
  res.render('dashboard', {
    titulo: 'Dashboard',
    usuario: req.session.usuario,
  });
}

module.exports = { raiz, dashboard };
