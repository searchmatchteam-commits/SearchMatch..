const { pool } = require('../config/db');

const ESTADOS = ['pendiente', 'aceptado', 'rechazado', 'cancelado'];

const SQL_DESAFIO = `
  SELECT d.id, d.mensaje, d.fecha_solicitud, d.fecha_respuesta, lower(ed.nombre) AS estado,
         d.id_equipo_desafiante, ea.nombre AS desafiante, na.nombre AS nivel_desafiante, ea.activo AS desafiante_activo,
         d.id_equipo_desafiado, eb.nombre AS desafiado, nb.nombre AS nivel_desafiado, eb.activo AS desafiado_activo,
         coalesce(d.id_modalidad, ea.id_modalidad) AS id_modalidad, m.nombre AS modalidad, m.cantidad_de_jugadores AS jugadores,
         (SELECT p.id FROM partido p WHERE p.id_desafio = d.id) AS id_partido
    FROM desafio d
    JOIN estado_desafio ed ON ed.id = d.id_estado_desafio
    JOIN equipo ea ON ea.id = d.id_equipo_desafiante
    JOIN equipo eb ON eb.id = d.id_equipo_desafiado
    LEFT JOIN nivel na ON na.id = ea.id_nivel
    LEFT JOIN nivel nb ON nb.id = eb.id_nivel
    -- La modalidad elegida al desafiar; los desafíos antiguos, la principal del desafiante
    LEFT JOIN modalidad m ON m.id = coalesce(d.id_modalidad, ea.id_modalidad)`;

async function listarEnviados(idEquipo, estado = null) {
  const { rows } = await pool.query(
    `${SQL_DESAFIO} WHERE d.id_equipo_desafiante = $1 AND ($2::text IS NULL OR lower(ed.nombre) = $2)
     ORDER BY d.fecha_solicitud DESC, d.id DESC`,
    [idEquipo, estado]
  );
  return rows;
}

async function listarRecibidos(idEquipo) {
  const { rows } = await pool.query(
    `${SQL_DESAFIO} WHERE d.id_equipo_desafiado = $1
     ORDER BY (lower(ed.nombre) = 'pendiente') DESC, d.fecha_solicitud DESC, d.id DESC`,
    [idEquipo]
  );
  return rows;
}

async function obtener(idDesafio) {
  const { rows } = await pool.query(`${SQL_DESAFIO} WHERE d.id = $1`, [idDesafio]);
  return rows[0] || null;
}

async function relacionConEquipo(authId, idEquipo) {
  const { rows } = await pool.query(
    `SELECT e.id_usuario_creador = u.id AS capitan,
            EXISTS (SELECT 1 FROM equipo_jugador ej JOIN jugador j ON j.id = ej.id_jugador
                     WHERE ej.id_equipo = e.id AND j.id_usuario = u.id) AS integrante
       FROM equipo e, usuario u
      WHERE e.id = $1 AND u.auth_id = $2`,
    [idEquipo, authId]
  );
  if (!rows[0]) return null;
  if (rows[0].capitan) return 'capitan';
  return rows[0].integrante ? 'integrante' : null;
}

async function cambiarEstado(authId, idDesafio, nuevoEstado, lado) {
  const columna = lado === 'desafiante' ? 'id_equipo_desafiante' : 'id_equipo_desafiado';
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    const { rows } = await cliente.query(
      `SELECT lower(ed.nombre) AS estado, e.id_usuario_creador = u.id AS soy_capitan
         FROM desafio d
         JOIN estado_desafio ed ON ed.id = d.id_estado_desafio
         JOIN equipo e ON e.id = d.${columna}
         JOIN usuario u ON u.auth_id = $2
        WHERE d.id = $1
          FOR UPDATE OF d`,
      [idDesafio, authId]
    );
    let resultado = 'ok';
    if (!rows[0]) resultado = 'inexistente';
    else if (!rows[0].soy_capitan) resultado = 'sin-permiso';
    else if (rows[0].estado !== 'pendiente') resultado = 'respondido';
    else {
      await cliente.query(
        `UPDATE desafio SET id_estado_desafio = (SELECT id FROM estado_desafio WHERE lower(nombre) = $2), fecha_respuesta = now()
          WHERE id = $1`,
        [idDesafio, nuevoEstado]
      );
    }
    await cliente.query(resultado === 'ok' ? 'COMMIT' : 'ROLLBACK');
    return resultado;
  } catch (err) {
    await cliente.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    cliente.release();
  }
}

async function cancelarPendientesDeEquipo(cliente, idEquipo) {
  const { rows } = await cliente.query(
    `UPDATE desafio d SET id_estado_desafio = (SELECT id FROM estado_desafio WHERE lower(nombre) = 'cancelado'), fecha_respuesta = now()
       FROM estado_desafio ed
      WHERE ed.id = d.id_estado_desafio AND lower(ed.nombre) = 'pendiente'
        AND (d.id_equipo_desafiante = $1 OR d.id_equipo_desafiado = $1)
      RETURNING CASE WHEN d.id_equipo_desafiante = $1 THEN d.id_equipo_desafiado ELSE d.id_equipo_desafiante END AS id_rival`,
    [idEquipo]
  );
  return rows.map((fila) => fila.id_rival);
}

module.exports = {
  ESTADOS,
  listarEnviados,
  listarRecibidos,
  obtener,
  relacionConEquipo,
  cambiarEstado,
  cancelarPendientesDeEquipo,
};
