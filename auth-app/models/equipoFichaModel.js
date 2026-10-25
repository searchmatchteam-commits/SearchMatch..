const { pool } = require('../config/db');
const { MAX_EQUIPOS_COMO_CAPITAN } = require('../config/equipo');
const { ZONA_HORARIA } = require('../config/canchas');
const desafioModel = require('./desafioModel');

const LARGO_MAXIMO_COMENTARIO = 500;

async function obtenerFicha(idEquipo) {
  const { rows } = await pool.query(
    `SELECT e.id, e.nombre, e.activo, e.puntaje_nivel, e.escudo_actualizado, e.id_usuario_creador, e.id_modalidad,
            coalesce(c.nombre, e.zona) AS comuna, rg.nombre AS region,
            m.nombre AS modalidad, m.cantidad_de_jugadores AS jugadores, n.nombre AS nivel
       FROM equipo e
       LEFT JOIN comunas c ON c.id = e.id_comuna
       LEFT JOIN region rg ON rg.id = c.id_region
       LEFT JOIN modalidad m ON m.id = e.id_modalidad
       LEFT JOIN nivel n ON n.id = e.id_nivel
      WHERE e.id = $1`,
    [idEquipo]
  );
  const fila = rows[0];
  if (!fila) return null;
  return { ...fila, escudo: fila.activo && fila.escudo_actualizado ?`/equipos/${fila.id}/escudo?v=${fila.escudo_actualizado.getTime()}` : null };
}

async function relacionConFicha(authId, equipo) {
  const { rows } = await pool.query(
    `SELECT u.id AS id_usuario,
            EXISTS (SELECT 1 FROM equipo_jugador ej JOIN jugador j ON j.id = ej.id_jugador
                     WHERE ej.id_equipo = $2 AND j.id_usuario = u.id) AS integrante,
            EXISTS (SELECT 1 FROM solicitud_union_equipo s JOIN jugador j ON j.id = s.id_jugador
                      JOIN estado_solicitud es ON es.id = s.id_estado_solicitud
                     WHERE s.id_equipo = $2 AND j.id_usuario = u.id AND lower(es.nombre) = 'pendiente') AS postulo,
            (SELECT e.id FROM equipo e WHERE e.id_usuario_creador = u.id AND e.activo AND e.id <> $2
                AND e.id_modalidad = $3 ORDER BY e.id LIMIT 1) AS mi_equipo_para_desafiar,
            (SELECT e.id FROM equipo e WHERE e.id_usuario_creador = u.id AND e.activo AND e.id <> $2 ORDER BY e.id LIMIT 1) AS mi_equipo
       FROM usuario u WHERE u.auth_id = $1`,
    [authId, equipo.id, equipo.id_modalidad]
  );
  const fila = rows[0] || {};
  const esCapitan = fila.id_usuario === equipo.id_usuario_creador;
  return {
    esCapitan,
    esIntegrante: esCapitan || Boolean(fila.integrante),
    postulo: Boolean(fila.postulo),
    idEquipoParaDesafiar: fila.mi_equipo_para_desafiar || null,
    tieneEquipoPropio: Boolean(fila.mi_equipo),
  };
}

async function hayDesafioPendiente(idA, idB) {
  const { rowCount } = await pool.query(
    `SELECT 1 FROM desafio d JOIN estado_desafio ed ON ed.id = d.id_estado_desafio
      WHERE lower(ed.nombre) = 'pendiente'
        AND ((d.id_equipo_desafiante = $1 AND d.id_equipo_desafiado = $2) OR (d.id_equipo_desafiante = $2 AND d.id_equipo_desafiado = $1))`,
    [idA, idB]
  );
  return rowCount > 0;
}

async function historial(idEquipo) {
  const { rows } = await pool.query(
    `SELECT p.id, to_char(p.fecha, 'YYYY-MM-DD') AS fecha, ea.nombre AS desafiante, eb.nombre AS desafiado,
            p.marcador_desafiante, p.marcador_desafiado, d.id_equipo_desafiante = $1 AS fui_desafiante
       FROM partido p
       JOIN desafio d ON d.id = p.id_desafio
       JOIN equipo ea ON ea.id = d.id_equipo_desafiante
       JOIN equipo eb ON eb.id = d.id_equipo_desafiado
      WHERE (d.id_equipo_desafiante = $1 OR d.id_equipo_desafiado = $1)
        AND NOT p.cancelado AND p.marcador_desafiante IS NOT NULL
      ORDER BY p.fecha DESC, p.hora DESC
      LIMIT 20`,
    [idEquipo]
  );
  return rows.map((fila) => {
    const propios = fila.fui_desafiante ? fila.marcador_desafiante : fila.marcador_desafiado;
    const rivales = fila.fui_desafiante ? fila.marcador_desafiado : fila.marcador_desafiante;
    return { ...fila, resultado: propios > rivales ? 'Ganado' : propios < rivales ? 'Perdido' : 'Empate' };
  });
}

async function pendientesDeEquipo(idEquipo) {
  const { rows } = await pool.query(
    `SELECT (SELECT count(*)::int FROM desafio d JOIN estado_desafio ed ON ed.id = d.id_estado_desafio
              WHERE lower(ed.nombre) = 'pendiente' AND (d.id_equipo_desafiante = $1 OR d.id_equipo_desafiado = $1)) AS desafios,
            (SELECT count(*)::int FROM partido p JOIN participacion pa ON pa.id_partido = p.id
              WHERE pa.id_equipo = $1 AND NOT p.cancelado AND p.marcador_desafiante IS NULL
                AND (p.fecha + p.hora) > (now() AT TIME ZONE '${ZONA_HORARIA}')) AS partidos`,
    [idEquipo]
  );
  return rows[0];
}

async function listarComentarios(idEquipo) {
  const { rows } = await pool.query(
    `SELECT c.id, c.mensaje, c.fecha, coalesce(nullif(j.apodo, ''), j.nombre_apodo, 'Usuario') AS autor
       FROM comentario c
       JOIN usuario u ON u.id = c.id_usuario
       LEFT JOIN jugador j ON j.id_usuario = u.id
      WHERE c.id_equipo = $1 AND NOT c.oculto
      ORDER BY c.fecha, c.id`,
    [idEquipo]
  );
  return rows;
}

async function crearComentario(authId, idEquipo, mensaje) {
  await pool.query(
    `INSERT INTO comentario (mensaje, id_equipo, id_usuario) SELECT $3, $2, u.id FROM usuario u WHERE u.auth_id = $1`,
    [authId, idEquipo, mensaje]
  );
}

async function ocultarComentario(idComentario) {
  const { rows } = await pool.query(
    `UPDATE comentario c SET oculto = TRUE, oculto_en = now() FROM equipo e
      WHERE c.id = $1 AND NOT c.oculto AND e.id = c.id_equipo
      RETURNING c.id_usuario, c.id_equipo, e.nombre AS equipo`,
    [idComentario]
  );
  return rows[0] ? { idUsuario: rows[0].id_usuario, idEquipo: rows[0].id_equipo, equipo: rows[0].equipo } : null;
}

async function posicionesDelEquipo(idEquipo) {
  const { rows } = await pool.query(
    `SELECT p.id, p.nombre, EXISTS (SELECT 1 FROM equipo_posicion_buscada b WHERE b.id_equipo = $1 AND b.id_posicion = p.id) AS buscada
       FROM posicion p ORDER BY p.id`,
    [idEquipo]
  );
  return rows;
}

async function guardarPosicionesBuscadas(authId, idEquipo, idsPosiciones) {
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    const permiso = await cliente.query(
      'SELECT 1 FROM equipo e JOIN usuario u ON u.id = e.id_usuario_creador WHERE e.id = $1 AND u.auth_id = $2 AND e.activo FOR UPDATE OF e',
      [idEquipo, authId]
    );
    if (permiso.rowCount === 0) {
      await cliente.query('ROLLBACK');
      return false;
    }
    await cliente.query('DELETE FROM equipo_posicion_buscada WHERE id_equipo = $1', [idEquipo]);
    await cliente.query(
      `INSERT INTO equipo_posicion_buscada (id_equipo, id_posicion)
       SELECT $1, p.id FROM posicion p WHERE p.id = ANY($2::int[])`,
      [idEquipo, idsPosiciones]
    );
    await cliente.query('COMMIT');
    return true;
  } catch (err) {
    await cliente.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    cliente.release();
  }
}

async function listarEquiposQueBuscan() {
  const { rows } = await pool.query(
    `SELECT e.id, e.nombre, n.nombre AS nivel, m.nombre AS modalidad, coalesce(c.nombre, e.zona) AS comuna,
            array_agg(p.nombre ORDER BY p.id) AS posiciones
       FROM equipo e
       JOIN equipo_posicion_buscada b ON b.id_equipo = e.id
       JOIN posicion p ON p.id = b.id_posicion
       LEFT JOIN nivel n ON n.id = e.id_nivel
       LEFT JOIN modalidad m ON m.id = e.id_modalidad
       LEFT JOIN comunas c ON c.id = e.id_comuna
      WHERE e.activo
      GROUP BY e.id, n.nombre, m.nombre, c.nombre
      ORDER BY e.nombre`
  );
  return rows;
}

async function desactivarEquipo(authId, idEquipo) {
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    const permiso = await cliente.query(
      `UPDATE equipo e SET activo = FALSE FROM usuario u
        WHERE e.id = $1 AND e.activo AND u.id = e.id_usuario_creador AND u.auth_id = $2 RETURNING e.id`,
      [idEquipo, authId]
    );
    if (permiso.rowCount === 0) {
      await cliente.query('ROLLBACK');
      return { resultado: 'sin-permiso', rivales: [] };
    }
    const rivalesDesafios = await desafioModel.cancelarPendientesDeEquipo(cliente, idEquipo);
    const partidos = await cliente.query(
      `UPDATE partido p SET cancelado = TRUE, motivo_cancelacion = 'El equipo rival se desactivó.'
         FROM participacion pa
        WHERE pa.id_partido = p.id AND pa.id_equipo = $1 AND NOT p.cancelado AND p.marcador_desafiante IS NULL
          AND (p.fecha + p.hora) > (now() AT TIME ZONE '${ZONA_HORARIA}')
        RETURNING p.id`,
      [idEquipo]
    );
    const idsPartidos = partidos.rows.map((fila) => fila.id);
    let rivalesPartidos = [];
    if (idsPartidos.length > 0) {
      await cliente.query(
        `UPDATE reservar_cancha SET id_estado_reserva = (SELECT id FROM estado_reserva WHERE lower(nombre) = 'cancelada')
          WHERE id_partido = ANY($1::int[])`,
        [idsPartidos]
      );
      const otros = await cliente.query(
        'SELECT DISTINCT id_equipo FROM participacion WHERE id_partido = ANY($1::int[]) AND id_equipo <> $2',
        [idsPartidos, idEquipo]
      );
      rivalesPartidos = otros.rows.map((fila) => fila.id_equipo);
    }
    await cliente.query('COMMIT');
    return { resultado: 'desactivado', rivales: [...new Set([...rivalesDesafios, ...rivalesPartidos])] };
  } catch (err) {
    await cliente.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    cliente.release();
  }
}

async function reactivarEquipo(authId, idEquipo) {
  const { rows } = await pool.query(
    `SELECT e.activo, (SELECT count(*)::int FROM equipo x WHERE x.id_usuario_creador = u.id AND x.activo) AS activos
       FROM equipo e JOIN usuario u ON u.id = e.id_usuario_creador
      WHERE e.id = $1 AND u.auth_id = $2`,
    [idEquipo, authId]
  );
  if (!rows[0] || rows[0].activo) return 'sin-permiso';
  if (rows[0].activos >= MAX_EQUIPOS_COMO_CAPITAN) return 'limite';
  await pool.query('UPDATE equipo SET activo = TRUE WHERE id = $1', [idEquipo]);
  return 'reactivado';
}

async function listarInactivosDeCapitan(authId) {
  const { rows } = await pool.query(
    `SELECT e.id, e.nombre, e.puntaje_nivel FROM equipo e JOIN usuario u ON u.id = e.id_usuario_creador
      WHERE u.auth_id = $1 AND NOT e.activo ORDER BY e.nombre`,
    [authId]
  );
  return rows;
}

async function listarMisSolicitudes(authId) {
  const { rows } = await pool.query(
    `SELECT s.id, s.fecha_solicitud, s.fecha_respuesta, lower(es.nombre) AS estado, e.id AS id_equipo, e.nombre AS equipo
       FROM solicitud_union_equipo s
       JOIN estado_solicitud es ON es.id = s.id_estado_solicitud
       JOIN equipo e ON e.id = s.id_equipo
       JOIN jugador j ON j.id = s.id_jugador
       JOIN usuario u ON u.id = j.id_usuario
      WHERE u.auth_id = $1
      ORDER BY (lower(es.nombre) = 'pendiente') DESC, s.fecha_solicitud DESC`,
    [authId]
  );
  return rows;
}

async function cancelarSolicitud(authId, idSolicitud) {
  const { rowCount } = await pool.query(
    `UPDATE solicitud_union_equipo s
        SET id_estado_solicitud = (SELECT id FROM estado_solicitud WHERE lower(nombre) = 'cancelada'), fecha_respuesta = now()
       FROM estado_solicitud es, jugador j, usuario u
      WHERE s.id = $1 AND es.id = s.id_estado_solicitud AND lower(es.nombre) = 'pendiente'
        AND j.id = s.id_jugador AND u.id = j.id_usuario AND u.auth_id = $2`,
    [idSolicitud, authId]
  );
  return rowCount > 0;
}

module.exports = {
  LARGO_MAXIMO_COMENTARIO,
  obtenerFicha,
  relacionConFicha,
  hayDesafioPendiente,
  historial,
  pendientesDeEquipo,
  listarComentarios,
  crearComentario,
  ocultarComentario,
  posicionesDelEquipo,
  guardarPosicionesBuscadas,
  listarEquiposQueBuscan,
  desactivarEquipo,
  reactivarEquipo,
  listarInactivosDeCapitan,
  listarMisSolicitudes,
  cancelarSolicitud,
};
