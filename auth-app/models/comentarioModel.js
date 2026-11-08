// models/comentarioModel.js
// AP-025 · Moderación de los comentarios de las fichas de equipo desde el panel (/admin/comentarios).
// Ocultar y volver a mostrar piden motivo, se registran en admin_actividad y se le avisan al autor, todo en la
// misma transacción (sql/nuevas_tablas.sql MOD-1). Todas las consultas son parametrizadas ($1, $2...).

const { pool } = require('../config/db');
const { construirSQL, MAX_CSV } = require('../config/listados');
const actividad = require('./actividadModel');
const { notificarEnTransaccion } = require('./notificacionModel');

const ESTADOS = { visible: 'Visible', oculto: 'Oculto' };

const SQL_AUTOR = "coalesce(nullif(j.apodo, ''), j.nombre_apodo, u.correo)";

// Listado (AP-003): búsqueda por texto, equipo, autor, visible/oculto y rango de fechas (hora de Chile).
const LISTADO = {
  buscar: ['c.mensaje', 'e.nombre', SQL_AUTOR],
  filtros: {
    estado: {
      etiqueta: 'Estado',
      tipo: 'opcion',
      opciones: { visible: { texto: ESTADOS.visible, sql: 'NOT c.oculto' }, oculto: { texto: ESTADOS.oculto, sql: 'c.oculto' } },
    },
    equipo: { etiqueta: 'Equipo', tipo: 'id', sql: 'c.id_equipo = ?' },
    autor: { etiqueta: 'Autor', tipo: 'id', sql: 'c.id_usuario = ?' },
    desde: { etiqueta: 'Desde', tipo: 'fecha', sql: "(c.fecha AT TIME ZONE 'America/Santiago')::date >= ?::date" },
    hasta: { etiqueta: 'Hasta', tipo: 'fecha', sql: "(c.fecha AT TIME ZONE 'America/Santiago')::date <= ?::date" },
  },
  orden: { fecha: 'c.fecha', equipo: 'e.nombre', autor: SQL_AUTOR, estado: 'c.oculto' },
  ordenDefecto: 'fecha',
  dirDefecto: 'desc',
  desempate: 'c.id',
};

const SELECT_COMENTARIO = `
  SELECT c.id, c.mensaje, c.fecha, c.oculto, c.oculto_en, c.moderacion_motivo, c.id_equipo, c.id_usuario,
         e.nombre AS equipo, ${SQL_AUTOR} AS autor
    FROM comentario c
    JOIN equipo e ON e.id = c.id_equipo
    JOIN usuario u ON u.id = c.id_usuario
    LEFT JOIN jugador j ON j.id_usuario = u.id`;

function aComentario(f) {
  return {
    id: f.id,
    mensaje: f.mensaje,
    fecha: f.fecha,
    oculto: f.oculto,
    ocultoEn: f.oculto_en,
    estadoTexto: f.oculto ? ESTADOS.oculto : ESTADOS.visible,
    motivo: f.moderacion_motivo || '',
    idEquipo: f.id_equipo,
    equipo: f.equipo,
    idUsuario: f.id_usuario,
    autor: f.autor || 'Usuario',
  };
}

/**
 * @param {object} estado - De leerListado(query, LISTADO).
 * @param {{todo?: boolean}} [opciones] - todo: sin paginar (CSV).
 * @returns {Promise<{filas:object[], total:number}>}
 */
async function listar(estado, { todo = false } = {}) {
  const s = construirSQL(estado, LISTADO);
  const { rows } = await pool.query(
    `${SELECT_COMENTARIO.replace('SELECT c.id,', 'SELECT count(*) OVER()::int AS total, c.id,')}
      WHERE ${s.where}
      ORDER BY ${s.orderBy}
      ${todo ? `LIMIT ${MAX_CSV}` : s.limite}`,
    todo ? s.params : [...s.params, ...s.paramsPagina]
  );
  return { filas: rows.map(aComentario), total: rows[0] ? rows[0].total : 0 };
}

/** Opciones de los filtros: equipos y autores que tienen comentarios. */
async function opcionesFiltros() {
  const [equipos, autores] = await Promise.all([
    pool.query('SELECT DISTINCT e.id, e.nombre FROM comentario c JOIN equipo e ON e.id = c.id_equipo ORDER BY e.nombre'),
    pool.query(
      `SELECT DISTINCT u.id, ${SQL_AUTOR} AS nombre
         FROM comentario c JOIN usuario u ON u.id = c.id_usuario LEFT JOIN jugador j ON j.id_usuario = u.id
        ORDER BY 2`
    ),
  ]);
  return {
    equipos: equipos.rows.map((f) => ({ valor: String(f.id), texto: f.nombre })),
    autores: autores.rows.map((f) => ({ valor: String(f.id), texto: f.nombre })),
  };
}

async function enTransaccion(fn) {
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    const resultado = await fn(cliente);
    await cliente.query('COMMIT');
    return resultado;
  } catch (err) {
    await cliente.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    cliente.release();
  }
}

/**
 * Oculta (ocultar = true) o vuelve a mostrar un comentario, con motivo. Registra la acción y avisa al autor.
 * @param {{id:number, nombre:string}} admin
 * @returns {Promise<'ocultado'|'mostrado'|'sin-cambio'|'inexistente'>}
 */
async function moderar(admin, idComentario, ocultar, motivo) {
  return enTransaccion(async (cliente) => {
    const { rows: [c] } = await cliente.query(`${SELECT_COMENTARIO} WHERE c.id = $1 FOR UPDATE OF c`, [idComentario]);
    if (!c) return 'inexistente';
    if (c.oculto === ocultar) return 'sin-cambio';
    await cliente.query(
      'UPDATE comentario SET oculto = $2, oculto_en = CASE WHEN $2 THEN now() END, moderacion_motivo = $3 WHERE id = $1',
      [idComentario, ocultar, motivo]
    );
    await actividad.registrar(cliente, {
      admin,
      seccion: 'comentarios',
      accion: ocultar ? 'Ocultar comentario' : 'Mostrar comentario',
      elementoTipo: 'comentario',
      elementoId: idComentario,
      elemento: `${c.autor || 'Usuario'} en ${c.equipo}: ${c.mensaje.slice(0, 80)}`,
      motivo,
      anterior: { oculto: c.oculto },
      nuevo: { oculto: ocultar },
    });
    await notificarEnTransaccion(cliente, c.id_usuario, 'moderacion', ocultar
      ? `Tu comentario en la ficha de ${c.equipo} fue retirado por moderación. Motivo: ${motivo}`
      : `Tu comentario en la ficha de ${c.equipo} volvió a estar visible. Motivo: ${motivo}`,
    ocultar ? '/terminos' : `/equipos/${c.id_equipo}#comentarios`);
    return ocultar ? 'ocultado' : 'mostrado';
  });
}

module.exports = { ESTADOS, LISTADO, listar, opcionesFiltros, moderar };
