// models/cuentaAdminModel.js
// Cuentas de usuario desde el panel (AD-012, ampliada por AP-000): buscar y activar/desactivar con motivo.
// El cambio, el registro de actividad y el aviso al usuario van en una misma transacción.

const { pool } = require('../config/db');
const actividad = require('./actividadModel');
const { notificarEnTransaccion } = require('./notificacionModel');

async function buscarCuentas(texto) {
  const { rows } = await pool.query(
    `SELECT u.id, u.auth_id, u.correo, u.activo, r.nombre AS rol,
            trim(concat_ws(' ', j.nombre_apodo, j.apellido)) AS nombre, j.apodo,
            (SELECT count(*)::int FROM equipo e WHERE e.id_usuario_creador = u.id AND e.activo) AS equipos_capitan
       FROM usuario u
       JOIN rol_aplicacion r ON r.id = u.id_rol_aplicacion
       LEFT JOIN jugador j ON j.id_usuario = u.id
      WHERE lower(r.nombre) NOT IN ('administrador', 'superadministrador') -- AP-006 c5: las del panel van aparte
        AND ($1 = ''
         OR u.correo ILIKE '%' || $1 || '%'
         OR concat_ws(' ', j.nombre_apodo, j.apellido, j.apodo) ILIKE '%' || $1 || '%')
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
    rol: 'Usuario estándar',
    activo: fila.activo,
    equiposCapitan: fila.equipos_capitan,
  }));
}

/**
 * Activa o desactiva una cuenta de usuario con un motivo (AP-000 c4/c5). Las cuentas del panel se
 * gestionan en Administradores (AP-011). La sesión de la persona se corta en su siguiente clic (regla 7).
 * @param {{id:number, nombre:string, idAuth:string}} admin
 * @returns {Promise<'cambiada'|'sin-cambio'|'propia'|'protegida'>}
 */
async function cambiarEstadoCuenta(idUsuario, activo, admin, motivo) {
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    const { rows } = await cliente.query(
      `SELECT u.auth_id, u.activo, u.correo, r.nombre AS rol
         FROM usuario u JOIN rol_aplicacion r ON r.id = u.id_rol_aplicacion
        WHERE u.id = $1 FOR UPDATE OF u`,
      [idUsuario]
    );
    const cuenta = rows[0];
    const bloqueo = !cuenta || cuenta.activo === activo ? 'sin-cambio'
      : cuenta.auth_id === admin.idAuth ? 'propia'
      : /^(super)?administrador$/i.test(cuenta.rol) ? 'protegida'
      : null;
    if (bloqueo) {
      await cliente.query('ROLLBACK');
      return bloqueo;
    }
    await cliente.query('UPDATE usuario SET activo = $2 WHERE id = $1', [idUsuario, activo]);
    await actividad.registrar(cliente, {
      admin, seccion: 'usuarios', accion: activo ? 'Activar cuenta' : 'Desactivar cuenta',
      elementoTipo: 'usuario', elementoId: idUsuario, elemento: cuenta.correo, motivo,
      anterior: { activo: cuenta.activo }, nuevo: { activo },
    });
    await notificarEnTransaccion(cliente, idUsuario, 'moderacion', activo
      ? `Tu cuenta de SearchMatch fue reactivada por la administración. Motivo: ${motivo}`
      : `Tu cuenta de SearchMatch fue desactivada por la administración. Motivo: ${motivo}`);
    await cliente.query('COMMIT');
    return 'cambiada';
  } catch (err) {
    await cliente.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    cliente.release();
  }
}

module.exports = { buscarCuentas, cambiarEstadoCuenta };
