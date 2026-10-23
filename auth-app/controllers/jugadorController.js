// controllers/jugadorController.js
// Perfil del jugador:
//  - GET/POST /perfil-jugador → wizard (tipo de cuenta, datos personales, perfil deportivo, rol,
//    [crear equipo, solo capitán] y confirmación). Solo crea el perfil: es el onboarding obligatorio
//    (/dashboard manda aquí al jugador sin perfil completo). Con el perfil listo → /perfil/editar.
//    Jugador → /dashboard. Capitán → además crea su equipo (con escudo) y entra a /mi-equipo.
//  - GET /perfil → la carta de jugador y el resumen de datos y estadísticas.
//  - GET/POST /perfil/editar → editor: datos, perfil deportivo, estadísticas y foto.
//  - GET /perfil/foto, POST /perfil/foto y POST /perfil/foto/eliminar → la foto de la carta.
// La validación está en middlewares/validators.js (validarPerfilJugador, validarEdicionPerfil) y
// el acceso a datos en models/jugadorModel.js.

const jugadorModel = require('../models/jugadorModel');
const equipoModel = require('../models/equipoModel');
const ubicacionModel = require('../models/ubicacionModel');
const userModel = require('../models/userModel');
const { calcularEdad, ALTURA_CM, PESO_KG } = require('../middlewares/validators');
const {
  POSICIONES,
  NIVELES,
  ESTADISTICAS,
  STAT_RANGO,
  sortearEstadisticas,
  calcularMedia,
  nombreEnCarta,
  urlFoto,
} = require('../config/perfilJugador');
const { MODALIDADES, DETALLE_NIVEL, BARRAS_NIVEL, MAX_EQUIPOS_COMO_CAPITAN } = require('../config/equipo');

// Escudo del paso "Crear equipo": wizard.js lo reduce y lo manda como data URL en el campo "escudo".
const REGEX_ESCUDO = /^data:image\/(?:png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/;
const ESCUDO_MAXIMO_BYTES = 512 * 1024;

/**
 * Lee el perfil del usuario de la sesión. Si faltan las columnas de las
 * secciones V, X e Y de sql/seed.sql, deja una pista clara en la consola.
 */
async function leerPerfil(req) {
  try {
    return await jugadorModel.obtenerPerfil(req.usuario.idAuth);
  } catch (err) {
    if (err.code === jugadorModel.COLUMNA_INEXISTENTE) {
      console.error('⚠️  Faltan columnas del perfil de jugador: ejecuta las secciones V, X e Y de sql/seed.sql en Supabase.');
    }
    throw err;
  }
}

/** Lee el perfil y falla con 404 si la cuenta no tiene fila en "jugador". */
async function leerPerfilObligatorio(req) {
  const perfil = await leerPerfil(req);
  if (!perfil) {
    const err = new Error(`La cuenta ${req.usuario.idAuth} no tiene fila en "jugador".`);
    err.statusCode = 404;
    throw err;
  }
  return perfil;
}

async function renderWizard(req, res, { status = 200, datos, errores = [], paso = 2 }) {
  // Paso "Crear equipo": regiones y comunas, y si la cuenta aún puede ser capitán de un equipo nuevo.
  const [regiones, equiposComoCapitan] = await Promise.all([
    ubicacionModel.listarRegionesConComunas(),
    equipoModel.contarEquiposDeCapitan(req.usuario.idAuth),
  ]);
  return res.status(status).render('perfil-jugador', {
    titulo: 'Crea tu perfil',
    pagina: 'wizard',
    datos,
    errores,
    paso,
    regiones,
    puedeSerCapitan: equiposComoCapitan < MAX_EQUIPOS_COMO_CAPITAN,
    catalogos: { POSICIONES, NIVELES, MODALIDADES, DETALLE_NIVEL, BARRAS_NIVEL },
    rangos: { ALTURA_CM, PESO_KG },
  });
}

/**
 * Escudo enviado por el wizard (data URL en PNG, JPEG o WebP), comprobado por sus primeros bytes.
 * @returns {{datos: Buffer, tipo: string}|null} null si no viene o no es una imagen válida.
 */
function leerEscudo(valor) {
  const coincidencia = REGEX_ESCUDO.exec(String(valor || ''));
  if (!coincidencia) return null;
  const datos = Buffer.from(coincidencia[1], 'base64');
  const tipo = detectarTipoImagen(datos);
  return tipo && datos.length <= ESCUDO_MAXIMO_BYTES ? { datos, tipo } : null;
}

// ---------------------------------------------------------------
// GET /perfil-jugador → wizard (solo para crear el perfil)
// ---------------------------------------------------------------
async function mostrarWizard(req, res, next) {
  try {
    const perfil = await leerPerfilObligatorio(req);
    if (perfil.perfilCompleto) return res.redirect('/perfil/editar');

    return await renderWizard(req, res, {
      datos: {
        apodo: perfil.apodo,
        fechaNacimiento: perfil.fechaNacimiento,
        altura: perfil.altura ? Math.round(perfil.altura) : '',
        peso: perfil.peso ? Math.round(perfil.peso) : '',
        posiciones: perfil.posiciones,
        rol: null,
        equipo: null,
      },
    });
  } catch (err) {
    return next(err);
  }
}

// ---------------------------------------------------------------
// POST /perfil-jugador → guardar y entrar al panel
//   jugador → /dashboard · capitán → crea su equipo y entra a /mi-equipo
// ---------------------------------------------------------------
async function guardarWizard(req, res, next) {
  const datos = req.datosFormulario;
  const errores = [...req.erroresPerfil.errores];
  // Paso al que se vuelve: el primero con error (Infinity = ninguno todavía)
  let pasoConError = errores.length > 0 ? req.erroresPerfil.paso : Infinity;

  try {
    const perfil = await leerPerfilObligatorio(req);
    if (perfil.perfilCompleto) return res.redirect('/perfil/editar');

    // Capitán: la comuna debe existir (de ella sale la zona) y la cuenta no puede pasar el límite de equipos.
    let comuna = null;
    if (datos.equipo) {
      comuna = datos.equipo.idComuna ? await ubicacionModel.obtenerComuna(datos.equipo.idComuna) : null;
      if (datos.equipo.idComuna && !comuna) {
        errores.push('La comuna elegida no es válida.');
        pasoConError = Math.min(pasoConError, 5);
      }
      if ((await equipoModel.contarEquiposDeCapitan(req.usuario.idAuth)) >= MAX_EQUIPOS_COMO_CAPITAN) {
        errores.push('Ya eres capitán de un equipo: continúa como jugador.');
        pasoConError = Math.min(pasoConError, 4);
      }
    }

    if (errores.length > 0) {
      // Altura y peso inválidos llegan como null: se re-pinta lo que escribió el usuario.
      // El escudo vuelve tal cual (data URL) para no tener que elegirlo otra vez.
      return await renderWizard(req, res, {
        status: 400,
        errores,
        paso: pasoConError,
        datos: {
          ...datos,
          altura: req.body.altura || '',
          peso: req.body.peso || '',
          escudo: leerEscudo(req.body.escudo) ? req.body.escudo : '',
        },
      });
    }

    await jugadorModel.guardarPerfil(perfil.id, datos, sortearEstadisticas());
    if (!datos.equipo) return res.redirect('/dashboard');

    // El rol "equipo" hace que el panel y el menú sean los del capitán (ROLES_INICIO).
    const { error } = await userModel.guardarRolInicio(req.supabase, 'equipo');
    if (error) console.error('⚠️  No se pudo guardar el rol de capitán:', error.code, error.message);

    try {
      const equipo = await equipoModel.crearEquipo(req.usuario.idAuth, {
        ...datos.equipo,
        correo: req.usuario.correo,
        zona: comuna.nombre,
      });
      const escudo = leerEscudo(req.body.escudo);
      if (escudo) {
        await equipoModel.guardarEscudo(req.usuario.idAuth, equipo.id, escudo.datos, escudo.tipo).catch((err) => {
          console.error('⚠️  No se pudo guardar el escudo del equipo nuevo:', err.message);
        });
      }
    } catch (err) {
      // El perfil ya quedó guardado: el equipo se puede crear desde su propio formulario.
      console.error('⚠️  No se pudo crear el equipo desde el wizard:', err.message);
      return res.redirect('/crear-equipo');
    }
    return res.redirect('/mi-equipo');
  } catch (err) {
    return next(err);
  }
}

/**
 * Datos de la carta y del resumen (views/partials/carta-jugador.ejs y perfil-resumen.ejs).
 * Sin estadísticas (perfil a medias) la media y las barras muestran "—".
 * @param {object} perfil - De jugadorModel.obtenerPerfil / obtenerPerfilPorId.
 * @param {string|null} foto - URL de la foto o null.
 */
function jugadorParaVista(perfil, foto) {
  const posicion = POSICIONES[perfil.posicion] || { etiqueta: '—', sigla: '—' };
  const posiciones = perfil.posiciones.map((clave) => POSICIONES[clave].etiqueta);
  return {
    // La carta muestra el apodo (los perfiles antiguos sin apodo, el nombre)
    nombre: nombreEnCarta(perfil),
    apodo: perfil.apodo || '—',
    nombreCompleto: `${perfil.nombre} ${perfil.apellido}`.trim(),
    edad: calcularEdad(perfil.fechaNacimiento),
    altura: perfil.altura ? Math.round(perfil.altura) : null,
    peso: perfil.peso ? Math.round(perfil.peso) : null,
    posicion,
    posiciones: posiciones.length > 0 ? posiciones.join(', ') : '—',
    media: perfil.stats ? calcularMedia(perfil.stats) : '—',
    estadisticas: ESTADISTICAS.map(({ clave, sigla, nombre }) => ({ sigla, nombre, valor: perfil.stats ? perfil.stats[clave] : '—' })),
    foto,
  };
}

// ---------------------------------------------------------------
// GET /perfil → carta de jugador + resumen
//   Si la cuenta capitanea un equipo, arriba van las pestañas "Mi carta" / "Mi equipo".
// ---------------------------------------------------------------
async function mostrarPerfil(req, res, next) {
  try {
    const [perfil, equiposComoCapitan] = await Promise.all([
      leerPerfil(req),
      equipoModel.contarEquiposDeCapitan(req.usuario.idAuth),
    ]);
    if (!perfil || !perfil.perfilCompleto || !perfil.stats) {
      return res.redirect('/perfil-jugador');
    }

    return res.render('perfil', {
      titulo: 'Tu carta de jugador',
      pagina: 'perfil',
      jugador: jugadorParaVista(perfil, urlFoto(perfil)),
      esCapitan: equiposComoCapitan > 0,
    });
  } catch (err) {
    return next(err);
  }
}

function renderEditor(res, { status = 200, perfil, datos, errores = [] }) {
  // La carta muestra la posición principal: la primera marcada
  const posicion = POSICIONES[datos.posiciones[0]] || { sigla: '—' };
  return res.status(status).render('editar-perfil', {
    titulo: 'Editar perfil',
    pagina: 'perfil',
    editorPerfil: true,
    datos,
    errores,
    catalogos: { POSICIONES },
    rangos: { ALTURA_CM, PESO_KG, STAT: STAT_RANGO },
    // Carta de vista previa: editar-perfil.js la actualiza mientras el jugador cambia el formulario
    jugador: {
      nombre: datos.apodo || '—', // solo el apodo (obligatorio al guardar)
      media: calcularMedia(datos.stats),
      posicion,
      estadisticas: ESTADISTICAS.map(({ clave, sigla, nombre }) => ({ clave, sigla, nombre, valor: datos.stats[clave] })),
      foto: urlFoto(perfil),
    },
  });
}

// ---------------------------------------------------------------
// GET /perfil/editar → editor con los datos actuales
// ---------------------------------------------------------------
async function mostrarEditor(req, res, next) {
  try {
    const perfil = await leerPerfil(req);
    if (!perfil || !perfil.perfilCompleto || !perfil.stats) return res.redirect('/perfil-jugador');

    return renderEditor(res, {
      perfil,
      datos: {
        apodo: perfil.apodo,
        fechaNacimiento: perfil.fechaNacimiento,
        altura: perfil.altura ? Math.round(perfil.altura) : '',
        peso: perfil.peso ? Math.round(perfil.peso) : '',
        posiciones: perfil.posiciones,
        stats: perfil.stats,
      },
    });
  } catch (err) {
    return next(err);
  }
}

// ---------------------------------------------------------------
// POST /perfil/editar → guardar datos y estadísticas y volver a la carta
// ---------------------------------------------------------------
async function guardarEditor(req, res, next) {
  const datos = req.datosFormulario;
  const { errores } = req.erroresPerfil;

  try {
    const perfil = await leerPerfil(req);
    if (!perfil || !perfil.perfilCompleto || !perfil.stats) return res.redirect('/perfil-jugador');

    if (errores.length > 0) {
      // Lo inválido llega como null: altura y peso se re-pintan como los escribió.
      // CORRECCIÓN: regla 8 — las estadísticas son siempre las guardadas.
      return renderEditor(res, {
        status: 400,
        perfil,
        errores,
        datos: { ...datos, altura: req.body.altura || '', peso: req.body.peso || '', stats: perfil.stats },
      });
    }

    // CORRECCIÓN: regla 8 — se guardan las estadísticas que ya tenía, no las del formulario.
    await jugadorModel.actualizarPerfil(perfil.id, datos, perfil.stats);
    return res.redirect('/perfil');
  } catch (err) {
    return next(err);
  }
}

/**
 * Tipo real de la imagen según sus primeros bytes (no se confía en el Content-Type).
 * @returns {'image/jpeg'|'image/png'|'image/webp'|null}
 */
function detectarTipoImagen(buffer) {
  if (buffer.length < 12) return null;
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}

// ---------------------------------------------------------------
// POST /perfil/foto → guarda la foto (cuerpo = la imagen; la envía editar-perfil.js)
// ---------------------------------------------------------------
async function subirFoto(req, res, next) {
  try {
    const tipo = Buffer.isBuffer(req.body) ? detectarTipoImagen(req.body) : null;
    if (!tipo) return res.status(400).json({ ok: false, mensaje: 'Elige una imagen JPG, PNG o WebP.' });

    const perfil = await leerPerfilObligatorio(req);
    await jugadorModel.guardarFoto(perfil.id, req.body, tipo);
    return res.json({ ok: true });
  } catch (err) {
    return next(err);
  }
}

// ---------------------------------------------------------------
// POST /perfil/foto/eliminar → la carta vuelve a la silueta
// ---------------------------------------------------------------
async function eliminarFoto(req, res, next) {
  try {
    const perfil = await leerPerfilObligatorio(req);
    await jugadorModel.eliminarFoto(perfil.id);
    return res.json({ ok: true });
  } catch (err) {
    return next(err);
  }
}

// ---------------------------------------------------------------
// GET /jugadores/:id/foto → la foto de la carta de un jugador (las cartas del plantel en /mi-equipo).
// La carta es pública dentro de la app ("Así te verán otros jugadores"): basta con tener sesión.
// ---------------------------------------------------------------
async function servirFotoJugador(req, res, next) {
  const idJugador = Number(req.params.id);
  try {
    const foto = Number.isInteger(idJugador) && idJugador > 0 ? await jugadorModel.obtenerFotoPorId(idJugador) : null;
    if (!foto) return next();

    res.set({
      'Content-Type': foto.tipo,
      'Cache-Control': 'private, max-age=31536000',
      'X-Content-Type-Options': 'nosniff',
    });
    return res.send(foto.datos);
  } catch (err) {
    return next(err);
  }
}

// ---------------------------------------------------------------
// GET /perfil/foto → la foto del jugador de la sesión (404 si no tiene)
// ---------------------------------------------------------------
async function servirFoto(req, res, next) {
  try {
    const foto = await jugadorModel.obtenerFoto(req.usuario.idAuth);
    if (!foto) return next();

    // La URL lleva ?v=<versión>: el navegador puede guardarla mucho tiempo (solo él, no proxies).
    res.set({
      'Content-Type': foto.tipo,
      'Cache-Control': 'private, max-age=31536000',
      'X-Content-Type-Options': 'nosniff',
    });
    return res.send(foto.datos);
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  mostrarWizard,
  guardarWizard,
  mostrarPerfil,
  mostrarEditor,
  guardarEditor,
  subirFoto,
  eliminarFoto,
  servirFoto,
  servirFotoJugador,
  jugadorParaVista,
  detectarTipoImagen,
};
