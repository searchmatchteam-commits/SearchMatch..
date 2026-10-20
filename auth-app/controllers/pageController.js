// controllers/pageController.js
// Lógica de las páginas del sitio.

const jugadorModel = require('../models/jugadorModel');
const { POSICIONES, NIVELES, calcularMedia } = require('../config/perfilJugador');
const { CANCHAS, EQUIPOS } = require('../config/dashboardEjemplo');

const formatoPesos = new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 });

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
    nivel: NIVELES[perfil.nivel] || '—',
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
      canchas: CANCHAS.map((cancha) => ({ ...cancha, precio: formatoPesos.format(cancha.precio) })),
      equipos: EQUIPOS.map((equipo) => ({
        ...equipo,
        iniciales: equipo.nombre.split(/\s+/).map((palabra) => palabra[0]).join('').slice(0, 2).toUpperCase(),
      })),
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { landing, dashboard };
