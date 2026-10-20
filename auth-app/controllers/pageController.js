// controllers/pageController.js
// Lógica de las páginas del sitio.

// GET / → landing page pública.
function landing(req, res) {
  res.render('index', {
    titulo: 'Encuentra tu partido, arma tu equipo',
    pagina: 'landing',
  });
}

// GET /dashboard → página protegida.
// El middleware requireAuth (aplicado en la ruta) ya garantiza que hay sesión.
function dashboard(req, res) {
  res.render('dashboard', {
    titulo: 'Mi panel',
  });
}

module.exports = { landing, dashboard };
