const { pool } = require('../config/db');

const TIPOS = {
  solicitud_equipo: 'Solicitudes de unión',
  invitacion: 'Invitaciones',
  desafio: 'Desafíos',
  partido: 'Partidos',
  reserva: 'Reservas',
  comentario: 'Comentarios',
  equipo: 'Equipos',
  moderacion: 'Moderación',
};

async function notificarUsuario(idUsuario, tipo, mensaje, enlace = null) {
  try {
    await pool.query(
      `INSERT INTO notificacion (mensaje, id_tipo_notificacion, id_usuario, enlace)
       SELECT left($3, 500), t.id, u.id, $4
         FROM usuario u
         JOIN tipo_notificacion t ON lower(t.nombre) = $2
        WHERE u.id = $1 AND u.activo`,
      [idUsuario, tipo, mensaje, enlace]
    );
  } catch (err) {
    console.error('⚠️  No se pudo crear la notificación:', err.message);
  }
}

async function notificarCapitan(idEquipo, tipo, mensaje, enlace = null) {
  const { rows } = await pool.query('SELECT id_usuario_creador FROM equipo WHERE id = $1', [idEquipo]);
  if (rows[0]) await notificarUsuario(rows[0].id_usuario_creador, tipo, mensaje, enlace);
}

async function notificarIntegrantes(idEquipo, tipo, mensaje, enlace = null) {
  const { rows } = await pool.query(
    `SELECT DISTINCT j.id_usuario FROM equipo_jugador ej JOIN jugador j ON j.id = ej.id_jugador WHERE ej.id_equipo = $1`,
    [idEquipo]
  );
  await Promise.all(rows.map((fila) => notificarUsuario(fila.id_usuario, tipo, mensaje, enlace)));
}

async function notificarJugador(idJugador, tipo, mensaje, enlace = null) {
  const { rows } = await pool.query('SELECT id_usuario FROM jugador WHERE id = $1', [idJugador]);
  if (rows[0]) await notificarUsuario(rows[0].id_usuario, tipo, mensaje, enlace);
}

async function nombreEquipo(idEquipo) {
  const { rows } = await pool.query('SELECT nombre FROM equipo WHERE id = $1', [idEquipo]);
  return rows[0] ? rows[0].nombre : '';
}

async function datosSolicitud(idSolicitud) {
  const { rows } = await pool.query(
    `SELECT s.id_jugador, s.id_equipo, e.nombre AS equipo FROM solicitud_union_equipo s JOIN equipo e ON e.id = s.id_equipo WHERE s.id = $1`,
    [idSolicitud]
  );
  return rows[0] || null;
}

async function datosInvitacion(idInvitacion) {
  const { rows } = await pool.query(
    `SELECT i.id_jugador, i.id_equipo, coalesce(nullif(j.apodo, ''), j.nombre_apodo) AS jugador
       FROM invitacion_equipo i JOIN jugador j ON j.id = i.id_jugador WHERE i.id = $1`,
    [idInvitacion]
  );
  return rows[0] || null;
}

async function equipoDeCapitan(authId) {
  const { rows } = await pool.query(
    `SELECT e.id, e.nombre FROM equipo e JOIN usuario u ON u.id = e.id_usuario_creador
      WHERE u.auth_id = $1 AND e.activo ORDER BY e.id LIMIT 1`,
    [authId]
  );
  return rows[0] || null;
}

async function idUsuarioDe(authId) {
  const { rows } = await pool.query('SELECT id FROM usuario WHERE auth_id = $1', [authId]);
  return rows[0] ? rows[0].id : null;
}

async function listar(authId, tipo = null) {
  const { rows } = await pool.query(
    `SELECT n.id, n.mensaje, n.fecha, n.leida, n.enlace, lower(t.nombre) AS tipo
       FROM notificacion n
       JOIN usuario u ON u.id = n.id_usuario
       JOIN tipo_notificacion t ON t.id = n.id_tipo_notificacion
      WHERE u.auth_id = $1 AND ($2::text IS NULL OR lower(t.nombre) = $2)
      ORDER BY n.leida, n.fecha DESC, n.id DESC
      LIMIT 100`,
    [authId, tipo]
  );
  return rows.map((fila) => ({ ...fila, tipoTexto: TIPOS[fila.tipo] || 'Aviso' }));
}

async function contarSinLeer(authId) {
  const { rows } = await pool.query(
    `SELECT count(*)::int AS total FROM notificacion n JOIN usuario u ON u.id = n.id_usuario
      WHERE u.auth_id = $1 AND NOT n.leida`,
    [authId]
  );
  return rows[0].total;
}

async function abrir(authId, idNotificacion) {
  const { rows } = await pool.query(
    `SELECT n.id, n.enlace FROM notificacion n JOIN usuario u ON u.id = n.id_usuario
      WHERE n.id = $1 AND u.auth_id = $2`,
    [idNotificacion, authId]
  );
  if (!rows[0]) return null;
  await pool.query('UPDATE notificacion SET leida = TRUE WHERE id = $1 AND NOT leida', [idNotificacion]);
  return { enlace: rows[0].enlace };
}

async function marcarTodas(authId) {
  const { rowCount } = await pool.query(
    `UPDATE notificacion n SET leida = TRUE FROM usuario u
      WHERE u.id = n.id_usuario AND u.auth_id = $1 AND NOT n.leida`,
    [authId]
  );
  return rowCount;
}

module.exports = {
  TIPOS,
  notificarUsuario,
  notificarCapitan,
  notificarIntegrantes,
  notificarJugador,
  nombreEquipo,
  datosSolicitud,
  datosInvitacion,
  equipoDeCapitan,
  idUsuarioDe,
  listar,
  contarSinLeer,
  abrir,
  marcarTodas,
};
