const jugadorModel = require('../models/jugadorModel');
const { calcularEdad, ALTURA_CM, PESO_KG } = require('../middlewares/validators');
const {
  POSICIONES,
  ESTADISTICAS,
  STAT_RANGO,
  sortearEstadisticas,
  calcularMedia,
  nombreEnCarta,
  urlFoto,
} = require('../config/perfilJugador');

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

async function leerPerfilObligatorio(req) {
  const perfil = await leerPerfil(req);
  if (!perfil) {
    const err = new Error(`La cuenta ${req.usuario.idAuth} no tiene fila en "jugador".`);
    err.statusCode = 404;
    throw err;
  }
  return perfil;
}

function renderWizard(res, { status = 200, datos, errores = [], paso = 2 }) {
  return res.status(status).render('perfil-jugador', {
    titulo: 'Crea tu perfil',
    pagina: 'wizard',
    datos,
    errores,
    paso,
    catalogos: { POSICIONES },
    rangos: { ALTURA_CM, PESO_KG },
  });
}

async function mostrarWizard(req, res, next) {
  try {
    const perfil = await leerPerfilObligatorio(req);
    if (perfil.perfilCompleto) return res.redirect('/perfil/editar');

    return renderWizard(res, {
      datos: {
        apodo: perfil.apodo,
        fechaNacimiento: perfil.fechaNacimiento,
        altura: perfil.altura ? Math.round(perfil.altura) : '',
        peso: perfil.peso ? Math.round(perfil.peso) : '',
        posiciones: perfil.posiciones,
      },
    });
  } catch (err) {
    return next(err);
  }
}

async function guardarWizard(req, res, next) {
  const datos = req.datosFormulario;
  const { errores, paso } = req.erroresPerfil;

  try {
    const perfil = await leerPerfilObligatorio(req);
    if (perfil.perfilCompleto) return res.redirect('/perfil/editar');

    if (errores.length > 0) {
      return renderWizard(res, {
        status: 400,
        errores,
        paso,
        datos: { ...datos, altura: req.body.altura || '', peso: req.body.peso || '' },
      });
    }

    await jugadorModel.guardarPerfil(perfil.id, datos, sortearEstadisticas());
    return res.redirect('/dashboard');
  } catch (err) {
    return next(err);
  }
}

function jugadorParaVista(perfil, foto) {
  const posicion = POSICIONES[perfil.posicion] || { etiqueta: '—', sigla: '—' };
  const posiciones = perfil.posiciones.map((clave) => POSICIONES[clave].etiqueta);
  return {
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

async function mostrarPerfil(req, res, next) {
  try {
    const perfil = await leerPerfil(req);
    if (!perfil || !perfil.perfilCompleto || !perfil.stats) {
      return res.redirect('/perfil-jugador');
    }

    return res.render('perfil', {
      titulo: 'Tu carta de jugador',
      pagina: 'perfil',
      jugador: jugadorParaVista(perfil, urlFoto(perfil)),
    });
  } catch (err) {
    return next(err);
  }
}

function renderEditor(res, { status = 200, perfil, datos, errores = [] }) {
  const posicion = POSICIONES[datos.posiciones[0]] || { sigla: '—' };
  return res.status(status).render('editar-perfil', {
    titulo: 'Editar perfil',
    pagina: 'perfil',
    editorPerfil: true,
    datos,
    errores,
    catalogos: { POSICIONES },
    rangos: { ALTURA_CM, PESO_KG, STAT: STAT_RANGO },
    jugador: {
      nombre: datos.apodo || '—',
      media: calcularMedia(datos.stats),
      posicion,
      estadisticas: ESTADISTICAS.map(({ clave, sigla, nombre }) => ({ clave, sigla, nombre, valor: datos.stats[clave] })),
      foto: urlFoto(perfil),
    },
  });
}

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

async function guardarEditor(req, res, next) {
  const datos = req.datosFormulario;
  const { errores } = req.erroresPerfil;

  try {
    const perfil = await leerPerfil(req);
    if (!perfil || !perfil.perfilCompleto || !perfil.stats) return res.redirect('/perfil-jugador');

    if (errores.length > 0) {
      return renderEditor(res, {
        status: 400,
        perfil,
        errores,
        datos: { ...datos, altura: req.body.altura || '', peso: req.body.peso || '', stats: perfil.stats },
      });
    }

    await jugadorModel.actualizarPerfil(perfil.id, datos, perfil.stats);
    return res.redirect('/perfil');
  } catch (err) {
    return next(err);
  }
}

function detectarTipoImagen(buffer) {
  if (buffer.length < 12) return null;
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}

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

async function eliminarFoto(req, res, next) {
  try {
    const perfil = await leerPerfilObligatorio(req);
    await jugadorModel.eliminarFoto(perfil.id);
    return res.json({ ok: true });
  } catch (err) {
    return next(err);
  }
}

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

async function servirFoto(req, res, next) {
  try {
    const foto = await jugadorModel.obtenerFoto(req.usuario.idAuth);
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
