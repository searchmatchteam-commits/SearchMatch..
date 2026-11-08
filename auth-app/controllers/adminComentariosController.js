// controllers/adminComentariosController.js
// AP-025 · Comentarios en el panel (/admin/comentarios): listado con filtros y exportación (AP-003) y las acciones
// ocultar / mostrar con motivo obligatorio (se registran en actividad y se le avisan al autor).

const comentarioModel = require('../models/comentarioModel');
const { leerListado, vistaListado, enviarCSV } = require('../config/listados');
const { idValido, leerMotivo, MSG_MOTIVO } = require('../middlewares/validadoresAdmin');

const BASE = '/admin/comentarios';

const AVISOS = {
  ocultado: 'Comentario oculto: ya nadie lo ve en la ficha del equipo. Se le avisó a su autor con el motivo.',
  mostrado: 'Comentario visible otra vez. Se le avisó a su autor.',
  'sin-cambio': 'No hubo cambios: el comentario ya estaba en ese estado.',
  inexistente: 'Ese comentario ya no existe.',
  motivo: MSG_MOTIVO,
};

const COLUMNAS_CSV = [
  { titulo: 'Fecha', valor: (c) => c.fecha },
  { titulo: 'Equipo', valor: (c) => c.equipo },
  { titulo: 'Autor', valor: (c) => c.autor },
  { titulo: 'Comentario', valor: (c) => c.mensaje },
  { titulo: 'Estado', valor: (c) => c.estadoTexto },
  { titulo: 'Motivo de moderación', valor: (c) => c.motivo },
];

async function listar(req, res, next) {
  try {
    const estado = leerListado(req.query, comentarioModel.LISTADO);
    if (req.query.formato === 'csv') {
      const { filas } = await comentarioModel.listar(estado, { todo: true });
      return enviarCSV(res, 'comentarios', COLUMNAS_CSV, filas);
    }
    const [{ filas, total }, opciones] = await Promise.all([comentarioModel.listar(estado), comentarioModel.opcionesFiltros()]);
    const aMapa = (lista) => Object.fromEntries(lista.map((o) => [o.valor, o.texto]));
    return res.render('admin/comentarios', {
      titulo: 'Comentarios',
      pagina: 'equipo',
      seccion: 'comentarios',
      comentarios: filas,
      listado: vistaListado(BASE, estado, comentarioModel.LISTADO, total, {
        equipo: aMapa(opciones.equipos),
        autor: aMapa(opciones.autores),
      }),
      filtrosVista: [
        { clave: 'estado', etiqueta: 'Estado', tipo: 'opcion', opciones: Object.entries(comentarioModel.ESTADOS).map(([valor, texto]) => ({ valor, texto })) },
        { clave: 'equipo', etiqueta: 'Equipo', tipo: 'opcion', opciones: opciones.equipos },
        { clave: 'autor', etiqueta: 'Autor', tipo: 'opcion', opciones: opciones.autores },
        { clave: 'desde', etiqueta: 'Desde', tipo: 'fecha' },
        { clave: 'hasta', etiqueta: 'Hasta', tipo: 'fecha' },
      ],
      aviso: AVISOS[req.query.aviso] || null,
      tipoAviso: req.query.aviso === 'motivo' || req.query.aviso === 'inexistente' ? 'error' : 'exito',
    });
  } catch (err) {
    return next(err);
  }
}

/** Vuelve al listado con los mismos filtros (vienen en el campo oculto "volver", solo la parte de la consulta). */
function volver(req, aviso) {
  const consulta = String(req.body.volver || '').replace(/^\?/, '');
  const params = new URLSearchParams(consulta);
  params.delete('aviso');
  params.set('aviso', aviso);
  return `${BASE}?${params.toString()}`;
}

function moderar(ocultar) {
  return async (req, res, next) => {
    try {
      const idComentario = idValido(req.params.id);
      const motivo = leerMotivo(req.body.motivo);
      if (!motivo) return res.redirect(volver(req, 'motivo'));
      const resultado = idComentario
        ? await comentarioModel.moderar({ id: req.usuario.id, nombre: req.usuario.nombre }, idComentario, ocultar, motivo)
        : 'inexistente';
      return res.redirect(volver(req, resultado));
    } catch (err) {
      return next(err);
    }
  };
}

module.exports = { listar, ocultar: moderar(true), mostrar: moderar(false) };
