// models/superAdminModel.js
// Panel del superadministrador: resumen de la plataforma, equipos y jugadores.
// A diferencia del resto del módulo de administración (que solo desactiva), aquí se ELIMINA:
// las funciones de borrado van en una transacción y limpian a mano las tablas cuya clave
// foránea no tiene ON DELETE CASCADE (desafio, partido, participacion, solicitudes, reservas...).

const { pool } = require('../config/db');
const userModel = require('./userModel');
const { notificarUsuario } = require('./notificacionModel');

const ES_ADMIN = /^administrador$/i;
const ES_SUPER = /^superadministrador$/i;

function textoRol(rol) {
  if (ES_SUPER.test(rol || '')) return 'Superadministrador';
  if (ES_ADMIN.test(rol || '')) return 'Administrador';
  return 'Usuario estándar';
}

/** Cifras de los cuadros del resumen. "Conectados" = último inicio de sesión en Supabase Auth. */
async function resumen() {
  const { rows } = await pool.query(
    `SELECT (SELECT count(*)::int FROM usuario) AS cuentas,
            (SELECT count(*)::int FROM usuario WHERE activo) AS cuentas_activas,
            (SELECT count(*)::int FROM jugador) AS jugadores,
            (SELECT count(*)::int FROM equipo WHERE activo) AS equipos_activos,
            (SELECT count(*)::int FROM equipo WHERE NOT activo) AS equipos_inactivos,
            (SELECT count(*)::int FROM usuario u JOIN auth.users a ON a.id = u.auth_id
              WHERE u.activo AND a.last_sign_in_at > now() - interval '24 hours') AS conectados_24h,
            (SELECT count(*)::int FROM usuario u JOIN auth.users a ON a.id = u.auth_id
              WHERE u.activo AND a.last_sign_in_at > now() - interval '7 days') AS conectados_7d,
            (SELECT count(*)::int FROM partido WHERE NOT cancelado AND fecha >= current_date) AS partidos_proximos`
  );
  return rows[0];
}

// ---------- Equipos ----------

async function buscarEquipos(texto) {
  const { rows } = await pool.query(
    `SELECT e.id, e.nombre, e.activo, c.nombre AS comuna, u.correo AS correo_capitan,
            trim(concat_ws(' ', j.nombre_apodo, j.apellido)) AS capitan,
            (SELECT count(*)::int FROM equipo_jugador ej WHERE ej.id_equipo = e.id) AS integrantes,
            (SELECT count(*)::int FROM desafio d WHERE e.id IN (d.id_equipo_desafiado, d.id_equipo_desafiante)) AS desafios
       FROM equipo e
       JOIN usuario u ON u.id = e.id_usuario_creador
       LEFT JOIN jugador j ON j.id_usuario = u.id
       LEFT JOIN comunas c ON c.id = e.id_comuna
      WHERE $1 = ''
         OR e.nombre ILIKE '%' || $1 || '%'
         OR u.correo ILIKE '%' || $1 || '%'
      ORDER BY e.activo DESC, e.nombre
      LIMIT 50`,
    [texto]
  );
  return rows.map((f) => ({
    id: f.id,
    nombre: f.nombre,
    activo: f.activo,
    comuna: f.comuna || '—',
    capitan: f.capitan || f.correo_capitan,
    correoCapitan: f.correo_capitan,
    integrantes: f.integrantes,
    desafios: f.desafios,
  }));
}

/**
 * Elimina un equipo y todo lo que cuelga de él, incluidos sus desafíos y partidos
 * (también desaparecen del historial del equipo rival). Las reservas de cancha ligadas
 * a esos partidos se conservan, solo pierden el vínculo.
 * @returns {'eliminado'|'sin-cambio'}
 */
async function eliminarEquipo(idEquipo) {
  const cliente = await pool.connect();
  let nombre;
  let integrantes = [];
  try {
    await cliente.query('BEGIN');
    const equipo = await cliente.query('SELECT nombre FROM equipo WHERE id = $1 FOR UPDATE', [idEquipo]);
    if (equipo.rowCount === 0) {
      await cliente.query('ROLLBACK');
      return 'sin-cambio';
    }
    nombre = equipo.rows[0].nombre;
    const miembros = await cliente.query(
      `SELECT DISTINCT j.id_usuario FROM equipo_jugador ej JOIN jugador j ON j.id = ej.id_jugador WHERE ej.id_equipo = $1`,
      [idEquipo]
    );
    integrantes = miembros.rows.map((f) => f.id_usuario);

    const desafios = `SELECT id FROM desafio WHERE $1 IN (id_equipo_desafiado, id_equipo_desafiante)`;
    const partidos = `SELECT id FROM partido WHERE id_desafio IN (${desafios})`;
    await cliente.query(`UPDATE reservar_cancha SET id_partido = NULL WHERE id_partido IN (${partidos})`, [idEquipo]);
    await cliente.query(`DELETE FROM partido WHERE id_desafio IN (${desafios})`, [idEquipo]); // participacion: CASCADE
    await cliente.query('DELETE FROM participacion WHERE id_equipo = $1', [idEquipo]);
    await cliente.query('DELETE FROM desafio WHERE $1 IN (id_equipo_desafiado, id_equipo_desafiante)', [idEquipo]);
    await cliente.query('DELETE FROM solicitud_union_equipo WHERE id_equipo = $1', [idEquipo]);
    // equipo_jugador, equipo_modalidad, alineacion_puesto, invitaciones, comentarios...: CASCADE
    await cliente.query('DELETE FROM equipo WHERE id = $1', [idEquipo]);
    await cliente.query('COMMIT');
  } catch (err) {
    await cliente.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    cliente.release();
  }

  await Promise.all(integrantes.map((idUsuario) =>
    notificarUsuario(idUsuario, 'moderacion', `El equipo "${nombre}" fue eliminado por la administración de SearchMatch.`)));
  return 'eliminado';
}

// ---------- Jugadores ----------

const FILTROS_JUGADOR = {
  todos: 'TRUE',
  conectados: `u.activo AND a.last_sign_in_at > now() - interval '7 days'`,
  activas: 'u.activo',
  inactivas: 'NOT u.activo',
};

async function buscarJugadores(texto, filtro) {
  const condicion = FILTROS_JUGADOR[filtro] || FILTROS_JUGADOR.todos;
  const { rows } = await pool.query(
    `SELECT u.id, u.auth_id, u.correo, u.correo_secundario, u.telefono, u.activo, r.nombre AS rol,
            a.last_sign_in_at, a.created_at, a.email_confirmed_at,
            trim(concat_ws(' ', j.nombre_apodo, j.apellido)) AS nombre, j.apodo,
            (SELECT count(*)::int FROM equipo_jugador ej WHERE ej.id_jugador = j.id) AS equipos,
            (SELECT count(*)::int FROM equipo e WHERE e.id_usuario_creador = u.id) AS equipos_creados
       FROM usuario u
       JOIN rol_aplicacion r ON r.id = u.id_rol_aplicacion
       JOIN jugador j ON j.id_usuario = u.id -- solo cuentas con perfil de jugador
       LEFT JOIN auth.users a ON a.id = u.auth_id
      WHERE (${condicion})
        AND ($1 = ''
             OR u.correo ILIKE '%' || $1 || '%'
             OR concat_ws(' ', j.nombre_apodo, j.apellido, j.apodo) ILIKE '%' || $1 || '%')
      ORDER BY a.last_sign_in_at DESC NULLS LAST, u.correo
      LIMIT 50`,
    [texto]
  );
  return rows.map((f) => ({
    id: f.id,
    authId: f.auth_id,
    correo: f.correo,
    correoSecundario: f.correo_secundario || '',
    telefono: f.telefono || '',
    registro: f.created_at,
    correoConfirmado: Boolean(f.email_confirmed_at),
    nombre: f.nombre || '—',
    apodo: f.apodo || '',
    rol: textoRol(f.rol),
    esSuper: ES_SUPER.test(f.rol || ''),
    activo: f.activo,
    ultimaConexion: f.last_sign_in_at,
    equipos: f.equipos,
    equiposCreados: f.equipos_creados,
  }));
}

/**
 * Borra la cuenta completa: perfil de jugador, sus solicitudes, comentarios, reservas,
 * notificaciones, la fila de "usuario" y el usuario de Supabase Auth.
 * No borra equipos ajenos: si creó equipos, hay que eliminarlos antes.
 * @returns {'eliminado'|'sin-cambio'|'propia'|'super'|'capitan'|'sin-auth'}
 */
async function eliminarJugador(idUsuario, authIdAdmin) {
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    const { rows } = await cliente.query(
      `SELECT u.auth_id, r.nombre AS rol,
              (SELECT count(*)::int FROM equipo e WHERE e.id_usuario_creador = u.id) AS equipos_creados
         FROM usuario u JOIN rol_aplicacion r ON r.id = u.id_rol_aplicacion
        WHERE u.id = $1
        FOR UPDATE OF u`,
      [idUsuario]
    );
    const cuenta = rows[0];
    const bloqueo = !cuenta ? 'sin-cambio'
      : cuenta.auth_id === authIdAdmin ? 'propia'
      : ES_SUPER.test(cuenta.rol) ? 'super'
      : cuenta.equipos_creados > 0 ? 'capitan'
      : null;
    if (bloqueo) {
      await cliente.query('ROLLBACK');
      return bloqueo;
    }

    await cliente.query(
      'DELETE FROM solicitud_union_equipo WHERE id_jugador IN (SELECT id FROM jugador WHERE id_usuario = $1)',
      [idUsuario]
    );
    await cliente.query('DELETE FROM comentario WHERE id_usuario = $1', [idUsuario]);
    await cliente.query('DELETE FROM reservar_cancha WHERE id_usuario_reserva = $1', [idUsuario]);
    // jugador (y con él equipo_jugador, posiciones, invitaciones) y notificacion: CASCADE
    await cliente.query('DELETE FROM usuario WHERE id = $1', [idUsuario]);

    // Auth se borra antes del COMMIT: si Supabase falla, la cuenta queda intacta en la base.
    if (cuenta.auth_id && !(await userModel.eliminarDeAuth(cuenta.auth_id))) {
      await cliente.query('ROLLBACK');
      return 'sin-auth';
    }
    await cliente.query('COMMIT');
    return 'eliminado';
  } catch (err) {
    await cliente.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    cliente.release();
  }
}

module.exports = { resumen, buscarEquipos, eliminarEquipo, buscarJugadores, eliminarJugador, FILTROS_JUGADOR };
