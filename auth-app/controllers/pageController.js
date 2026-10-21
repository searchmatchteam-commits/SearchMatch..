// controllers/pageController.js
// Lógica de las páginas del sitio.

const jugadorModel = require('../models/jugadorModel');
const equipoModel = require('../models/equipoModel');
const { POSICIONES, ESTADISTICAS, calcularMedia, nombreEnCarta } = require('../config/perfilJugador');

// GET / → landing page pública.
function landing(req, res) {
  res.render('index', {
    titulo: 'Encuentra tu partido, arma tu equipo',
    pagina: 'landing',
  });
}

/**
 * Perfil del jugador para el dashboard (null si no es jugador).
 * Si la base de datos falla, el dashboard se muestra igual, sin el resumen.
 */
async function leerPerfilJugador(usuario) {
  if (usuario.rolInicio !== 'jugador') return null;
  return jugadorModel.obtenerPerfil(usuario.idAuth).catch((err) => {
    console.error('⚠️  No se pudo leer la carta para el dashboard:', err.message);
    return null;
  });
}

/**
 * Equipo de la cuenta del rol "equipo" (capitán o integrante, vía equipo_jugador),
 * para que el dashboard diga "Ir a <nombre>" o "Crear mi equipo".
 * Si la base falla se asume que lo tiene, sin nombre (/mi-equipo igual manda
 * a crear uno si no existe).
 * @returns {Promise<{nombre: string|null}|null>}
 */
async function leerMiEquipo(usuario) {
  if (usuario.rolInicio !== 'equipo') return null;
  return equipoModel.obtenerMiEquipo(usuario.idAuth).catch((err) => {
    console.error('⚠️  No se pudo leer el equipo para el dashboard:', err.message);
    return { nombre: null };
  });
}

/** Resumen de la carta para el saludo del dashboard (solo jugadores con perfil completo). */
function resumenCarta(perfil) {
  if (!perfil || !perfil.perfilCompleto || !perfil.stats) return null;
  return {
    nombre: nombreEnCarta(perfil), // apodo si tiene
    media: calcularMedia(perfil.stats),
    posicion: POSICIONES[perfil.posicion] ? POSICIONES[perfil.posicion].sigla : '—',
    // Barras de estadísticas del panel, en el orden de la carta
    stats: ESTADISTICAS.map(({ clave, sigla, nombre }) => ({ sigla, nombre, valor: Number(perfil.stats[clave]) || 0 })),
  };
}

// GET /dashboard → página protegida.
// El middleware requireAuth (aplicado en la ruta) ya garantiza que hay sesión.
// Onboarding obligatorio: el jugador sin perfil completo va primero al wizard.
async function dashboard(req, res, next) {
  try {
    const [perfil, miEquipo] = await Promise.all([leerPerfilJugador(req.usuario), leerMiEquipo(req.usuario)]);
    if (perfil && !perfil.perfilCompleto) return res.redirect('/perfil-jugador');

    res.render('dashboard', {
      titulo: 'Mi panel',
      pagina: 'dashboard',
      carta: resumenCarta(perfil),
      miEquipo,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { landing, dashboard };
