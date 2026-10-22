// controllers/adminCatalogosController.js
// AD-014 · Catálogos de la plataforma (solo administradores, por requireAdmin):
//  GET  /admin/catalogos                       → modalidades, posiciones y niveles
//  POST /admin/catalogos/:tipo                 → agregar
//  POST /admin/catalogos/:tipo/:id             → editar
//  POST /admin/catalogos/:tipo/:id/eliminar    → eliminar (solo si no está en uso)

const catalogoModel = require('../models/catalogoModel');
const { idValido } = require('../middlewares/validadoresAdmin');

const AVISOS = {
  creado: 'Elemento agregado.',
  editado: 'Cambios guardados.',
  eliminado: 'Elemento eliminado.',
  repetido: 'Ya existe un elemento con ese nombre.',
  superpuesto: 'Ese rango de puntaje se cruza con el de otro nivel.',
  protegido: 'Ese elemento lo usa la aplicación: no se puede renombrar, cambiar su cantidad ni eliminar.',
  inexistente: 'Ese elemento ya no existe.',
};

/** Tipo de catálogo de la URL, solo si es uno de los conocidos. */
function tipoValido(tipo) {
  return Object.prototype.hasOwnProperty.call(catalogoModel.CATALOGOS, tipo) ? tipo : null;
}

async function renderCatalogos(res, { status = 200, aviso = null, error = null } = {}) {
  const tipos = Object.keys(catalogoModel.CATALOGOS);
  const listas = await Promise.all(tipos.map((tipo) => catalogoModel.listar(tipo)));
  return res.status(status).render('admin/catalogos', {
    titulo: 'Catálogos',
    pagina: 'equipo',
    seccion: 'catalogos',
    catalogos: tipos.map((tipo, i) => ({ tipo, ...catalogoModel.CATALOGOS[tipo], elementos: listas[i] })),
    aviso,
    error,
  });
}

// GET /admin/catalogos
async function listar(req, res, next) {
  try {
    return await renderCatalogos(res, { aviso: AVISOS[req.query.aviso] || null });
  } catch (err) {
    return next(err);
  }
}

/** Primer error de validación (los formularios son una fila: basta un mensaje). */
function primerError(req) {
  const errores = Object.values(req.erroresCampo);
  return errores.length > 0 ? errores[0] : null;
}

/** Vuelve a la sección del catálogo con el aviso (los errores de validación se muestran arriba). */
function volver(res, tipo, aviso) {
  return res.redirect(`/admin/catalogos?aviso=${aviso}#${tipo}`);
}

// POST /admin/catalogos/:tipo
async function crear(req, res, next) {
  const tipo = tipoValido(req.params.tipo);
  try {
    if (!tipo) return volver(res, '', 'inexistente');
    const error = primerError(req);
    if (error) return await renderCatalogos(res, { status: 400, error });
    return volver(res, tipo, await catalogoModel.crear(tipo, req.datosFormulario));
  } catch (err) {
    return next(err);
  }
}

// POST /admin/catalogos/:tipo/:id
async function editar(req, res, next) {
  const tipo = tipoValido(req.params.tipo);
  const id = idValido(req.params.id);
  try {
    if (!tipo || !id) return volver(res, '', 'inexistente');
    const error = primerError(req);
    if (error) return await renderCatalogos(res, { status: 400, error });
    return volver(res, tipo, await catalogoModel.editar(tipo, id, req.datosFormulario));
  } catch (err) {
    return next(err);
  }
}

// POST /admin/catalogos/:tipo/:id/eliminar
async function eliminar(req, res, next) {
  const tipo = tipoValido(req.params.tipo);
  const id = idValido(req.params.id);
  try {
    if (!tipo || !id) return volver(res, '', 'inexistente');
    const { resultado, usos } = await catalogoModel.eliminar(tipo, id);
    if (resultado === 'en-uso') {
      // AD-014: se indica dónde se usa
      const detalle = usos.map((uso) => `${uso.total} ${uso.etiqueta}`).join(', ');
      return await renderCatalogos(res, { status: 400, error: `No se puede eliminar: está en uso (${detalle}).` });
    }
    return volver(res, tipo, resultado);
  } catch (err) {
    return next(err);
  }
}

module.exports = { listar, crear, editar, eliminar };
