const equipoFichaModel = require('../models/equipoFichaModel');
const equipoModel = require('../models/equipoModel');
const cuentaModel = require('../models/cuentaModel');
const notificacionModel = require('../models/notificacionModel');
const userModel = require('../models/userModel');
const { idValido } = require('../middlewares/validadoresAdmin');
const ubicacionModel = require('../models/ubicacionModel');
const { leerEscudo } = require('./jugadorController');
const { NIVELES } = require('../config/perfilJugador');

const AVISOS = {
  editado: 'Datos del equipo actualizados.',
  comentado: 'Comentario publicado.',
  retirado: 'Comentario retirado por moderación: ya nadie lo ve.',
  posiciones: 'Posiciones buscadas actualizadas.',
  desactivado: 'Equipo desactivado. Sus desafíos pendientes y partidos futuros se cancelaron y avisamos a los rivales.',
  reactivado: '¡Equipo reactivado con su puntaje anterior!',
  limite: 'No puedes reactivarlo: ya capitaneas el máximo de equipos activos.',
  'sin-permiso': 'Solo el capitán del equipo puede hacer eso.',
  cancelada: 'Solicitud cancelada. Puedes volver a postular cuando quieras.',
  'no-cancelada': 'Esa solicitud ya fue respondida o no es tuya.',
};

function noDisponible(res) {
  return res.status(404).render('mensaje', {
    titulo: 'Equipo no disponible',
    pagina: 'equipo',
    mensaje: 'Este equipo no existe.',
    enlace: { href: '/equipos', texto: 'Ver equipos' },
  });
}

async function renderFicha(req, res, idEquipo, { status = 200, errorComentario = null, mensaje = '' } = {}) {
  const equipo = await equipoFichaModel.obtenerFicha(idEquipo);
  if (!equipo) return noDisponible(res);
  const [relacion, plantel, historial, comentarios, posiciones, pendientes] = await Promise.all([
    equipoFichaModel.relacionConFicha(req.usuario.idAuth, equipo),
    equipoModel.listarPlantel(idEquipo),
    equipoFichaModel.historial(idEquipo),
    equipoFichaModel.listarComentarios(idEquipo),
    equipoFichaModel.posicionesDelEquipo(idEquipo),
    equipoFichaModel.pendientesDeEquipo(idEquipo),
  ]);
  const desafioPendiente = relacion.idEquipoParaDesafiar
    ? await equipoFichaModel.hayDesafioPendiente(relacion.idEquipoParaDesafiar, idEquipo)
    : false;
  return res.status(status).render('equipos/ficha', {
    titulo: equipo.nombre,
    pagina: 'equipo',
    equipo,
    relacion,
    desafioPendiente,
    plantel,
    historial,
    comentarios,
    buscadas: posiciones.filter((p) => p.buscada).map((p) => p.nombre),
    pendientes,
    largoComentario: equipoFichaModel.LARGO_MAXIMO_COMENTARIO,
    errorComentario,
    mensaje,
    aviso: AVISOS[req.query.aviso] || null,
  });
}

async function ficha(req, res, next) {
  const idEquipo = idValido(req.params.id);
  try {
    if (!idEquipo) return noDisponible(res);
    return await renderFicha(req, res, idEquipo);
  } catch (err) {
    return next(err);
  }
}

async function comentar(req, res, next) {
  const idEquipo = idValido(req.params.id);
  const mensaje = String(req.body.mensaje || '').trim().replace(/\s+\n/g, '\n');
  try {
    if (!idEquipo || !(await equipoFichaModel.obtenerFicha(idEquipo))) return noDisponible(res);
    let error = null;
    if (!mensaje) error = 'El comentario no puede estar vacío.';
    else if (mensaje.length > equipoFichaModel.LARGO_MAXIMO_COMENTARIO) {
      error = `El comentario no puede superar los ${equipoFichaModel.LARGO_MAXIMO_COMENTARIO} caracteres (tiene ${mensaje.length}).`;
    }
    if (error) return await renderFicha(req, res, idEquipo, { status: 400, errorComentario: error, mensaje });

    await equipoFichaModel.crearComentario(req.usuario.idAuth, idEquipo, mensaje);
    const equipo = await equipoFichaModel.obtenerFicha(idEquipo);
    const idAutor = await notificacionModel.idUsuarioDe(req.usuario.idAuth);
    if (idAutor !== equipo.id_usuario_creador) {
      await notificacionModel.notificarCapitan(idEquipo, 'comentario', `${req.usuario.nombre} comentó en la ficha de ${equipo.nombre}.`,
        `/equipos/${idEquipo}#comentarios`);
    }
    return res.redirect(`/equipos/${idEquipo}?aviso=comentado#comentarios`);
  } catch (err) {
    return next(err);
  }
}

async function ocultarComentario(req, res, next) {
  try {
    const idComentario = idValido(req.params.id);
    const datos = idComentario ? await equipoFichaModel.ocultarComentario(idComentario) : null;
    if (!datos) return res.redirect('/equipos');
    await notificacionModel.notificarUsuario(datos.idUsuario, 'moderacion',
      `Tu comentario en la ficha de ${datos.equipo} fue retirado por moderación por no cumplir las reglas de la comunidad.`,
      '/terminos');
    return res.redirect(`/equipos/${datos.idEquipo}?aviso=retirado#comentarios`);
  } catch (err) {
    return next(err);
  }
}

async function equipoDelCapitan(req) {
  const idEquipo = idValido(req.params.id);
  const equipo = idEquipo ? await equipoFichaModel.obtenerFicha(idEquipo) : null;
  if (!equipo) return null;
  const relacion = await equipoFichaModel.relacionConFicha(req.usuario.idAuth, equipo);
  return relacion.esCapitan ? equipo : null;
}

async function formularioPosiciones(req, res, next) {
  try {
    const equipo = await equipoDelCapitan(req);
    if (!equipo || !equipo.activo) return res.redirect(`/equipos/${idValido(req.params.id) || ''}?aviso=sin-permiso`);
    return res.render('equipos/posiciones', {
      titulo: 'Posiciones que buscamos',
      pagina: 'equipo',
      equipo,
      posiciones: await equipoFichaModel.posicionesDelEquipo(equipo.id),
    });
  } catch (err) {
    return next(err);
  }
}

/** Clave de NIVELES ('intermedio') a partir del nombre guardado en la tabla nivel ('Intermedio'). */
function claveNivel(nombre) {
  return Object.keys(NIVELES).find((clave) => NIVELES[clave].toLowerCase() === String(nombre || '').toLowerCase()) || '';
}

async function renderEditar(res, equipo, { status = 200, datos, errores = [] }) {
  return res.status(status).render('equipos/editar', {
    titulo: 'Editar equipo',
    pagina: 'equipo',
    editarEquipo: true,
    equipo,
    datos,
    errores,
    niveles: NIVELES,
    regiones: await ubicacionModel.listarRegionesConComunas(),
  });
}

async function formularioEditar(req, res, next) {
  try {
    const equipo = await equipoDelCapitan(req);
    if (!equipo || !equipo.activo) return res.redirect(`/equipos/${idValido(req.params.id) || ''}?aviso=sin-permiso`);
    const actuales = await equipoFichaModel.datosParaEditar(equipo.id);
    return await renderEditar(res, equipo, {
      datos: {
        nombre: actuales.nombre,
        correo: actuales.correo_contacto || '',
        nivel: claveNivel(actuales.nivel),
        idRegion: actuales.id_region,
        idComuna: actuales.id_comuna,
        escudo: '',
      },
    });
  } catch (err) {
    return next(err);
  }
}

async function guardarEdicion(req, res, next) {
  const datos = req.datosFormulario;
  const errores = [...req.erroresEquipo.errores];
  try {
    const equipo = await equipoDelCapitan(req);
    if (!equipo || !equipo.activo) return res.redirect(`/equipos/${idValido(req.params.id) || ''}?aviso=sin-permiso`);

    const comuna = datos.idComuna ? await ubicacionModel.obtenerComuna(datos.idComuna) : null;
    if (datos.idComuna && !comuna) errores.push('La comuna elegida no es válida.');
    // Escudo opcional: crear-equipo.js lo reduce y lo manda como data URL; vacío = se mantiene el actual.
    const escudo = leerEscudo(req.body.escudo);
    if (req.body.escudo && !escudo) errores.push('El escudo debe ser una imagen JPG, PNG o WebP de hasta 512 KB.');
    if (errores.length > 0) {
      return await renderEditar(res, equipo, { status: 400, datos: { ...datos, escudo: escudo ? req.body.escudo : '' }, errores });
    }

    const actualizado = await equipoFichaModel.actualizarDatos(req.usuario.idAuth, equipo.id, {
      ...datos, nivel: NIVELES[datos.nivel], zona: comuna.nombre,
    });
    if (!actualizado) return res.redirect(`/equipos/${equipo.id}?aviso=sin-permiso`);
    if (escudo) await equipoModel.guardarEscudo(req.usuario.idAuth, equipo.id, escudo.datos, escudo.tipo);
    return res.redirect(`/equipos/${equipo.id}?aviso=editado`);
  } catch (err) {
    return next(err);
  }
}

async function guardarPosiciones(req, res, next) {
  const idEquipo = idValido(req.params.id);
  const ids = [].concat(req.body.posicion || []).map(Number).filter((id) => Number.isInteger(id) && id > 0);
  try {
    const guardado = idEquipo && (await equipoFichaModel.guardarPosicionesBuscadas(req.usuario.idAuth, idEquipo, [...new Set(ids)]));
    return res.redirect(`/equipos/${idEquipo || ''}?aviso=${guardado ? 'posiciones' : 'sin-permiso'}`);
  } catch (err) {
    return next(err);
  }
}

async function desactivar(req, res, next) {
  const idEquipo = idValido(req.params.id);
  try {
    if (!idEquipo) return noDisponible(res);
    const { resultado, rivales } = await equipoFichaModel.desactivarEquipo(req.usuario.idAuth, idEquipo);
    if (resultado === 'desactivado') {
      const nombre = await notificacionModel.nombreEquipo(idEquipo);
      await Promise.all(rivales.map((idRival) => notificacionModel.notificarCapitan(idRival, 'equipo',
        `${nombre} se desactivó: se cancelaron sus desafíos pendientes y partidos futuros con tu equipo.`, `/desafios?equipo=${idRival}`)));
    }
    return res.redirect(`/equipos/${idEquipo}?aviso=${resultado}`);
  } catch (err) {
    return next(err);
  }
}

async function reactivar(req, res, next) {
  const idEquipo = idValido(req.params.id);
  try {
    const resultado = idEquipo ? await equipoFichaModel.reactivarEquipo(req.usuario.idAuth, idEquipo) : 'sin-permiso';
    return res.redirect(`/equipos/${idEquipo || ''}?aviso=${resultado}`);
  } catch (err) {
    return next(err);
  }
}

async function misSolicitudes(req, res, next) {
  try {
    return res.render('equipos/solicitudes', {
      titulo: 'Mis solicitudes',
      pagina: 'equipo',
      solicitudes: await equipoFichaModel.listarMisSolicitudes(req.usuario.idAuth),
      aviso: AVISOS[req.query.aviso] || null,
    });
  } catch (err) {
    return next(err);
  }
}

async function cancelarSolicitud(req, res, next) {
  try {
    const idSolicitud = idValido(req.params.id);
    const cancelada = idSolicitud && (await equipoFichaModel.cancelarSolicitud(req.usuario.idAuth, idSolicitud));
    return res.redirect(`/solicitudes?aviso=${cancelada ? 'cancelada' : 'no-cancelada'}`);
  } catch (err) {
    return next(err);
  }
}

async function renderDesactivarCuenta(req, res, { status = 200, error = null } = {}) {
  return res.status(status).render('cuenta/desactivar', {
    titulo: 'Desactivar mi cuenta',
    pagina: 'equipo',
    equiposCapitan: await cuentaModel.equiposActivosComoCapitan(req.usuario.idAuth),
    error,
  });
}

async function formularioDesactivarCuenta(req, res, next) {
  try {
    return await renderDesactivarCuenta(req, res);
  } catch (err) {
    return next(err);
  }
}

async function desactivarCuenta(req, res, next) {
  try {
    if ((await cuentaModel.equiposActivosComoCapitan(req.usuario.idAuth)).length > 0) {
      return await renderDesactivarCuenta(req, res, { status: 400, error: 'Primero desactiva los equipos que capitaneas.' });
    }
    if (req.body.confirmo !== 'si') {
      return await renderDesactivarCuenta(req, res, { status: 400, error: 'Marca la casilla para confirmar que entiendes las consecuencias.' });
    }
    if (!req.body.password_actual || !(await cuentaModel.passwordEsCorrecta(req.usuario.correo, req.body.password_actual))) {
      return await renderDesactivarCuenta(req, res, { status: 400, error: 'La contraseña no es correcta.' });
    }
    await cuentaModel.desactivarCuenta(req.usuario.idAuth);
    await userModel.cerrarSesionEnAuth(req.supabase).catch(() => {});
    return res.redirect('/login?msg=Cuenta_desactivada');
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  ficha,
  comentar,
  ocultarComentario,
  formularioPosiciones,
  guardarPosiciones,
  formularioEditar,
  guardarEdicion,
  desactivar,
  reactivar,
  misSolicitudes,
  cancelarSolicitud,
  formularioDesactivarCuenta,
  desactivarCuenta,
};
