// controllers/pageController.js
// Lógica de las páginas del sitio.

const jugadorModel = require('../models/jugadorModel');
const { POSICIONES, PIES, calcularMedia } = require('../config/perfilJugador');

// GET / → landing page pública.
function landing(req, res) {
  res.render('index', {
    titulo: 'Encuentra tu partido, arma tu equipo',
    pagina: 'landing',
  });
}

/**
 * Resumen de la carta para el saludo del dashboard (solo jugadores con perfil completo).
 * Si la base de datos falla, el dashboard se muestra igual, sin el resumen.
 */
async function resumenCarta(usuario) {
  if (usuario.rolInicio !== 'jugador') return null;
  const perfil = await jugadorModel.obtenerPerfil(usuario.idAuth).catch((err) => {
    console.error('⚠️  No se pudo leer la carta para el dashboard:', err.message);
    return null;
  });
  if (!perfil || !perfil.perfilCompleto || !perfil.stats) return null;
  return {
    media: calcularMedia(perfil.stats),
    posicion: POSICIONES[perfil.posicion] ? POSICIONES[perfil.posicion].sigla : '—',
    pie: PIES[perfil.pieHabil] ? `Pie ${PIES[perfil.pieHabil].toLowerCase()}` : '—',
  };
}

// GET /dashboard → página protegida.
// El middleware requireAuth (aplicado en la ruta) ya garantiza que hay sesión.
async function dashboard(req, res, next) {
  try {
    res.render('dashboard', {
      titulo: 'Mi panel',
      pagina: 'dashboard',
      carta: await resumenCarta(req.usuario),
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { landing, dashboard };
