// models/adminPartidosModel.js
// Panel · Partidos: todos los partidos de desafíos, con su estado, para consultarlos (solo lectura).

const { pool } = require('../config/db');
const { ZONA_HORARIA } = require('../config/canchas');

const SQL_AHORA = `(now() AT TIME ZONE '${ZONA_HORARIA}')`;

// Estado de un partido, calculado: cancelado, jugado (con marcador), por registrar (ya empezó, sin marcador)
// o programado (todavía no se juega).
const SQL_ESTADO = `CASE
    WHEN p.cancelado THEN 'cancelado'
    WHEN p.marcador_desafiante IS NOT NULL THEN 'jugado'
    WHEN (p.fecha + p.hora) <= ${SQL_AHORA} THEN 'por-registrar'
    ELSE 'programado'
  END`;

const ESTADOS = {
  todos: 'Todos',
  programado: 'Programados',
  'por-registrar': 'Esperan resultado',
  jugado: 'Jugados',
  cancelado: 'Cancelados',
};

const POR_PAGINA = 50;

/**
 * @param {{texto?: string, estado?: string, pagina?: number}} filtros - texto busca en los nombres de los equipos
 *        y del recinto.
 * @returns {Promise<{partidos: object[], total: number, conteo: Object<string, number>}>}
 */
async function listar({ texto = '', estado = 'todos', pagina = 1 } = {}) {
  const filtroEstado = ESTADOS[estado] && estado !== 'todos' ? estado : null;
  const desde = (Math.max(1, pagina) - 1) * POR_PAGINA;
  const base = `
    FROM partido p
    JOIN desafio d ON d.id = p.id_desafio
    JOIN equipo ea ON ea.id = d.id_equipo_desafiante
    JOIN equipo eb ON eb.id = d.id_equipo_desafiado
    JOIN cancha ca ON ca.id = p.id_cancha
    JOIN recinto_deportivo rd ON rd.id = ca.id_recinto_deportivo
    JOIN modalidad m ON m.id = p.id_modalidad
   WHERE ($1 = '' OR ea.nombre ILIKE '%' || $1 || '%' OR eb.nombre ILIKE '%' || $1 || '%' OR rd.nombre ILIKE '%' || $1 || '%')`;

  const [lista, conteo] = await Promise.all([
    pool.query(
      `SELECT p.id, to_char(p.fecha, 'YYYY-MM-DD') AS fecha, to_char(p.hora, 'HH24:MI') AS hora,
              ea.id AS id_desafiante, ea.nombre AS desafiante, eb.id AS id_desafiado, eb.nombre AS desafiado,
              p.marcador_desafiante, p.marcador_desafiado, p.motivo_cancelacion,
              ca.nombre AS cancha, rd.nombre AS recinto, m.nombre AS modalidad, ${SQL_ESTADO} AS estado
         ${base}
         AND ($2::text IS NULL OR ${SQL_ESTADO} = $2)
        ORDER BY (${SQL_ESTADO} = 'por-registrar') DESC, abs(extract(epoch FROM (p.fecha + p.hora) - ${SQL_AHORA})), p.id DESC
        LIMIT ${POR_PAGINA} OFFSET $3`,
      [texto, filtroEstado, desde]
    ),
    pool.query(`SELECT ${SQL_ESTADO} AS estado, count(*)::int AS n ${base} GROUP BY 1`, [texto]),
  ]);

  const porEstado = Object.fromEntries(conteo.rows.map((f) => [f.estado, f.n]));
  porEstado.todos = conteo.rows.reduce((suma, f) => suma + f.n, 0);
  return {
    partidos: lista.rows,
    total: filtroEstado ? porEstado[filtroEstado] || 0 : porEstado.todos,
    conteo: porEstado,
  };
}

module.exports = { ESTADOS, POR_PAGINA, listar };
