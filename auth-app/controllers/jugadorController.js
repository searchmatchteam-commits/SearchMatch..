// controllers/jugadorController.js
// Perfil del jugador:
//  - GET/POST /perfil-jugador → wizard de 4 pasos (tipo de cuenta, datos personales,
//    perfil deportivo y confirmación). Sirve para crear y para editar el perfil.
//    Es el onboarding obligatorio: /dashboard manda aquí al jugador sin perfil completo.
//  - GET /perfil → la carta de jugador y el resumen de datos y estadísticas.
// La validación está en middlewares/validators.js (validarPerfilJugador) y
// el acceso a datos en models/jugadorModel.js.

const jugadorModel = require('../models/jugadorModel');
const { calcularEdad, ALTURA_CM, PESO_KG } = require('../middlewares/validators');
const {
  POSICIONES,
  PIES,
  NIVELES,
  ESTADISTICAS,
  sortearEstadisticas,
  calcularMedia,
} = require('../config/perfilJugador');

/**
 * Lee el perfil del usuario de la sesión. Si faltan las columnas de la
 * sección V de sql/seed.sql, deja una pista clara en la consola.
 */
async function leerPerfil(req) {
  try {
    return await jugadorModel.obtenerPerfil(req.usuario.idAuth);
  } catch (err) {
    if (err.code === jugadorModel.COLUMNA_INEXISTENTE) {
      console.error('⚠️  Faltan columnas del perfil de jugador: ejecuta la sección V de sql/seed.sql en Supabase.');
    }
    throw err;
  }
}

function renderWizard(res, { status = 200, datos, errores = [], paso = 2, editando = false }) {
  return res.status(status).render('perfil-jugador', {
    titulo: editando ? 'Editar perfil' : 'Crea tu perfil',
    pagina: 'wizard',
    datos,
    errores,
    paso,
    editando,
    catalogos: { POSICIONES, PIES, NIVELES },
    rangos: { ALTURA_CM, PESO_KG },
  });
}

// ---------------------------------------------------------------
// GET /perfil-jugador → wizard con los datos que ya tenemos
// ---------------------------------------------------------------
async function mostrarWizard(req, res, next) {
  try {
    const perfil = await leerPerfil(req);
    if (!perfil) {
      const err = new Error(`La cuenta ${req.usuario.idAuth} no tiene fila en "jugador".`);
      err.statusCode = 404;
      throw err;
    }

    return renderWizard(res, {
      editando: perfil.perfilCompleto,
      datos: {
        nombre: perfil.nombre,
        apellido: perfil.apellido,
        fechaNacimiento: perfil.fechaNacimiento,
        altura: perfil.altura ? Math.round(perfil.altura) : '',
        peso: perfil.peso ? Math.round(perfil.peso) : '',
        posicion: perfil.posicion,
        pieHabil: perfil.pieHabil,
        nivel: perfil.nivel,
      },
    });
  } catch (err) {
    return next(err);
  }
}

// ---------------------------------------------------------------
// POST /perfil-jugador → guardar y mostrar la carta
// ---------------------------------------------------------------
async function guardarWizard(req, res, next) {
  const datos = req.datosFormulario;
  const { errores, paso } = req.erroresPerfil;

  try {
    const perfil = await leerPerfil(req);
    if (!perfil) {
      const err = new Error(`La cuenta ${req.usuario.idAuth} no tiene fila en "jugador".`);
      err.statusCode = 404;
      throw err;
    }

    if (errores.length > 0) {
      // Altura y peso inválidos llegan como null: se re-pinta lo que escribió el usuario.
      return renderWizard(res, {
        status: 400,
        editando: perfil.perfilCompleto,
        errores,
        paso,
        datos: { ...datos, altura: req.body.altura || '', peso: req.body.peso || '' },
      });
    }

    // Las estadísticas se sortean solo la primera vez (el modelo conserva las existentes).
    await jugadorModel.guardarPerfil(perfil.id, datos, sortearEstadisticas());
    // Primera vez (onboarding) → al panel; si estaba editando → a su carta.
    return res.redirect(perfil.perfilCompleto ? '/perfil' : '/dashboard');
  } catch (err) {
    return next(err);
  }
}

// ---------------------------------------------------------------
// GET /perfil → carta de jugador + resumen
// ---------------------------------------------------------------
async function mostrarPerfil(req, res, next) {
  try {
    const perfil = await leerPerfil(req);
    if (!perfil || !perfil.perfilCompleto || !perfil.stats) {
      return res.redirect('/perfil-jugador');
    }

    const posicion = POSICIONES[perfil.posicion] || { etiqueta: '—', sigla: '—' };
    return res.render('perfil', {
      titulo: 'Tu carta de jugador',
      pagina: 'perfil',
      jugador: {
        nombre: perfil.nombre,
        apellido: perfil.apellido,
        nombreCompleto: `${perfil.nombre} ${perfil.apellido}`.trim(),
        edad: calcularEdad(perfil.fechaNacimiento),
        altura: perfil.altura ? Math.round(perfil.altura) : null,
        peso: perfil.peso ? Math.round(perfil.peso) : null,
        posicion,
        pieHabil: PIES[perfil.pieHabil] || '—',
        media: calcularMedia(perfil.stats),
        estadisticas: ESTADISTICAS.map(({ clave, sigla, nombre }) => ({ sigla, nombre, valor: perfil.stats[clave] })),
      },
    });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  mostrarWizard,
  guardarWizard,
  mostrarPerfil,
};
