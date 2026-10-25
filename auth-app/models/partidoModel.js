const { pool } = require('../config/db');
const reservaModel = require('./reservaModel');
const { DURACION_PARTIDO_MIN } = require('../config/partidos');

const { SQL_AHORA } = reservaModel;

function sumarMinutos(hora, minutos) {
  const [h, m] = hora.split(':').map(Number);
  const total = Math.min(h * 60 + m + minutos, 23 * 60 + 59);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

async function equipoOcupado(cliente, idsEquipos, fecha, hora) {
  const { rowCount } = await cliente.query(
    `SELECT 1 FROM partido p JOIN participacion pa ON pa.id_partido = p.id
      WHERE pa.id_equipo = ANY($1::int[]) AND NOT p.cancelado AND p.fecha = $2::date
        AND p.hora < ($3::time + make_interval(mins => $4)) AND (p.hora + make_interval(mins => $4)) > $3::time`,
    [idsEquipos, fecha, hora, DURACION_PARTIDO_MIN]
  );
  return rowCount > 0;
}

async function programar(authId, idDesafio, { fecha, hora, idModalidad, idCancha }) {
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    const { rows } = await cliente.query(
      `SELECT d.id_equipo_desafiante, d.id_equipo_desafiado, lower(ed.nombre) AS estado, u.id AS id_usuario,
              (ea.id_usuario_creador = u.id OR eb.id_usuario_creador = u.id) AS soy_capitan,
              (ea.activo AND eb.activo) AS activos,
              EXISTS (SELECT 1 FROM partido p WHERE p.id_desafio = d.id) AS tiene_partido
         FROM desafio d
         JOIN estado_desafio ed ON ed.id = d.id_estado_desafio
         JOIN equipo ea ON ea.id = d.id_equipo_desafiante
         JOIN equipo eb ON eb.id = d.id_equipo_desafiado
         JOIN usuario u ON u.auth_id = $2
        WHERE d.id = $1
          FOR UPDATE OF d`,
      [idDesafio, authId]
    );
    const desafio = rows[0];
    let resultado = null;
    if (!desafio) resultado = 'inexistente';
    else if (!desafio.soy_capitan) resultado = 'sin-permiso';
    else if (desafio.estado !== 'aceptado' || desafio.tiene_partido) resultado = 'no-programable';
    else if (!desafio.activos) resultado = 'equipo-inactivo';

    let idPartido = null;
    const fin = sumarMinutos(hora, DURACION_PARTIDO_MIN);
    if (!resultado) {
      const cancha = await reservaModel.bloquearCanchaActiva(cliente, idCancha);
      const equipos = [desafio.id_equipo_desafiante, desafio.id_equipo_desafiado];
      if (!cancha) resultado = 'cancha-inactiva';
      else if (cancha.id_modalidad !== idModalidad) resultado = 'modalidad';
      else if (await equipoOcupado(cliente, equipos, fecha, hora)) resultado = 'equipo-ocupado';
    }
    if (!resultado) {
      const partido = await cliente.query(
        `INSERT INTO partido (hora, fecha, id_modalidad, id_desafio, id_cancha) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [hora, fecha, idModalidad, idDesafio, idCancha]
      );
      idPartido = partido.rows[0].id;
      await cliente.query(
        'INSERT INTO participacion (es_desafiante, id_equipo, id_partido) VALUES (TRUE, $1, $3), (FALSE, $2, $3)',
        [desafio.id_equipo_desafiante, desafio.id_equipo_desafiado, idPartido]
      );
      const reserva = await reservaModel.insertarReserva(cliente, {
        idCancha, idUsuario: desafio.id_usuario, fecha, inicio: hora, fin, idPartido,
      });
      if (reserva.resultado !== 'creada') resultado = reserva.resultado;
    }

    if (resultado) {
      await cliente.query('ROLLBACK');
      return { resultado };
    }
    await cliente.query('COMMIT');
    return { resultado: 'programado', idPartido, equipos: [desafio.id_equipo_desafiante, desafio.id_equipo_desafiado] };
  } catch (err) {
    await cliente.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    cliente.release();
  }
}

const SQL_PARTIDO = `
  SELECT p.id, to_char(p.fecha, 'YYYY-MM-DD') AS fecha, to_char(p.hora, 'HH24:MI') AS hora,
         p.marcador_desafiante, p.marcador_desafiado, p.cancelado, p.motivo_cancelacion,
         (p.fecha + p.hora) <= ${SQL_AHORA} AS ya_empezo,
         d.id AS id_desafio, d.mensaje AS mensaje_desafio,
         d.id_equipo_desafiante, ea.nombre AS desafiante, d.id_equipo_desafiado, eb.nombre AS desafiado,
         m.nombre AS modalidad, m.cantidad_de_jugadores AS jugadores,
         ca.id AS id_cancha, ca.nombre AS cancha, rd.nombre AS recinto, rd.telefono,
         dir.calle, dir.numero, co.nombre AS comuna
    FROM partido p
    JOIN desafio d ON d.id = p.id_desafio
    JOIN equipo ea ON ea.id = d.id_equipo_desafiante
    JOIN equipo eb ON eb.id = d.id_equipo_desafiado
    JOIN modalidad m ON m.id = p.id_modalidad
    JOIN cancha ca ON ca.id = p.id_cancha
    JOIN recinto_deportivo rd ON rd.id = ca.id_recinto_deportivo
    JOIN direccion dir ON dir.id = rd.id_direccion
    JOIN comunas co ON co.id = dir.id_comunas`;

async function obtener(idPartido) {
  const { rows } = await pool.query(`${SQL_PARTIDO} WHERE p.id = $1`, [idPartido]);
  return rows[0] || null;
}

async function esCapitanDelPartido(cliente, authId, idPartido) {
  const { rowCount } = await cliente.query(
    `SELECT 1 FROM participacion pa JOIN equipo e ON e.id = pa.id_equipo JOIN usuario u ON u.id = e.id_usuario_creador
      WHERE pa.id_partido = $1 AND u.auth_id = $2`,
    [idPartido, authId]
  );
  return rowCount > 0;
}

async function registrarResultado(authId, idPartido, { desafiante, desafiado }) {
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    const { rows } = await cliente.query(
      `SELECT p.cancelado, p.marcador_desafiante, (p.fecha + p.hora) <= ${SQL_AHORA} AS ya_empezo
         FROM partido p WHERE p.id = $1 FOR UPDATE`,
      [idPartido]
    );
    let resultado = 'registrado';
    if (!rows[0]) resultado = 'inexistente';
    else if (!(await esCapitanDelPartido(cliente, authId, idPartido))) resultado = 'sin-permiso';
    else if (rows[0].cancelado) resultado = 'cancelado';
    else if (rows[0].marcador_desafiante !== null) resultado = 'ya-registrado';
    else if (!rows[0].ya_empezo) resultado = 'antes-de-tiempo';
    else {
      await cliente.query(
        'UPDATE partido SET marcador_desafiante = $2, marcador_desafiado = $3, fecha_resultado = now() WHERE id = $1',
        [idPartido, desafiante, desafiado]
      );
    }
    await cliente.query(resultado === 'registrado' ? 'COMMIT' : 'ROLLBACK');
    return resultado;
  } catch (err) {
    await cliente.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    cliente.release();
  }
}

async function cancelar(authId, idPartido, motivo) {
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    const { rows } = await cliente.query(
      `SELECT p.cancelado, p.marcador_desafiante, (p.fecha + p.hora) > ${SQL_AHORA} AS futuro FROM partido p WHERE p.id = $1 FOR UPDATE`,
      [idPartido]
    );
    let resultado = 'cancelado';
    if (!rows[0]) resultado = 'inexistente';
    else if (!(await esCapitanDelPartido(cliente, authId, idPartido))) resultado = 'sin-permiso';
    else if (rows[0].cancelado || rows[0].marcador_desafiante !== null || !rows[0].futuro) resultado = 'no-cancelable';
    else {
      await cliente.query('UPDATE partido SET cancelado = TRUE, motivo_cancelacion = $2 WHERE id = $1', [idPartido, motivo || null]);
      await cliente.query(
        `UPDATE reservar_cancha SET id_estado_reserva = (SELECT id FROM estado_reserva WHERE lower(nombre) = 'cancelada') WHERE id_partido = $1`,
        [idPartido]
      );
    }
    await cliente.query(resultado === 'cancelado' ? 'COMMIT' : 'ROLLBACK');
    return resultado;
  } catch (err) {
    await cliente.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    cliente.release();
  }
}

const SQL_MIS_EQUIPOS = `
  SELECT e.id FROM equipo e JOIN usuario u ON u.auth_id = $1
   WHERE e.id_usuario_creador = u.id
      OR EXISTS (SELECT 1 FROM equipo_jugador ej JOIN jugador j ON j.id = ej.id_jugador WHERE ej.id_equipo = e.id AND j.id_usuario = u.id)`;

async function listarDeCuentaEntre(authId, desde, hasta) {
  const { rows } = await pool.query(
    `${SQL_PARTIDO}
      WHERE (d.id_equipo_desafiante IN (${SQL_MIS_EQUIPOS}) OR d.id_equipo_desafiado IN (${SQL_MIS_EQUIPOS}))
        AND p.fecha BETWEEN $2::date AND $3::date
      ORDER BY p.fecha, p.hora`,
    [authId, desde, hasta]
  );
  return rows;
}

async function listarDeCuenta(authId, proximos) {
  const { rows } = await pool.query(
    `${SQL_PARTIDO}
      WHERE (d.id_equipo_desafiante IN (${SQL_MIS_EQUIPOS}) OR d.id_equipo_desafiado IN (${SQL_MIS_EQUIPOS}))
        AND ${proximos ? `NOT p.cancelado AND (p.fecha + p.hora) > ${SQL_AHORA}` : `(p.fecha + p.hora) <= ${SQL_AHORA}`}
      ORDER BY p.fecha ${proximos ? 'ASC' : 'DESC'}, p.hora ${proximos ? 'ASC' : 'DESC'}
      LIMIT 30`,
    [authId]
  );
  return rows;
}

async function proximoDeEquipo(idEquipo) {
  const { rows } = await pool.query(
    `${SQL_PARTIDO}
      WHERE (d.id_equipo_desafiante = $1 OR d.id_equipo_desafiado = $1) AND NOT p.cancelado AND (p.fecha + p.hora) > ${SQL_AHORA}
      ORDER BY p.fecha, p.hora LIMIT 1`,
    [idEquipo]
  );
  return rows[0] || null;
}

module.exports = {
  programar,
  obtener,
  registrarResultado,
  cancelar,
  listarDeCuentaEntre,
  listarDeCuenta,
  proximoDeEquipo,
};
