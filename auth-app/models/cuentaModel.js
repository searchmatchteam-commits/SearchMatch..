const { pool } = require('../config/db');
const { crearClienteTemporal } = require('../config/supabase');
const { ZONA_HORARIA } = require('../config/canchas');

async function guardarAceptacion(authId, { terminos, privacidad }) {
  await pool.query(
    `UPDATE usuario
        SET terminos_version = $2, privacidad_version = $3, terminos_aceptados_en = now()
      WHERE auth_id = $1`,
    [authId, terminos, privacidad]
  );
}

async function obtenerDatosCuenta(authId) {
  const { rows } = await pool.query(
    `SELECT correo, correo_secundario, telefono, terminos_version, privacidad_version, terminos_aceptados_en
       FROM usuario WHERE auth_id = $1`,
    [authId]
  );
  const fila = rows[0];
  if (!fila) return null;
  return {
    correo: fila.correo,
    correoSecundario: fila.correo_secundario || '',
    telefono: fila.telefono || '',
    terminosVersion: fila.terminos_version,
    privacidadVersion: fila.privacidad_version,
    aceptadoEn: fila.terminos_aceptados_en,
  };
}

async function correoUsadoPorOtraCuenta(correo, authId) {
  const { rowCount } = await pool.query(
    `SELECT 1 FROM usuario
      WHERE (lower(correo) = lower($1) OR lower(correo_secundario) = lower($1))
        AND auth_id IS DISTINCT FROM $2`,
    [correo, authId]
  );
  return rowCount > 0;
}

async function actualizarContacto(authId, { correoSecundario, telefono }) {
  await pool.query('UPDATE usuario SET correo_secundario = $2, telefono = $3 WHERE auth_id = $1', [
    authId,
    correoSecundario || null,
    telefono,
  ]);
}

async function sincronizarCorreo(authId, correo) {
  await pool.query('UPDATE usuario SET correo = $2 WHERE auth_id = $1', [authId, correo]);
}

async function correoPrincipalParaRecuperar(correo) {
  const { rows } = await pool.query(
    `SELECT correo FROM usuario
      WHERE activo AND (lower(correo) = lower($1) OR lower(correo_secundario) = lower($1))
      LIMIT 1`,
    [correo]
  );
  return rows[0] ? rows[0].correo : null;
}

function enviarEnlaceRecuperacion(supabase, correo, urlRedireccion) {
  return supabase.auth.resetPasswordForEmail(correo, { redirectTo: urlRedireccion });
}

// AP-011: la invitación de un administrador llega al mismo formulario. Según la plantilla de Supabase trae
// token_hash con type 'invite', o los tokens en el fragmento de la URL (#access_token=...), que la página
// reenvía como parámetros: se validan con Supabase al abrir la sesión.
function validarEnlaceRecuperacion(supabase, { code, tokenHash, type, accessToken, refreshToken }) {
  if (tokenHash) return supabase.auth.verifyOtp({ token_hash: tokenHash, type: type === 'invite' ? 'invite' : 'recovery' });
  if (accessToken && refreshToken) return supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
  return supabase.auth.exchangeCodeForSession(code);
}

async function passwordEsCorrecta(correo, password) {
  const cliente = crearClienteTemporal();
  const { error } = await cliente.auth.signInWithPassword({ email: correo, password });
  if (!error) await cliente.auth.signOut({ scope: 'local' }).catch(() => {});
  return !error;
}

function cambiarPassword(supabase, password) {
  return supabase.auth.updateUser({ password });
}

function solicitarCambioCorreo(supabase, correo, urlRedireccion) {
  return supabase.auth.updateUser({ email: correo }, { emailRedirectTo: urlRedireccion });
}

async function equiposActivosComoCapitan(authId) {
  const { rows } = await pool.query(
    `SELECT e.id, e.nombre FROM equipo e JOIN usuario u ON u.id = e.id_usuario_creador WHERE u.auth_id = $1 AND e.activo ORDER BY e.nombre`,
    [authId]
  );
  return rows;
}

async function desactivarCuenta(authId) {
  await pool.query('UPDATE usuario SET activo = FALSE WHERE auth_id = $1', [authId]);
}

/**
 * Elimina la cuenta para siempre, en UNA transacción, junto con todo lo que la vincula a equipos:
 *  - Los equipos que creó (es su capitán) se borran con sus desafíos, partidos, reservas de esos partidos,
 *    solicitudes, inscripciones y pagos de torneos. Antes se avisa a los demás integrantes y a los rivales
 *    que tenían desafíos pendientes o partidos futuros con esos equipos.
 *  - Como integrante de otros equipos: sale de sus planteles, alineaciones, invitaciones y solicitudes.
 *  - Sus comentarios, reservas, notificaciones y su perfil de jugador.
 * La cuenta de Supabase Auth se borra aparte (userModel.eliminarDeAuth), después del COMMIT.
 * @returns {Promise<boolean>} false si la cuenta no existe.
 */
async function eliminarCuenta(authId) {
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    const usuario = await cliente.query('SELECT id FROM usuario WHERE auth_id = $1 FOR UPDATE', [authId]);
    if (usuario.rowCount === 0) {
      await cliente.query('ROLLBACK');
      return false;
    }
    const idUsuario = usuario.rows[0].id;

    const jugadores = await cliente.query('SELECT id FROM jugador WHERE id_usuario = $1', [idUsuario]);
    const idsJugadores = jugadores.rows.map((fila) => fila.id);

    const equipos = await cliente.query('SELECT id FROM equipo WHERE id_usuario_creador = $1', [idUsuario]);
    const idsEquipos = equipos.rows.map((fila) => fila.id);

    if (idsEquipos.length > 0) {
      await notificarAntesDeBorrarEquipos(cliente, idsEquipos, idUsuario);

      // Partidos de esos equipos: por participación o por un desafío en que aparecen (partido.id_desafio es obligatorio).
      const desafios = await cliente.query(
        'SELECT id FROM desafio WHERE id_equipo_desafiante = ANY($1::int[]) OR id_equipo_desafiado = ANY($1::int[])',
        [idsEquipos]
      );
      const idsDesafios = desafios.rows.map((fila) => fila.id);
      const partidos = await cliente.query(
        `SELECT id FROM partido WHERE id_desafio = ANY($2::int[])
         UNION SELECT id_partido FROM participacion WHERE id_equipo = ANY($1::int[])`,
        [idsEquipos, idsDesafios]
      );
      const idsPartidos = partidos.rows.map((fila) => fila.id);

      if (idsPartidos.length > 0) {
        await cliente.query('DELETE FROM reservar_cancha WHERE id_partido = ANY($1::int[])', [idsPartidos]);
        await cliente.query('DELETE FROM partido WHERE id = ANY($1::int[])', [idsPartidos]); // participacion: CASCADE
      }
      await cliente.query('DELETE FROM participacion WHERE id_equipo = ANY($1::int[])', [idsEquipos]);
      if (idsDesafios.length > 0) await cliente.query('DELETE FROM desafio WHERE id = ANY($1::int[])', [idsDesafios]);
      await cliente.query('DELETE FROM solicitud_union_equipo WHERE id_equipo = ANY($1::int[])', [idsEquipos]);
      await cliente.query(
        'DELETE FROM torneo_pago WHERE id_inscripcion IN (SELECT id FROM torneo_equipo WHERE id_equipo = ANY($1::int[]))',
        [idsEquipos]
      );
      // El resto (plantel, alineaciones, modalidades, posiciones buscadas, invitaciones, comentarios del muro,
      // inscripciones a torneos) se borra en CASCADE; campeón/llaves de torneos quedan en NULL.
      await cliente.query('DELETE FROM equipo WHERE id = ANY($1::int[])', [idsEquipos]);
    }

    if (idsJugadores.length > 0) {
      // equipo_jugador, alineacion_puesto, invitacion_equipo y jugador_posicion se borran en CASCADE con el jugador.
      await cliente.query('DELETE FROM solicitud_union_equipo WHERE id_jugador = ANY($1::int[])', [idsJugadores]);
    }
    await cliente.query('DELETE FROM comentario WHERE id_usuario = $1', [idUsuario]);
    await cliente.query('DELETE FROM reservar_cancha WHERE id_usuario_reserva = $1', [idUsuario]);
    // jugador, notificacion y admin_sesion: CASCADE · torneo.creado_por, torneo_equipo.id_usuario_inscribe: SET NULL.
    await cliente.query('DELETE FROM usuario WHERE id = $1', [idUsuario]);

    await cliente.query('COMMIT');
    return true;
  } catch (err) {
    await cliente.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    cliente.release();
  }
}

/**
 * Avisos previos al borrado de los equipos de la cuenta (dentro de la transacción, con SAVEPOINT: si fallan,
 * la eliminación sigue). Integrantes: que el equipo ya no existe. Rivales: que se cancelaron sus desafíos
 * pendientes y partidos futuros con ese equipo.
 */
async function notificarAntesDeBorrarEquipos(cliente, idsEquipos, idUsuario) {
  await cliente.query('SAVEPOINT avisos_eliminar_cuenta');
  try {
    await cliente.query(
      `INSERT INTO notificacion (mensaje, id_tipo_notificacion, id_usuario)
       SELECT DISTINCT left('El equipo ' || e.nombre || ' fue eliminado porque su capitán eliminó su cuenta.', 500), t.id, u.id
         FROM equipo e
         JOIN equipo_jugador ej ON ej.id_equipo = e.id
         JOIN jugador j ON j.id = ej.id_jugador
         JOIN usuario u ON u.id = j.id_usuario AND u.activo AND u.id <> $2
         JOIN tipo_notificacion t ON lower(t.nombre) = 'equipo'
        WHERE e.id = ANY($1::int[])`,
      [idsEquipos, idUsuario]
    );
    await cliente.query(
      `WITH rivales AS (
         SELECT d.id_equipo_desafiado AS id_rival, d.id_equipo_desafiante AS id_equipo
           FROM desafio d JOIN estado_desafio ed ON ed.id = d.id_estado_desafio AND lower(ed.nombre) = 'pendiente'
          WHERE d.id_equipo_desafiante = ANY($1::int[])
         UNION
         SELECT d.id_equipo_desafiante, d.id_equipo_desafiado
           FROM desafio d JOIN estado_desafio ed ON ed.id = d.id_estado_desafio AND lower(ed.nombre) = 'pendiente'
          WHERE d.id_equipo_desafiado = ANY($1::int[])
         UNION
         SELECT otro.id_equipo, pa.id_equipo
           FROM participacion pa
           JOIN partido p ON p.id = pa.id_partido AND NOT p.cancelado AND p.marcador_desafiante IS NULL
                          AND (p.fecha + p.hora) > (now() AT TIME ZONE '${ZONA_HORARIA}')
           JOIN participacion otro ON otro.id_partido = pa.id_partido AND otro.id_equipo <> pa.id_equipo
          WHERE pa.id_equipo = ANY($1::int[])
       )
       INSERT INTO notificacion (mensaje, id_tipo_notificacion, id_usuario)
       SELECT DISTINCT left('El equipo ' || e.nombre || ' fue eliminado: se cancelaron sus desafíos pendientes y partidos con tu equipo.', 500),
              t.id, u.id
         FROM rivales r
         JOIN equipo e ON e.id = r.id_equipo
         JOIN equipo rival ON rival.id = r.id_rival AND NOT (rival.id = ANY($1::int[]))
         JOIN usuario u ON u.id = rival.id_usuario_creador AND u.activo
         JOIN tipo_notificacion t ON lower(t.nombre) = 'equipo'`,
      [idsEquipos]
    );
    await cliente.query('RELEASE SAVEPOINT avisos_eliminar_cuenta');
  } catch (err) {
    await cliente.query('ROLLBACK TO SAVEPOINT avisos_eliminar_cuenta');
    console.error('⚠️  No se pudieron crear los avisos de la eliminación de cuenta:', err.message);
  }
}

module.exports = {
  eliminarCuenta,
  equiposActivosComoCapitan,
  desactivarCuenta,
  guardarAceptacion,
  obtenerDatosCuenta,
  correoUsadoPorOtraCuenta,
  actualizarContacto,
  sincronizarCorreo,
  correoPrincipalParaRecuperar,
  enviarEnlaceRecuperacion,
  validarEnlaceRecuperacion,
  passwordEsCorrecta,
  cambiarPassword,
  solicitarCambioCorreo,
};
