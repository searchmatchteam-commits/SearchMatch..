// models/notificacionModel.js
// Notificaciones de la plataforma (tabla "notificacion", tipos en "tipo_notificacion").
//  NT-001 crear una notificación por evento (nunca a cuentas inactivas) · NT-002 listar y filtrar
//  NT-003 marcar como leídas · NT-004 abrir el elemento relacionado (columna "enlace").
// Toda historia que diga "notificar a..." usa notificarUsuario / notificarCapitan / notificarIntegrantes.
// Todas las consultas son parametrizadas ($1, $2...).

const { pool } = require('../config/db');

// Tipos (clave en tipo_notificacion.nombre → texto para el filtro de la bandeja).
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

/**
 * NT-001 · Crea una notificación para una cuenta (por su id de "usuario").
 * Si la cuenta está inactiva no se crea nada (el INSERT ... SELECT no encuentra filas).
 * Nunca hace fallar la acción que la origina: un error solo se registra en la consola.
 * @param {number} idUsuario
 * @param {keyof TIPOS} tipo
 * @param {string} mensaje - Texto visible (máx. 500).
 * @param {string|null} [enlace] - Ruta interna al elemento (ej. '/desafios/12').
 */
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

/** Notifica al capitán (quien creó el equipo). */
async function notificarCapitan(idEquipo, tipo, mensaje, enlace = null) {
  const { rows } = await pool.query('SELECT id_usuario_creador FROM equipo WHERE id = $1', [idEquipo]);
  if (rows[0]) await notificarUsuario(rows[0].id_usuario_creador, tipo, mensaje, enlace);
}

/** Notifica a todos los integrantes del plantel (incluido el capitán). */
async function notificarIntegrantes(idEquipo, tipo, mensaje, enlace = null) {
  const { rows } = await pool.query(
    `SELECT DISTINCT j.id_usuario FROM equipo_jugador ej JOIN jugador j ON j.id = ej.id_jugador WHERE ej.id_equipo = $1`,
    [idEquipo]
  );
  await Promise.all(rows.map((fila) => notificarUsuario(fila.id_usuario, tipo, mensaje, enlace)));
}

/** Notifica al dueño de una fila de "jugador". */
async function notificarJugador(idJugador, tipo, mensaje, enlace = null) {
  const { rows } = await pool.query('SELECT id_usuario FROM jugador WHERE id = $1', [idJugador]);
  if (rows[0]) await notificarUsuario(rows[0].id_usuario, tipo, mensaje, enlace);
}

/* ---------- Datos para armar los mensajes de los flujos que ya existían ---------- */

/** Nombre de un equipo ('' si no existe). */
async function nombreEquipo(idEquipo) {
  const { rows } = await pool.query('SELECT nombre FROM equipo WHERE id = $1', [idEquipo]);
  return rows[0] ? rows[0].nombre : '';
}

/** Jugador y equipo de una solicitud de unión. */
async function datosSolicitud(idSolicitud) {
  const { rows } = await pool.query(
    `SELECT s.id_jugador, s.id_equipo, e.nombre AS equipo FROM solicitud_union_equipo s JOIN equipo e ON e.id = s.id_equipo WHERE s.id = $1`,
    [idSolicitud]
  );
  return rows[0] || null;
}

/** Jugador (con su apodo o nombre) y equipo de una invitación. */
async function datosInvitacion(idInvitacion) {
  const { rows } = await pool.query(
    `SELECT i.id_jugador, i.id_equipo, coalesce(nullif(j.apodo, ''), j.nombre_apodo) AS jugador
       FROM invitacion_equipo i JOIN jugador j ON j.id = i.id_jugador WHERE i.id = $1`,
    [idInvitacion]
  );
  return rows[0] || null;
}

/**
 * Equipo que capitanea la cuenta — para los mensajes de desafíos. Con idEquipo, ese (si es suyo);
 * sin él, el primero creado y activo.
 */
async function equipoDeCapitan(authId, idEquipo = null) {
  const { rows } = await pool.query(
    `SELECT e.id, e.nombre FROM equipo e JOIN usuario u ON u.id = e.id_usuario_creador
      WHERE u.auth_id = $1 AND e.activo AND ($2::int IS NULL OR e.id = $2) ORDER BY e.id LIMIT 1`,
    [authId, idEquipo]
  );
  return rows[0] || null;
}

/** id de "usuario" a partir del UUID de Supabase Auth. */
async function idUsuarioDe(authId) {
  const { rows } = await pool.query('SELECT id FROM usuario WHERE auth_id = $1', [authId]);
  return rows[0] ? rows[0].id : null;
}

/**
 * NT-002 · Notificaciones de la cuenta: primero las no leídas y, dentro de cada grupo, de la más
 * reciente a la más antigua (NT-001). Filtro opcional por tipo.
 */
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

/** Cantidad sin leer (la campana de la barra superior). */
async function contarSinLeer(authId) {
  const { rows } = await pool.query(
    `SELECT count(*)::int AS total FROM notificacion n JOIN usuario u ON u.id = n.id_usuario
      WHERE u.auth_id = $1 AND NOT n.leida`,
    [authId]
  );
  return rows[0].total;
}

/**
 * NT-003 / NT-004 · Marca una notificación de la cuenta como leída y devuelve su enlace.
 * Solo toca las que siguen sin leer (las leídas quedan igual).
 * @returns {Promise<{enlace: string|null}|null>} null si no existe o no es de esta cuenta.
 */
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

/** NT-003 · Marca todas las no leídas de la cuenta. @returns {Promise<number>} cuántas cambiaron. */
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
