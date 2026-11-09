// controllers/adminPartidosController.js
// Panel · Partidos (GET /admin/partidos): todos los partidos de desafíos, con búsqueda y filtro por estado.
// Solo lectura: los resultados y cancelaciones los registran los capitanes desde el partido.

const adminPartidosModel = require('../models/adminPartidosModel');

const ETIQUETAS = {
  programado: 'Programado',
  'por-registrar': 'Espera resultado',
  jugado: 'Jugado',
  cancelado: 'Cancelado',
};

function fechaCorta(texto) {
  return new Intl.DateTimeFormat('es-CL', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(`${texto}T00:00:00Z`));
}

async function listar(req, res, next) {
  const texto = String(req.query.texto || '').trim().slice(0, 100);
  const estado = adminPartidosModel.ESTADOS[req.query.estado] ? req.query.estado : 'todos';
  const pagina = Math.max(1, Number.parseInt(req.query.pagina, 10) || 1);
  try {
    const { partidos, total, conteo } = await adminPartidosModel.listar({ texto, estado, pagina });
    const paginas = Math.max(1, Math.ceil(total / adminPartidosModel.POR_PAGINA));
    const enlace = (cambios) => {
      const p = new URLSearchParams({ texto, estado, pagina: String(pagina), ...cambios });
      ['texto'].forEach((k) => { if (!p.get(k)) p.delete(k); });
      if (p.get('estado') === 'todos') p.delete('estado');
      if (p.get('pagina') === '1') p.delete('pagina');
      return `/admin/partidos${p.toString() ? `?${p}` : ''}`;
    };
    return res.render('admin/partidos', {
      titulo: 'Partidos',
      pagina: 'equipo',
      seccion: 'partidos',
      partidos: partidos.map((p) => ({ ...p, fechaTexto: fechaCorta(p.fecha), estadoTexto: ETIQUETAS[p.estado] })),
      texto,
      estado,
      estados: Object.entries(adminPartidosModel.ESTADOS).map(([clave, nombre]) => ({
        clave, nombre, cantidad: conteo[clave] || 0, href: enlace({ estado: clave, pagina: '1' }),
      })),
      paginaActual: pagina,
      paginas,
      anterior: pagina > 1 ? enlace({ pagina: String(pagina - 1) }) : null,
      siguiente: pagina < paginas ? enlace({ pagina: String(pagina + 1) }) : null,
      total,
    });
  } catch (err) {
    return next(err);
  }
}

module.exports = { listar };
