// models/cuentaAdminModel.js
// AD-012 · Gestión de cuentas por el administrador: buscar por correo o nombre, desactivar y reactivar.
// Una cuenta desactivada pierde el acceso en su próxima petición (authMiddleware.cargarSesion revisa usuario.activo).
// Todas las consultas son parametrizadas ($1, $2...).

const { pool } = require('../config/db');

/**
 * Cuentas cuyo correo, nombre, apellido o apodo contiene el texto (máximo 50, las activas primero).
 * Incluye cuántos equipos activos capitanea cada una (para advertirlo al desactivar).
 * @returns {Promise<Array<{id, authId, correo, nombre, rol, activo, equiposCapitan}>>}
 */
async function buscarCuentas(texto) {
  const { rows } = await pool.query(
    `SELECT u.id, u.auth_id, u.correo, u.activo, r.nombre AS rol,
            trim(concat_ws(' ', j.nombre_apodo, j.apellido)) AS nombre, j.apodo,
            (SELECT count(*)::int FROM equipo e WHERE e.id_usuario_creador = u.id AND e.activo) AS equipos_capitan
       FROM usuario u
       JOIN rol_aplicacion r ON r.id = u.id_rol_aplicacion
       LEFT JOIN jugador j ON j.id_usuario = u.id
      WHERE $1 = ''
         OR u.correo ILIKE '%' || $1 || '%'
         OR concat_ws(' ', j.nombre_apodo, j.apellido, j.apodo) ILIKE '%' || $1 || '%'
      ORDER BY u.activo DESC, u.correo
      LIMIT 50`,
    [texto]
  );
  return rows.map((fila) => ({
    id: fila.id,
    authId: fila.auth_id,
    correo: fila.correo,
    nombre: fila.nombre || '—',
    apodo: fila.apodo || '',
    rol: /^administrador$/i.test(fila.rol) ? 'Administrador' : 'Usuario estándar',
    activo: fila.activo,
    equiposCapitan: fila.equipos_capitan,
  }));
}

/**
 * Cambia el estado de una cuenta, salvo la del propio administrador (no puede desactivarse a sí mismo aquí).
 * @param {number} idUsuario
 * @param {boolean} activo
 * @param {string} authIdAdmin - auth_id del administrador que hace el cambio.
 * @returns {Promise<'cambiada'|'propia'|'sin-cambio'>}
 */
async function cambiarEstadoCuenta(idUsuario, activo, authIdAdmin) {
  const { rows } = await pool.query('SELECT auth_id, activo FROM usuario WHERE id = $1', [idUsuario]);
  if (!rows[0] || rows[0].activo === activo) return 'sin-cambio';
  if (rows[0].auth_id === authIdAdmin) return 'propia';
  await pool.query('UPDATE usuario SET activo = $2 WHERE id = $1', [idUsuario, activo]);
  return 'cambiada';
}

module.exports = { buscarCuentas, cambiarEstadoCuenta };
