// controllers/adminTorneosController.js
// Torneos en el panel (/admin/torneos), para Administrador y Administrador principal.
//  AP-027 listado con filtros y acciones por estado · TO-001 crear (nace en Borrador) · TO-003 editar según estado
//  TO-002 precio y medios de pago · TO-004 publicar · TO-005 cerrar inscripciones · fixture y resultados.

const torneoModel = require('../models/torneoModel');
const pasarelaModel = require('../models/pasarelaModel');
const { notificarIntegrantes } = require('../models/notificacionModel');
const reglas = require('../config/torneos');
const { leerListado, vistaListado, enviarCSV } = require('../config/listados');
const { idValido, leerMotivo, MSG_MOTIVO } = require('../middlewares/validadoresAdmin');

const BASE = '/admin/torneos';

const AVISOS = {
  creado: 'Torneo creado en Borrador: los jugadores todavía no lo ven. Revísalo y publícalo cuando esté listo.',
  editado: 'Cambios guardados.',
  'sin-cambios': 'No hubo cambios que guardar.',
  eliminado: 'Torneo eliminado.',
  inexistente: 'Ese torneo ya no existe.',
  publicado: 'Torneo publicado: las inscripciones están abiertas y se avisó a los capitanes de equipos que calzan con el torneo.',
  cerrado: 'Inscripciones cerradas. Se avisó a los capitanes de los equipos confirmados.',
  empezado: '¡Torneo en marcha! Ya están los partidos y se avisó a los equipos.',
  estado: 'El torneo cambió de estado mientras tanto: revisa su situación actual.',
  'no-editable': 'Un torneo finalizado o cancelado ya no se puede editar.',
  quitado: 'Equipo quitado del torneo. Se le avisó a su capitán con el motivo.',
  'con-pago': 'Ese equipo ya pagó: se gestiona con un retiro y reembolso (fase 4).',
  'con-pagos': 'El torneo tiene pagos: no se puede eliminar, solo cancelar (fase 4).',
  'sin-permiso': 'Solo el Administrador principal puede eliminar un torneo ya publicado.',
  motivo: MSG_MOTIVO,
  guardado: 'Resultado guardado.',
  penales: 'En eliminación directa no hay empates: indica quién ganó por penales.',
  goles: 'Los goles deben ser números enteros entre 0 y 99.',
  byes: 'Con una cantidad de equipos que no es 4, 8, 16 o 32 la llave necesita byes: llega con la generación del fixture (TO-007, fase 3).',
  grupos: 'La fase de grupos se sortea con la generación del fixture (TO-007, fase 3).',
  faltan: 'Aún no se alcanza el cupo mínimo de equipos confirmados.',
};

function admin(req) {
  return { id: req.usuario.id, nombre: req.usuario.nombre };
}

function aviso(req) {
  return AVISOS[req.query.aviso] || null;
}

// ---------- AP-027 · Listado ----------

const COLUMNAS_CSV = [
  { titulo: 'Nombre', valor: (t) => t.nombre },
  { titulo: 'Estado', valor: (t) => t.estadoTexto },
  { titulo: 'Formato', valor: (t) => t.formatoTexto },
  { titulo: 'Modalidad', valor: (t) => t.modalidad },
  { titulo: 'Nivel', valor: (t) => t.nivelTexto },
  { titulo: 'Recinto', valor: (t) => t.recinto },
  { titulo: 'Inicio', valor: (t) => t.fechaInicio },
  { titulo: 'Término', valor: (t) => t.fechaTermino },
  { titulo: 'Límite de inscripción', valor: (t) => t.fechaLimite },
  { titulo: 'Inscritos', valor: (t) => t.inscritos },
  { titulo: 'Cupo máximo', valor: (t) => t.cupoMax },
  { titulo: 'Precio (CLP)', valor: (t) => t.precio },
  { titulo: 'Recaudación (CLP)', valor: (t) => t.recaudado },
];

async function listar(req, res, next) {
  try {
    const estado = leerListado(req.query, torneoModel.LISTADO);
    if (req.query.formato === 'csv') {
      const { filas } = await torneoModel.listarAdmin(estado, { todo: true });
      return enviarCSV(res, 'torneos', COLUMNAS_CSV, filas);
    }
    const [{ filas, total }, cat, recintos] = await Promise.all([
      torneoModel.listarAdmin(estado), torneoModel.catalogos(), torneoModel.recintosParaTorneo(),
    ]);
    // El filtro de recinto ofrece los que tienen torneos y los activos.
    const opcionesRecinto = new Map([...cat.recintosConTorneos, ...recintos].map((r) => [String(r.id), r.nombre]));
    const aOpciones = (lista) => lista.map((x) => ({ valor: String(x.id), texto: x.nombre }));
    return res.render('admin/torneos', {
      titulo: 'Torneos',
      pagina: 'equipo',
      seccion: 'torneos',
      torneos: filas,
      formatoCLP: reglas.formatoCLP,
      listado: vistaListado(BASE, estado, torneoModel.LISTADO, total, {
        modalidad: Object.fromEntries(cat.modalidades.map((m) => [String(m.id), m.nombre])),
        nivel: Object.fromEntries(cat.niveles.map((n) => [String(n.id), n.nombre])),
        recinto: Object.fromEntries(opcionesRecinto),
      }),
      filtrosVista: [
        { clave: 'estado', etiqueta: 'Estado', tipo: 'opcion', opciones: Object.entries(reglas.ESTADOS).map(([valor, texto]) => ({ valor, texto })) },
        { clave: 'modalidad', etiqueta: 'Modalidad', tipo: 'opcion', opciones: aOpciones(cat.modalidades) },
        { clave: 'formato', etiqueta: 'Formato', tipo: 'opcion', opciones: Object.entries(reglas.FORMATOS).map(([valor, texto]) => ({ valor, texto })) },
        { clave: 'nivel', etiqueta: 'Nivel', tipo: 'opcion', opciones: aOpciones(cat.niveles) },
        { clave: 'recinto', etiqueta: 'Recinto', tipo: 'opcion', opciones: [...opcionesRecinto].map(([valor, texto]) => ({ valor, texto })) },
        { clave: 'desde', etiqueta: 'Inicio desde', tipo: 'fecha' },
        { clave: 'hasta', etiqueta: 'Inicio hasta', tipo: 'fecha' },
      ],
      aviso: aviso(req),
    });
  } catch (err) {
    return next(err);
  }
}

// ---------- Detalle ----------

async function renderDetalle(req, res, torneo, { status = 200, mensaje = null, tipoMensaje = 'exito', extra = {} } = {}) {
  const paypal = await pasarelaModel.obtener('paypal').catch(() => null);
  const tipoCambio = paypal && paypal.tipoCambio;
  return res.status(status).render('admin/torneo', {
    titulo: torneo.nombre,
    pagina: 'equipo',
    seccion: 'torneos',
    torneoAdmin: true,
    torneo,
    esPrincipal: Boolean(req.usuario.esSuperAdmin),
    // TO-002 c6: PayPal cobra en USD.
    usd: torneo.mediosPago.includes('paypal') && torneo.precio > 0 ? { monto: reglas.aUSD(torneo.precio, tipoCambio), tipoCambio } : null,
    formatoCLP: reglas.formatoCLP,
    aviso: mensaje || aviso(req),
    tipoAviso: mensaje ? tipoMensaje : 'exito',
    ...extra,
  });
}

async function detalle(req, res, next) {
  try {
    const torneo = await torneoModel.obtener(idValido(req.params.id), { admin: true });
    if (!torneo) return res.redirect(`${BASE}?aviso=inexistente`);
    return await renderDetalle(req, res, torneo);
  } catch (err) {
    return next(err);
  }
}

// ---------- TO-001 / TO-002 / TO-003 · Formulario ----------

// Campo del formulario → clave en datosFormulario.
const CAMPOS_DATOS = {
  nombre: 'nombre', descripcion: 'descripcion', reglamento: 'reglamento', premios: 'premios', formato: 'formato',
  emparejamiento: 'emparejamiento', id_modalidad: 'idModalidad', id_nivel_min: 'idNivelMin', id_nivel_max: 'idNivelMax',
  id_recinto: 'idRecinto', canchas: 'idsCanchas', fecha_inicio: 'fechaInicio', hora_inicio: 'horaInicio', fecha_termino: 'fechaTermino',
  fecha_limite_inscripcion: 'fechaLimite', cupo_min: 'cupoMin', cupo_max: 'cupoMax', min_jugadores: 'minJugadores',
  cantidad_grupos: 'cantidadGrupos', clasifican_por_grupo: 'clasificanPorGrupo', precio: 'precio', medios_pago: 'mediosPago',
};
const CAMPOS_COMPETENCIA = ['formato', 'id_modalidad', 'id_nivel_min', 'id_nivel_max'];

/** Datos del formulario a partir de un torneo guardado. */
function datosDeTorneo(t) {
  return {
    nombre: t.nombre, descripcion: t.descripcion, reglamento: t.reglamento, premios: t.premios, formato: t.formato,
    emparejamiento: t.emparejamiento, idModalidad: t.idModalidad, idNivelMin: t.idNivelMin, idNivelMax: t.idNivelMax,
    idRecinto: t.idRecinto, idsCanchas: [...t.idsCanchas].sort((a, b) => a - b), fechaInicio: t.fechaInicio, horaInicio: t.horaInicio,
    fechaTermino: t.fechaTermino, fechaLimite: t.fechaLimite, cupoMin: t.cupoMin, cupoMax: t.cupoMax, minJugadores: t.minJugadores,
    cantidadGrupos: t.cantidadGrupos, clasificanPorGrupo: t.clasificanPorGrupo, precio: t.precio, precioIngresado: String(t.precio),
    mediosPago: [...t.mediosPago].sort(), tienePatrocinadores: t.patrocinadores.length > 0, quitarPatrocinadores: [],
    patrocinadoresNuevos: [], foto: null,
  };
}

async function renderFormulario(req, res, { status = 200, torneo = null, datos = {}, erroresCampo = {} }) {
  const [cat, recintos, pasarelas, habilitadas] = await Promise.all([
    torneoModel.catalogos(), torneoModel.recintosParaTorneo(datos.idModalidad || null),
    pasarelaModel.listar(), pasarelaModel.habilitadas(),
  ]);
  const canchas = await torneoModel.canchasDeRecinto(datos.idRecinto, datos.idModalidad || null);
  const paypal = pasarelas.find((p) => p.clave === 'paypal');
  return res.status(status).render('admin/torneo-form', {
    titulo: torneo ? 'Editar torneo' : 'Crear torneo',
    pagina: 'equipo',
    seccion: 'torneos',
    torneoForm: true, // carga public/js/torneo-form.js
    torneo,
    datos,
    erroresCampo,
    errores: Object.keys(erroresCampo),
    // null = todo editable (borrador o nuevo); lista = solo esos campos (TO-003 c2)
    editables: torneo ? reglas.camposEditables(torneo.estado) : null,
    modalidades: cat.modalidades,
    niveles: cat.niveles,
    recintos,
    canchas,
    // TO-002 c4: una pasarela sin credenciales probadas o desactivada se muestra deshabilitada.
    medios: Object.entries(reglas.MEDIOS_PAGO).map(([clave, texto]) => ({
      clave, texto, habilitada: Boolean(habilitadas[clave]), pruebas: habilitadas[clave] ? habilitadas[clave].entorno === 'pruebas' : false,
    })),
    tipoCambio: paypal ? paypal.tipoCambio : null,
    formatos: reglas.FORMATOS,
    emparejamientos: reglas.EMPAREJAMIENTOS,
    limites: reglas.LIMITES,
    maxPatrocinadores: reglas.MAX_PATROCINADORES,
  });
}

/** Revisiones que necesitan la base: niveles, recinto y canchas de la modalidad, foto, patrocinadores y medios de pago. */
async function revisar(datos, erroresCampo, { torneo = null, revisarMedios = true } = {}) {
  if (datos.idNivelMin && datos.idNivelMax && !erroresCampo.id_nivel_min && !erroresCampo.id_nivel_max) {
    const niveles = await torneoModel.nivelesPorId([datos.idNivelMin, datos.idNivelMax]);
    const min = niveles.get(datos.idNivelMin);
    const max = niveles.get(datos.idNivelMax);
    if (!min) erroresCampo.id_nivel_min = 'Ese nivel no existe.';
    if (!max) erroresCampo.id_nivel_max = 'Ese nivel no existe.';
    if (min && max && min.puntaje_min > max.puntaje_min) erroresCampo.id_nivel_max = 'El nivel máximo no puede ser menor que el mínimo.';
  }
  if (datos.idRecinto && datos.idModalidad && !erroresCampo.id_recinto) {
    const recintos = await torneoModel.recintosParaTorneo(datos.idModalidad);
    if (!recintos.some((r) => r.id === datos.idRecinto)) {
      erroresCampo.id_recinto = 'Ese recinto no está activo o no tiene canchas activas de la modalidad del torneo.';
    } else if (datos.idsCanchas.length > 0) {
      const validas = new Set((await torneoModel.canchasDeRecinto(datos.idRecinto, datos.idModalidad)).map((c) => c.id));
      if (datos.idsCanchas.some((id) => !validas.has(id))) {
        erroresCampo.canchas = 'Elige canchas activas del recinto que sean de la modalidad del torneo.';
      }
    }
  }
  // Obligatoria también al editar: un torneo antiguo sin foto debe subir una para guardar.
  if (!datos.foto && !(torneo && torneo.foto) && !erroresCampo.foto) erroresCampo.foto = 'La foto del torneo es obligatoria: sube una imagen JPG, PNG o WebP.';

  const quedan = torneo ? torneo.patrocinadores.filter((p) => !datos.quitarPatrocinadores.includes(p.id)).length : 0;
  if (datos.tienePatrocinadores && quedan + datos.patrocinadoresNuevos.length === 0
      && !Object.keys(erroresCampo).some((k) => k.startsWith('patrocinador_'))) {
    erroresCampo.patrocinador_0 = 'Agrega al menos un patrocinador con su nombre y logo (o elige "No").';
  }

  if (revisarMedios && datos.mediosPago.length > 0 && !erroresCampo.medios_pago) {
    const habilitadas = await pasarelaModel.habilitadas();
    const fuera = datos.mediosPago.filter((m) => !habilitadas[m]);
    if (fuera.length > 0) {
      erroresCampo.medios_pago = `${fuera.map((m) => reglas.MEDIOS_PAGO[m]).join(' y ')} no se puede elegir: no tiene credenciales probadas o está desactivada (Configuración → Pasarelas de pago).`;
    }
  }
}

function avisoImagenes(erroresCampo, datos) {
  // El navegador no puede volver a rellenar los archivos tras un error.
  if (Object.keys(erroresCampo).length > 0 && (datos.foto || datos.patrocinadoresNuevos.length > 0)) {
    erroresCampo.reelegir = 'Vuelve a elegir la foto y los logos antes de guardar.';
  }
}

/** "Cargar canchas" sin JavaScript: vuelve a mostrar el formulario con las canchas del recinto elegido, sin guardar. */
function soloRecargar(req) {
  return req.body && req.body.accion === 'recargar';
}

async function formularioNuevo(req, res, next) {
  try {
    return await renderFormulario(req, res, { datos: { emparejamiento: 'sorteo', precioIngresado: '0', mediosPago: [] } });
  } catch (err) {
    return next(err);
  }
}

async function crear(req, res, next) {
  const datos = req.datosFormulario;
  const erroresCampo = { ...req.erroresCampo };
  try {
    if (soloRecargar(req)) return await renderFormulario(req, res, { datos, erroresCampo: datos.foto ? { reelegir: 'Vuelve a elegir la foto y los logos antes de guardar.' } : {} });
    await revisar(datos, erroresCampo);
    if (Object.keys(erroresCampo).length > 0) {
      avisoImagenes(erroresCampo, datos);
      return await renderFormulario(req, res, { status: 400, datos, erroresCampo });
    }
    const idTorneo = await torneoModel.crear(admin(req), datos, datos.foto, datos.patrocinadoresNuevos);
    return res.redirect(`${BASE}/${idTorneo}?aviso=creado`);
  } catch (err) {
    return next(err);
  }
}

async function formularioEditar(req, res, next) {
  try {
    const torneo = await torneoModel.obtener(idValido(req.params.id), { admin: true });
    if (!torneo) return res.redirect(`${BASE}?aviso=inexistente`);
    const editables = reglas.camposEditables(torneo.estado);
    if (editables && editables.length === 0) return res.redirect(`${BASE}/${torneo.id}?aviso=no-editable`);
    return await renderFormulario(req, res, { torneo, datos: datosDeTorneo(torneo) });
  } catch (err) {
    return next(err);
  }
}

/**
 * TO-003 c2 a c4 · Con el torneo publicado, los campos que el estado no deja cambiar se toman del torneo guardado;
 * si alguno llegó con otro valor, se marca el error. El cupo máximo solo se amplía y la fecha límite solo se extiende.
 */
function aplicarRestricciones(torneo, editables, datos, erroresCampo, enviados) {
  const actuales = datosDeTorneo(torneo);
  const estadoTexto = reglas.ESTADOS[torneo.estado].toLowerCase();
  Object.entries(CAMPOS_DATOS).forEach(([campo, clave]) => {
    if (editables.includes(campo)) return;
    const distinto = enviados.has(campo) && JSON.stringify(datos[clave] ?? null) !== JSON.stringify(actuales[clave] ?? null);
    delete erroresCampo[campo];
    if (distinto) {
      erroresCampo[campo] = CAMPOS_COMPETENCIA.includes(campo) && torneo.ocupados > 0
        ? `No se puede cambiar: ya hay equipos inscritos en el torneo.`
        : `Con el torneo en "${estadoTexto}" este campo no se puede cambiar.`;
    }
    datos[clave] = actuales[clave];
  });
  datos.precioIngresado = String(datos.precio);
  ['foto', 'patrocinadores'].forEach((campo) => {
    if (!editables.includes(campo) && enviados.has(campo)) erroresCampo[campo === 'foto' ? 'foto' : 'patrocinador_0'] = `Con el torneo en "${estadoTexto}" no se puede cambiar.`;
  });
  if (!editables.includes('foto')) datos.foto = null;
  datos.patrocinadoresNuevos = [];
  datos.quitarPatrocinadores = [];
  datos.tienePatrocinadores = actuales.tienePatrocinadores;
  // Con los campos fijos ya puestos, se vuelven a revisar cupos y fechas.
  ['cupo_min', 'cupo_max', 'cantidad_grupos', 'clasifican_por_grupo', 'fecha_limite_inscripcion', 'fecha_termino'].forEach((c) => {
    if (editables.includes(c) && erroresCampo[c] && !/^Indica|no es válida/.test(erroresCampo[c])) delete erroresCampo[c];
  });
  Object.entries({ ...reglas.erroresCupos(datos), ...reglas.erroresFechas({ fechaInicio: datos.fechaInicio, fechaTermino: datos.fechaTermino, fechaLimite: datos.fechaLimite }) })
    .forEach(([c, m]) => { if (editables.includes(c) && !erroresCampo[c]) erroresCampo[c] = m; });
  if (editables.includes('cupo_max') && Number.isInteger(datos.cupoMax) && !erroresCampo.cupo_max) {
    if (datos.cupoMax < torneo.ocupados) erroresCampo.cupo_max = `Ya hay ${torneo.ocupados} equipos inscritos: el cupo máximo no puede ser menor.`;
    else if (datos.cupoMax < torneo.cupoMax) erroresCampo.cupo_max = `Con inscripciones abiertas el cupo máximo solo se puede ampliar (hoy es ${torneo.cupoMax}).`;
  }
  if (editables.includes('fecha_limite_inscripcion') && datos.fechaLimite && !erroresCampo.fecha_limite_inscripcion && datos.fechaLimite < torneo.fechaLimite) {
    erroresCampo.fecha_limite_inscripcion = 'Con inscripciones abiertas la fecha límite solo se puede extender.';
  }
}

const ERRORES_EDITAR = {
  'cupo-bajo-inscritos': ['cupo_max', 'Hay más equipos inscritos que ese cupo máximo.'],
  'cupo-reducido': ['cupo_max', 'Con inscripciones abiertas el cupo máximo solo se puede ampliar.'],
  'fecha-reducida': ['fecha_limite_inscripcion', 'Con inscripciones abiertas la fecha límite solo se puede extender.'],
  'precio-con-pagos': ['precio', 'Ya hay pagos aprobados: el precio no puede cambiar para no cobrar montos distintos entre equipos.'],
};

async function editar(req, res, next) {
  const datos = req.datosFormulario;
  const erroresCampo = { ...req.erroresCampo };
  try {
    const torneo = await torneoModel.obtener(idValido(req.params.id), { admin: true });
    if (!torneo) return res.redirect(`${BASE}?aviso=inexistente`);
    const editables = reglas.camposEditables(torneo.estado);
    if (editables && editables.length === 0) return res.redirect(`${BASE}/${torneo.id}?aviso=no-editable`);
    if (soloRecargar(req)) return await renderFormulario(req, res, { torneo, datos });
    if (editables) aplicarRestricciones(torneo, editables, datos, erroresCampo, req.camposEnviados);
    await revisar(datos, erroresCampo, {
      torneo, revisarMedios: JSON.stringify(datos.mediosPago) !== JSON.stringify([...torneo.mediosPago].sort()),
    });
    if (Object.keys(erroresCampo).length > 0) {
      avisoImagenes(erroresCampo, datos);
      return await renderFormulario(req, res, { status: 400, torneo, datos, erroresCampo });
    }
    const quitar = datos.tienePatrocinadores ? datos.quitarPatrocinadores : torneo.patrocinadores.map((p) => p.id);
    const r = await torneoModel.editar(admin(req), torneo.id, torneo.estado, datos, datos.foto, datos.patrocinadoresNuevos, quitar);
    if (ERRORES_EDITAR[r.resultado]) {
      const [campo, mensaje] = ERRORES_EDITAR[r.resultado];
      return await renderFormulario(req, res, { status: 409, torneo, datos, erroresCampo: { [campo]: mensaje } });
    }
    if (r.resultado === 'no-editable' && r.campos) {
      return await renderFormulario(req, res, {
        status: 409, torneo, datos, erroresCampo: Object.fromEntries(r.campos.map((c) => [c, 'Este campo no se puede cambiar en el estado actual.'])),
      });
    }
    return res.redirect(`${BASE}/${torneo.id}?aviso=${r.resultado}`);
  } catch (err) {
    return next(err);
  }
}

/** JSON para el formulario con JavaScript: canchas activas del recinto de la modalidad elegida. */
async function canchasJSON(req, res, next) {
  try {
    const canchas = await torneoModel.canchasDeRecinto(idValido(req.query.recinto), idValido(req.query.modalidad));
    return res.json({ canchas });
  } catch (err) {
    return next(err);
  }
}

// ---------- TO-004 / TO-005 · Publicar y cerrar ----------

async function publicar(req, res, next) {
  try {
    const idTorneo = idValido(req.params.id);
    if (!idTorneo) return res.redirect(`${BASE}?aviso=inexistente`);
    const r = await torneoModel.publicar(admin(req), idTorneo, await pasarelaModel.habilitadas());
    if (r.resultado === 'publicado' || r.resultado === 'inexistente' || r.resultado === 'estado') {
      return res.redirect(`${BASE}/${idTorneo}?aviso=${r.resultado}`);
    }
    const torneo = await torneoModel.obtener(idTorneo, { admin: true });
    const mensajes = {
      incompleto: `Para publicar faltan estos datos: ${(r.faltan || []).join(', ')}. Complétalos en Editar.`,
      'sin-medios': `El torneo cuesta ${torneo.precioTexto}: habilita al menos un medio de pago antes de publicarlo (o déjalo gratuito con precio 0).`,
      'medio-inactivo': `${(r.medios || []).join(' y ')} ya no está disponible (desactivada o sin credenciales): quítala de los medios de pago o actívala en Configuración.`,
      'fecha-vencida': 'La fecha límite de inscripción ya pasó: extiéndela en Editar antes de publicar.',
    };
    return await renderDetalle(req, res, torneo, { status: 409, mensaje: mensajes[r.resultado], tipoMensaje: 'error' });
  } catch (err) {
    return next(err);
  }
}

async function cerrar(req, res, next) {
  try {
    const idTorneo = idValido(req.params.id);
    if (!idTorneo) return res.redirect(`${BASE}?aviso=inexistente`);
    const r = await torneoModel.cerrarInscripciones(admin(req), idTorneo);
    if (r.resultado !== 'faltan') return res.redirect(`${BASE}/${idTorneo}?aviso=${r.resultado}`);
    const torneo = await torneoModel.obtener(idTorneo, { admin: true });
    return await renderDetalle(req, res, torneo, {
      status: 409,
      tipoMensaje: 'error',
      mensaje: `No se pueden cerrar las inscripciones: ${r.faltan === 1 ? 'falta 1 equipo confirmado' : `faltan ${r.faltan} equipos confirmados`} para el cupo mínimo (${r.confirmados} de ${r.cupoMin}). Puedes extender la fecha límite o cancelar el torneo.`,
      extra: { ofrecerExtender: true },
    });
  } catch (err) {
    return next(err);
  }
}

async function eliminar(req, res, next) {
  try {
    const idTorneo = idValido(req.params.id);
    if (!idTorneo) return res.redirect(`${BASE}?aviso=inexistente`);
    const esPrincipal = Boolean(req.usuario.esSuperAdmin);
    const torneo = await torneoModel.obtener(idTorneo, { admin: true });
    if (!torneo) return res.redirect(`${BASE}?aviso=inexistente`);
    // Un borrador no afecta a nadie; uno publicado afecta a los capitanes inscritos: pide motivo.
    const motivo = torneo.estado === 'borrador' ? null : leerMotivo(req.body.motivo);
    if (torneo.estado !== 'borrador' && esPrincipal && !motivo) return res.redirect(`${BASE}/${idTorneo}?aviso=motivo`);
    const resultado = await torneoModel.eliminar(admin(req), idTorneo, { esPrincipal, motivo });
    return res.redirect(resultado === 'eliminado' ? `${BASE}?aviso=eliminado` : `${BASE}/${idTorneo}?aviso=${resultado}`);
  } catch (err) {
    return next(err);
  }
}

// ---------- Inscripciones, fixture y resultados ----------

async function quitarEquipo(req, res, next) {
  try {
    const idTorneo = idValido(req.params.id);
    const idEquipo = idValido(req.params.idEquipo);
    const motivo = leerMotivo(req.body.motivo);
    if (!motivo) return res.redirect(`${BASE}/${idTorneo}?aviso=motivo`);
    const resultado = idTorneo && idEquipo ? await torneoModel.quitarEquipo(admin(req), idTorneo, idEquipo, motivo) : 'inexistente';
    return res.redirect(`${BASE}/${idTorneo}?aviso=${resultado}`);
  } catch (err) {
    return next(err);
  }
}

async function empezar(req, res, next) {
  try {
    const idTorneo = idValido(req.params.id);
    if (!idTorneo) return res.redirect(`${BASE}?aviso=inexistente`);
    const { resultado, equipos } = await torneoModel.empezar(admin(req), idTorneo);
    if (resultado === 'empezado') {
      const torneo = await torneoModel.obtener(idTorneo, { admin: true });
      await Promise.all(equipos.map((idEquipo) => notificarIntegrantes(idEquipo, 'torneo',
        `¡Empezó el torneo "${torneo.nombre}"! Revisa el fixture de tu equipo.`, `/torneos/${idTorneo}`)));
    }
    return res.redirect(`${BASE}/${idTorneo}?aviso=${resultado}`);
  } catch (err) {
    return next(err);
  }
}

function goles(valor) {
  const n = Number(String(valor ?? '').trim());
  return String(valor ?? '').trim() !== '' && Number.isInteger(n) && n >= 0 && n <= 99 ? n : null;
}

async function registrarResultado(req, res, next) {
  try {
    const idTorneo = idValido(req.params.id);
    const idPartido = idValido(req.params.idPartido);
    const golesLocal = goles(req.body.goles_local);
    const golesVisita = goles(req.body.goles_visita);
    const resultado = golesLocal === null || golesVisita === null
      ? 'goles'
      : await torneoModel.registrarResultado(admin(req), idTorneo, idPartido, golesLocal, golesVisita, req.body.ganador_penales);
    return res.redirect(`${BASE}/${idTorneo}?aviso=${resultado}#partido-${idPartido}`);
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  listar, detalle, formularioNuevo, crear, formularioEditar, editar, canchasJSON, publicar, cerrar, eliminar,
  empezar, quitarEquipo, registrarResultado,
};
