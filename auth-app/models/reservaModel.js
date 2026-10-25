const { pool } = require('../config/db');
const { CLAVES_DIAS_ISO, ZONA_HORARIA } = require('../config/canchas');

const SQL_AHORA = `(now() AT TIME ZONE '${ZONA_HORARIA}')`;

async function bloquearCanchaActiva(cliente, idCancha) {
  const { rows } = await cliente.query(
    `SELECT ca.id, ca.precio_hora, ca.id_modalidad
       FROM cancha ca JOIN recinto_deportivo rd ON rd.id = ca.id_recinto_deportivo
      WHERE ca.id = $1 AND ca.activo AND rd.activo
        FOR UPDATE OF ca`,
    [idCancha]
  );
  return rows[0] || null;
}

async function dentroDeDisponibilidad(cliente, idCancha, fecha, inicio, fin) {
  const { rowCount } = await cliente.query(
    `SELECT 1 FROM disponibilidad_cancha
      WHERE id_cancha = $1 AND dia_semana = ($5::text[])[EXTRACT(ISODOW FROM $2::date)::int]
        AND hora_apertura <= $3::time AND hora_cierre >= $4::time`,
    [idCancha, fecha, inicio, fin, CLAVES_DIAS_ISO]
  );
  return rowCount > 0;
}

async function cruzaConReserva(cliente, idCancha, fecha, inicio, fin) {
  const { rowCount } = await cliente.query(
    `SELECT 1 FROM reservar_cancha r JOIN estado_reserva er ON er.id = r.id_estado_reserva AND lower(er.nombre) = 'confirmada'
      WHERE r.id_cancha = $1 AND r.fecha = $2::date AND r.hora_inicio < $4::time AND r.hora_fin > $3::time`,
    [idCancha, fecha, inicio, fin]
  );
  return rowCount > 0;
}

function calcularCosto(precioHora, inicio, fin) {
  const [hi, mi] = inicio.split(':').map(Number);
  const [hf, mf] = fin.split(':').map(Number);
  return Math.round(Number(precioHora) * (((hf * 60 + mf) - (hi * 60 + mi)) / 60));
}

async function insertarReserva(cliente, { idCancha, idUsuario, fecha, inicio, fin, idPartido = null }) {
  const cancha = await bloquearCanchaActiva(cliente, idCancha);
  if (!cancha) return { resultado: 'cancha-inactiva' };
  if (!(await dentroDeDisponibilidad(cliente, idCancha, fecha, inicio, fin))) return { resultado: 'fuera-de-horario' };
  if (await cruzaConReserva(cliente, idCancha, fecha, inicio, fin)) return { resultado: 'ocupado' };
  const costo = calcularCosto(cancha.precio_hora, inicio, fin);
  const { rows } = await cliente.query(
    `INSERT INTO reservar_cancha (fecha, hora_inicio, hora_fin, id_cancha, id_usuario_reserva, id_estado_reserva, costo, id_partido)
     VALUES ($1, $2, $3, $4, $5, (SELECT id FROM estado_reserva WHERE lower(nombre) = 'confirmada'), $6, $7)
     RETURNING id`,
    [fecha, inicio, fin, idCancha, idUsuario, costo, idPartido]
  );
  return { resultado: 'creada', id: rows[0].id, costo };
}

async function reservar(authId, datos) {
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    const usuario = await cliente.query('SELECT id FROM usuario WHERE auth_id = $1', [authId]);
    const salida = await insertarReserva(cliente, { ...datos, idUsuario: usuario.rows[0].id });
    await cliente.query(salida.resultado === 'creada' ? 'COMMIT' : 'ROLLBACK');
    return salida;
  } catch (err) {
    await cliente.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    cliente.release();
  }
}

async function listarMisReservas(authId) {
  const { rows } = await pool.query(
    `SELECT r.id, to_char(r.fecha, 'YYYY-MM-DD') AS fecha, to_char(r.hora_inicio, 'HH24:MI') AS inicio,
            to_char(r.hora_fin, 'HH24:MI') AS fin, r.costo, r.id_partido, lower(er.nombre) AS estado,
            ca.id AS id_cancha, ca.nombre AS cancha, rd.nombre AS recinto,
            (r.fecha + r.hora_inicio) > ${SQL_AHORA} AS futura
       FROM reservar_cancha r
       JOIN estado_reserva er ON er.id = r.id_estado_reserva
       JOIN cancha ca ON ca.id = r.id_cancha
       JOIN recinto_deportivo rd ON rd.id = ca.id_recinto_deportivo
       JOIN usuario u ON u.id = r.id_usuario_reserva
      WHERE u.auth_id = $1
      ORDER BY futura DESC,
               CASE WHEN (r.fecha + r.hora_inicio) > ${SQL_AHORA} THEN r.fecha + r.hora_inicio END ASC,
               r.fecha DESC, r.hora_inicio DESC`,
    [authId]
  );
  return rows;
}

async function cancelar(authId, idReserva) {
  const { rows } = await pool.query(
    `SELECT r.id, r.id_partido, lower(er.nombre) AS estado, (r.fecha + r.hora_inicio) > ${SQL_AHORA} AS futura
       FROM reservar_cancha r JOIN estado_reserva er ON er.id = r.id_estado_reserva
       JOIN usuario u ON u.id = r.id_usuario_reserva
      WHERE r.id = $1 AND u.auth_id = $2`,
    [idReserva, authId]
  );
  const reserva = rows[0];
  if (!reserva || reserva.estado !== 'confirmada') return { resultado: 'inexistente' };
  if (!reserva.futura) return { resultado: 'pasada' };
  if (reserva.id_partido) return { resultado: 'partido', idPartido: reserva.id_partido };
  await pool.query(
    `UPDATE reservar_cancha SET id_estado_reserva = (SELECT id FROM estado_reserva WHERE lower(nombre) = 'cancelada') WHERE id = $1`,
    [idReserva]
  );
  return { resultado: 'cancelada' };
}

module.exports = {
  SQL_AHORA,
  bloquearCanchaActiva,
  dentroDeDisponibilidad,
  cruzaConReserva,
  calcularCosto,
  insertarReserva,
  reservar,
  listarMisReservas,
  cancelar,
};
