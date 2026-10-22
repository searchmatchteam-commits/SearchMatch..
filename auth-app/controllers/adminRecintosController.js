// controllers/adminRecintosController.js
// Panel de administración de recintos, canchas y disponibilidad (Fase 2). Todas las rutas pasan
// por requireAdmin (routes/adminRoutes.js).
//  AD-011 GET  /admin/recintos                       → listado con búsqueda y filtros
//  AD-001 GET  /admin/recintos/nuevo, POST /admin/recintos
//         GET  /admin/recintos/:id                   → detalle con sus canchas
//  AD-008 GET/POST /admin/recintos/:id/editar
//  AD-004/AD-005 POST /admin/recintos/:id/(desactivar|activar)
//  AD-002 POST /admin/recintos/:id/canchas
//         GET  /admin/canchas/:id                    → detalle de la cancha con su horario
//  AD-009 POST /admin/canchas/:id/editar
//  AD-006/AD-007 POST /admin/canchas/:id/(desactivar|activar)
//  AD-003 POST /admin/canchas/:id/disponibilidad
//  AD-010 POST /admin/disponibilidad/:id/eliminar

const recintoModel = require('../models/recintoModel');
const canchaModel = require('../models/canchaModel');
const disponibilidadModel = require('../models/disponibilidadModel');
const ubicacionModel = require('../models/ubicacionModel');
const { idValido } = require('../middlewares/validadoresAdmin');
const { DIAS_SEMANA } = require('../config/canchas');

// Avisos tras cada acción (?aviso=...): solo textos fijos, nunca lo que llega en la URL.
const AVISOS = {
  'recinto-creado': 'Recinto registrado y activo. Ahora agrégale sus canchas.',
  'recinto-editado': 'Datos del recinto actualizados.',
  'recinto-desactivado': 'Recinto desactivado: sus canchas ya no se muestran a los usuarios.',
  'recinto-activado': 'Recinto activado: sus canchas activas vuelven a mostrarse.',
  'cancha-creada': 'Cancha registrada y activa.',
  'cancha-editada': 'Datos de la cancha actualizados.',
  'cancha-desactivada': 'Cancha desactivada: ya no se muestra ni se puede reservar.',
  'cancha-activada': 'Cancha activada.',
  'cancha-activada-oculta': 'Cancha activada, pero no será visible mientras su recinto esté inactivo.',
  'bloque-creado': 'Horario agregado.',
  'bloque-eliminado': 'Horario eliminado.',
  'bloque-eliminado-cerrado': 'Horario eliminado: ese día ahora aparece como cerrado.',
  'sin-cambio': 'No hubo cambios: el estado ya era ese.',
  inexistente: 'Ese elemento ya no existe.',
};

/** Resultado de un formulario con errores: lista para la alerta y objeto por campo. */
function conErrores(erroresCampo) {
  return { erroresCampo, errores: Object.values(erroresCampo) };
}

/* =====================================================================
   AD-011 · Listado
   ===================================================================== */

async function listar(req, res, next) {
  const filtros = {
    texto: String(req.query.texto || '').trim(),
    idComuna: idValido(req.query.id_comuna),
    idRegion: idValido(req.query.id_region),
    estado: ['activos', 'inactivos'].includes(req.query.estado) ? req.query.estado : '',
  };
  try {
    const [recintos, hayRecintos, regiones] = await Promise.all([
      recintoModel.listarRecintos(filtros),
      recintoModel.hayRecintos(),
      ubicacionModel.listarRegionesConComunas(),
    ]);
    return res.render('admin/recintos', {
      titulo: 'Recintos y canchas',
      pagina: 'equipo',
      seccion: 'recintos',
      recintos,
      hayRecintos,
      regiones,
      filtros,
      hayFiltros: Boolean(filtros.texto || filtros.idComuna || filtros.estado),
      aviso: AVISOS[req.query.aviso] || null,
    });
  } catch (err) {
    return next(err);
  }
}

/* =====================================================================
   AD-001 / AD-008 · Registrar y editar recinto
   ===================================================================== */

async function renderFormularioRecinto(res, { status = 200, recinto, datos, erroresCampo = {} }) {
  const regiones = await ubicacionModel.listarRegionesConComunas();
  return res.status(status).render('admin/recinto-form', {
    titulo: recinto ? `Editar ${recinto.nombre}` : 'Registrar recinto',
    pagina: 'equipo',
    seccion: 'recintos',
    recinto, // null al registrar
    datos,
    regiones,
    ...conErrores(erroresCampo),
  });
}

/** Revisa que la comuna exista y sea de la región elegida (AD-001: solo comunas de la región). */
async function revisarComuna(datos, erroresCampo) {
  if (!datos.idComuna || erroresCampo.id_comuna) return;
  const comuna = await ubicacionModel.obtenerComuna(datos.idComuna);
  if (!comuna || comuna.idRegion !== datos.idRegion) erroresCampo.id_comuna = 'Elige una comuna de la región seleccionada.';
}

// GET /admin/recintos/nuevo
async function formularioNuevo(req, res, next) {
  try {
    return await renderFormularioRecinto(res, { recinto: null, datos: {} });
  } catch (err) {
    return next(err);
  }
}

// POST /admin/recintos
async function crear(req, res, next) {
  const datos = req.datosFormulario;
  const erroresCampo = { ...req.erroresCampo };
  try {
    await revisarComuna(datos, erroresCampo);
    if (Object.keys(erroresCampo).length > 0) {
      return await renderFormularioRecinto(res, { status: 400, recinto: null, datos, erroresCampo });
    }
    const idRecinto = await recintoModel.crearRecinto(datos);
    return res.redirect(`/admin/recintos/${idRecinto}?aviso=recinto-creado`);
  } catch (err) {
    return next(err);
  }
}

// GET /admin/recintos/:id/editar  (el formulario parte con los datos guardados)
async function formularioEditar(req, res, next) {
  try {
    const recinto = await recintoModel.obtenerRecinto(idValido(req.params.id));
    if (!recinto) return res.redirect('/admin/recintos?aviso=inexistente');
    return await renderFormularioRecinto(res, {
      recinto,
      datos: {
        ...recinto,
        telefonoIngresado: recinto.telefono,
        latitudIngresada: recinto.latitud,
        longitudIngresada: recinto.longitud,
      },
    });
  } catch (err) {
    return next(err);
  }
}

// POST /admin/recintos/:id/editar
async function editar(req, res, next) {
  const idRecinto = idValido(req.params.id);
  const datos = req.datosFormulario;
  const erroresCampo = { ...req.erroresCampo };
  try {
    const recinto = await recintoModel.obtenerRecinto(idRecinto);
    if (!recinto) return res.redirect('/admin/recintos?aviso=inexistente');
    await revisarComuna(datos, erroresCampo);
    if (Object.keys(erroresCampo).length > 0) {
      return await renderFormularioRecinto(res, { status: 400, recinto, datos, erroresCampo });
    }
    await recintoModel.editarRecinto(idRecinto, datos);
    return res.redirect(`/admin/recintos/${idRecinto}?aviso=recinto-editado`);
  } catch (err) {
    return next(err);
  }
}

/* =====================================================================
   Detalle del recinto + AD-002 registrar cancha
   ===================================================================== */

async function renderDetalleRecinto(res, idRecinto, { status = 200, aviso = null, datosCancha = {}, erroresCampo = {} } = {}) {
  const [recinto, canchas, modalidades] = await Promise.all([
    recintoModel.obtenerRecinto(idRecinto),
    canchaModel.listarCanchasDeRecinto(idRecinto),
    canchaModel.listarModalidades(),
  ]);
  if (!recinto) return res.redirect('/admin/recintos?aviso=inexistente');
  return res.status(status).render('admin/recinto', {
    titulo: recinto.nombre,
    pagina: 'equipo',
    seccion: 'recintos',
    recinto,
    canchas,
    modalidades,
    datosCancha,
    ...conErrores(erroresCampo),
    aviso,
  });
}

// GET /admin/recintos/:id
async function detalle(req, res, next) {
  try {
    return await renderDetalleRecinto(res, idValido(req.params.id), { aviso: AVISOS[req.query.aviso] || null });
  } catch (err) {
    return next(err);
  }
}

// POST /admin/recintos/:id/canchas
async function crearCancha(req, res, next) {
  const idRecinto = idValido(req.params.id);
  const datos = req.datosFormulario;
  const erroresCampo = { ...req.erroresCampo };
  try {
    if (Object.keys(erroresCampo).length === 0) {
      const resultado = await canchaModel.crearCancha(idRecinto, datos);
      if (resultado === 'creada') return res.redirect(`/admin/recintos/${idRecinto}?aviso=cancha-creada`);
      if (resultado === 'inexistente') return res.redirect('/admin/recintos?aviso=inexistente');
      if (resultado === 'recinto-inactivo') erroresCampo.nombre = 'El recinto está inactivo: actívalo antes de agregar canchas.';
      if (resultado === 'nombre-repetido') erroresCampo.nombre = 'Ya existe una cancha con ese nombre en este recinto.';
    }
    return await renderDetalleRecinto(res, idRecinto, { status: 400, datosCancha: datos, erroresCampo });
  } catch (err) {
    return next(err);
  }
}

/* =====================================================================
   AD-004 / AD-005 · Desactivar y activar recinto
   ===================================================================== */

function cambiarEstadoRecinto(activo) {
  return async (req, res, next) => {
    const idRecinto = idValido(req.params.id);
    try {
      const cambio = idRecinto && (await recintoModel.cambiarEstadoRecinto(idRecinto, activo));
      const aviso = cambio ? (activo ? 'recinto-activado' : 'recinto-desactivado') : 'sin-cambio';
      return res.redirect(`/admin/recintos/${idRecinto}?aviso=${aviso}`);
    } catch (err) {
      return next(err);
    }
  };
}

/* =====================================================================
   Detalle de la cancha · AD-009 editar · AD-006/AD-007 estado · AD-003/AD-010 horario
   ===================================================================== */

async function renderDetalleCancha(res, idCancha, opciones = {}) {
  const { status = 200, aviso = null, datos = null, erroresCampo = {}, advertencia = null,
    datosBloque = {}, erroresBloque = {} } = opciones;
  const [cancha, modalidades, bloques] = await Promise.all([
    canchaModel.obtenerCanchaAdmin(idCancha),
    canchaModel.listarModalidades(),
    disponibilidadModel.listarBloques(idCancha),
  ]);
  if (!cancha) return res.redirect('/admin/recintos?aviso=inexistente');
  // Horario agrupado por día: los días sin bloques se muestran "Cerrado".
  const horario = DIAS_SEMANA.map((dia) => ({ ...dia, bloques: bloques.filter((b) => b.dia === dia.clave) }));
  return res.status(status).render('admin/cancha', {
    titulo: cancha.nombre,
    pagina: 'equipo',
    seccion: 'recintos',
    cancha,
    modalidades,
    horario,
    dias: DIAS_SEMANA,
    // Sin "datos" el formulario muestra lo guardado (salir sin guardar no cambia nada).
    datos: datos || { nombre: cancha.nombre, precioIngresado: String(Math.round(cancha.precio)), idModalidad: cancha.id_modalidad },
    advertencia,
    datosBloque,
    erroresBloque,
    ...conErrores(erroresCampo),
    aviso,
  });
}

// GET /admin/canchas/:id
async function detalleCancha(req, res, next) {
  try {
    return await renderDetalleCancha(res, idValido(req.params.id), { aviso: AVISOS[req.query.aviso] || null });
  } catch (err) {
    return next(err);
  }
}

// POST /admin/canchas/:id/editar
async function editarCancha(req, res, next) {
  const idCancha = idValido(req.params.id);
  const datos = req.datosFormulario;
  const erroresCampo = { ...req.erroresCampo };
  try {
    const cancha = await canchaModel.obtenerCanchaAdmin(idCancha);
    if (!cancha) return res.redirect('/admin/recintos?aviso=inexistente');
    if (Object.keys(erroresCampo).length > 0) return await renderDetalleCancha(res, idCancha, { status: 400, datos, erroresCampo });

    // AD-009: si cambia la modalidad y hay partidos futuros en la cancha, primero se advierte.
    if (datos.idModalidad !== cancha.id_modalidad && !datos.confirmado) {
      const afectados = await canchaModel.contarPartidosFuturosOtraModalidad(idCancha, datos.idModalidad);
      if (afectados > 0) {
        return await renderDetalleCancha(res, idCancha, {
          datos,
          advertencia: `Hay ${afectados} ${afectados === 1 ? 'partido futuro programado' : 'partidos futuros programados'} `
            + 'en esta cancha con la modalidad actual. Si la cambias, revisa esos partidos con sus capitanes.',
        });
      }
    }

    const resultado = await canchaModel.editarCancha(idCancha, datos);
    if (resultado === 'nombre-repetido') {
      return await renderDetalleCancha(res, idCancha, {
        status: 400, datos, erroresCampo: { nombre: 'Ya existe otra cancha con ese nombre en este recinto.' },
      });
    }
    return res.redirect(`/admin/canchas/${idCancha}?aviso=cancha-editada`);
  } catch (err) {
    return next(err);
  }
}

function cambiarEstadoCancha(activo) {
  return async (req, res, next) => {
    const idCancha = idValido(req.params.id);
    try {
      const cancha = idCancha && (await canchaModel.obtenerCanchaAdmin(idCancha));
      if (!cancha) return res.redirect('/admin/recintos?aviso=inexistente');
      const cambio = await canchaModel.cambiarEstadoCancha(idCancha, activo);
      let aviso = 'sin-cambio';
      if (cambio && !activo) aviso = 'cancha-desactivada';
      // AD-007: se informa si no será visible porque su recinto está inactivo.
      if (cambio && activo) aviso = cancha.recinto_activo ? 'cancha-activada' : 'cancha-activada-oculta';
      return res.redirect(`/admin/canchas/${idCancha}?aviso=${aviso}`);
    } catch (err) {
      return next(err);
    }
  };
}

// POST /admin/canchas/:id/disponibilidad
async function crearBloque(req, res, next) {
  const idCancha = idValido(req.params.id);
  const datos = req.datosFormulario;
  const erroresBloque = { ...req.erroresCampo };
  try {
    if (!(await canchaModel.obtenerCanchaAdmin(idCancha))) return res.redirect('/admin/recintos?aviso=inexistente');
    if (Object.keys(erroresBloque).length === 0) {
      const resultado = await disponibilidadModel.crearBloque(idCancha, datos);
      if (resultado === 'creado') return res.redirect(`/admin/canchas/${idCancha}?aviso=bloque-creado#horario`);
      erroresBloque.apertura = 'Ese horario se superpone con otro bloque del mismo día.';
    }
    return await renderDetalleCancha(res, idCancha, { status: 400, datosBloque: datos, erroresBloque });
  } catch (err) {
    return next(err);
  }
}

// POST /admin/disponibilidad/:id/eliminar
async function eliminarBloque(req, res, next) {
  try {
    const idBloque = idValido(req.params.id);
    const resultado = idBloque && (await disponibilidadModel.eliminarBloque(idBloque));
    if (!resultado) return res.redirect('/admin/recintos?aviso=inexistente');
    // AD-010: si era el único bloque del día, se avisa que ese día quedó cerrado.
    const aviso = resultado.diaCerrado ? 'bloque-eliminado-cerrado' : 'bloque-eliminado';
    return res.redirect(`/admin/canchas/${resultado.idCancha}?aviso=${aviso}#horario`);
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  listar,
  formularioNuevo,
  crear,
  formularioEditar,
  editar,
  detalle,
  crearCancha,
  desactivarRecinto: cambiarEstadoRecinto(false),
  activarRecinto: cambiarEstadoRecinto(true),
  detalleCancha,
  editarCancha,
  desactivarCancha: cambiarEstadoCancha(false),
  activarCancha: cambiarEstadoCancha(true),
  crearBloque,
  eliminarBloque,
};
