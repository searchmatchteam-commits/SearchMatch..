// controllers/adminPanelController.js
// Portada del panel (Resumen), registro de actividad (AP-032), avisos para el administrador y
// páginas de las secciones que llegan en fases siguientes.

const superAdminModel = require('../models/superAdminModel');
const actividad = require('../models/actividadModel');
const alertaModel = require('../models/alertaModel');
const notificacionModel = require('../models/notificacionModel');
const { SECCIONES } = require('../config/panel');
const { leerListado, vistaListado, enviarCSV } = require('../config/listados');
const { idValido } = require('../middlewares/validadoresAdmin');

const AVISOS = {
  traspasado: 'Traspasaste el rol de Administrador principal. Ahora eres administrador.',
};

async function resumen(req, res, next) {
  try {
    const [cifras, alertas, avisos] = await Promise.all([
      superAdminModel.resumen(),
      alertaModel.listar(),
      notificacionModel.listar(req.usuario.idAuth),
    ]);
    return res.render('admin/resumen', {
      titulo: 'Resumen',
      pagina: 'equipo',
      seccion: 'resumen',
      cifras,
      alertas,
      avisos: avisos.filter((a) => !a.leida).slice(0, 10),
      aviso: AVISOS[req.query.aviso] || null,
    });
  } catch (err) {
    return next(err);
  }
}

/** Abre un aviso dirigido al administrador: lo marca como leído y va a su enlace (solo rutas internas). */
async function abrirAviso(req, res, next) {
  try {
    const id = idValido(req.params.id);
    const aviso = id ? await notificacionModel.abrir(req.usuario.idAuth, id) : null;
    const enlace = aviso && aviso.enlace && /^\/(?!\/)/.test(aviso.enlace) ? aviso.enlace : '/admin';
    return res.redirect(enlace);
  } catch (err) {
    return next(err);
  }
}

const COLUMNAS_ACTIVIDAD = [
  { titulo: 'Fecha', valor: (e) => e.fecha },
  { titulo: 'Administrador', valor: (e) => e.admin },
  { titulo: 'Sección', valor: (e) => e.seccionTexto },
  { titulo: 'Acción', valor: (e) => e.accion },
  { titulo: 'Elemento', valor: (e) => e.elemento },
  { titulo: 'Motivo', valor: (e) => e.motivo },
  { titulo: 'Valor anterior', valor: (e) => (e.anterior ? JSON.stringify(e.anterior) : '') },
  { titulo: 'Valor nuevo', valor: (e) => (e.nuevo ? JSON.stringify(e.nuevo) : '') },
];

async function listarActividad(req, res, next) {
  try {
    const estado = leerListado(req.query, actividad.LISTADO);
    if (req.query.formato === 'csv') {
      const { filas } = await actividad.listar(estado, { todo: true });
      return enviarCSV(res, 'registro-actividad', COLUMNAS_ACTIVIDAD, filas);
    }
    const [{ filas, total }, opciones] = await Promise.all([actividad.listar(estado), actividad.opcionesFiltros()]);
    return res.render('admin/actividad', {
      titulo: 'Registro de actividad',
      pagina: 'equipo',
      seccion: 'actividad',
      entradas: filas,
      listado: vistaListado('/admin/actividad', estado, actividad.LISTADO, total, {
        admin: Object.fromEntries(opciones.admins.map((o) => [o.valor, o.texto])),
      }),
      filtrosVista: [
        { clave: 'admin', etiqueta: 'Administrador', tipo: 'opcion', opciones: opciones.admins },
        { clave: 'seccion', etiqueta: 'Sección', tipo: 'opcion', opciones: Object.entries(actividad.SECCIONES).map(([valor, texto]) => ({ valor, texto })) },
        { clave: 'accion', etiqueta: 'Acción', tipo: 'opcion', opciones: opciones.acciones },
        { clave: 'desde', etiqueta: 'Desde', tipo: 'fecha' },
        { clave: 'hasta', etiqueta: 'Hasta', tipo: 'fecha' },
      ],
    });
  } catch (err) {
    return next(err);
  }
}

async function detalleActividad(req, res, next) {
  try {
    const id = idValido(req.params.id);
    const entrada = id ? await actividad.obtener(id) : null;
    if (!entrada) return next();
    return res.render('admin/actividad-detalle', {
      titulo: 'Detalle de la acción',
      pagina: 'equipo',
      seccion: 'actividad',
      entrada,
    });
  } catch (err) {
    return next(err);
  }
}

/** Secciones del menú que todavía no existen: dicen en qué fase llegan. */
function proximamente(clave) {
  const seccion = SECCIONES.find((s) => s.clave === clave);
  return (req, res) => res.render('admin/proximamente', {
    titulo: seccion.texto,
    pagina: 'equipo',
    seccion: clave,
    fase: seccion.fase,
  });
}

module.exports = { resumen, abrirAviso, listarActividad, detalleActividad, proximamente };
