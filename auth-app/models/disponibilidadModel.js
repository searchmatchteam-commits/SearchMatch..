// models/disponibilidadModel.js
// Horario de funcionamiento de cada cancha (tabla "disponibilidad_cancha"): bloques de día + apertura + cierre.
//  AD-003 registrar bloques (sin superponerse en el mismo día) · AD-010 eliminar un bloque · DE-006 consultarlo.
// dia_semana guarda la clave sin tildes de config/canchas.js ('lunes' ... 'domingo').
// Todas las consultas son parametrizadas ($1, $2...).

const { pool } = require('../config/db');
const { CLAVES_DIAS_ISO, ZONA_HORARIA } = require('../config/canchas');

/**
 * Bloques de una cancha ordenados por día de la semana y hora, con cuántas reservas confirmadas
 * futuras caen dentro de cada uno (AD-010: se advierte antes de eliminarlo).
 * @returns {Promise<Array<{id, dia, apertura: 'HH:MM', cierre: 'HH:MM', reservasFuturas: number}>>}
 */
async function listarBloques(idCancha) {
  const { rows } = await pool.query(
    `SELECT dc.id, dc.dia_semana AS dia,
            to_char(dc.hora_apertura, 'HH24:MI') AS apertura, to_char(dc.hora_cierre, 'HH24:MI') AS cierre,
            (SELECT count(*)::int
               FROM reservar_cancha r
               JOIN estado_reserva er ON er.id = r.id_estado_reserva AND lower(er.nombre) = 'confirmada'
              WHERE r.id_cancha = dc.id_cancha
                AND ($2::text[])[EXTRACT(ISODOW FROM r.fecha)::int] = dc.dia_semana
                AND r.hora_inicio < dc.hora_cierre AND r.hora_fin > dc.hora_apertura
                AND (r.fecha + r.hora_fin) > (now() AT TIME ZONE '${ZONA_HORARIA}')) AS reservas_futuras
       FROM disponibilidad_cancha dc
      WHERE dc.id_cancha = $1
      ORDER BY array_position($2::text[], dc.dia_semana::text), dc.hora_apertura`,
    [idCancha, CLAVES_DIAS_ISO]
  );
  return rows.map((fila) => ({ ...fila, reservasFuturas: fila.reservas_futuras }));
}

/**
 * AD-003 · Agrega un bloque si no se superpone con otro del mismo día en la misma cancha.
 * Dos bloques se superponen si uno empieza antes de que el otro termine (los que solo se tocan, no).
 * @returns {Promise<'creado'|'superpuesto'>}
 */
async function crearBloque(idCancha, { dia, apertura, cierre }) {
  const choque = await pool.query(
    `SELECT 1 FROM disponibilidad_cancha
      WHERE id_cancha = $1 AND dia_semana = $2 AND hora_apertura < $4::time AND hora_cierre > $3::time`,
    [idCancha, dia, apertura, cierre]
  );
  if (choque.rowCount > 0) return 'superpuesto';
  await pool.query(
    'INSERT INTO disponibilidad_cancha (dia_semana, hora_apertura, hora_cierre, id_cancha) VALUES ($1, $2, $3, $4)',
    [dia, apertura, cierre, idCancha]
  );
  return 'creado';
}

/**
 * AD-010 · Elimina un bloque. Si era el único del día, ese día queda cerrado.
 * @returns {Promise<{idCancha: number, diaCerrado: boolean}|null>} null si el bloque no existía.
 */
async function eliminarBloque(idBloque) {
  const { rows } = await pool.query(
    'DELETE FROM disponibilidad_cancha WHERE id = $1 RETURNING id_cancha, dia_semana',
    [idBloque]
  );
  if (!rows[0]) return null;
  const quedan = await pool.query(
    'SELECT 1 FROM disponibilidad_cancha WHERE id_cancha = $1 AND dia_semana = $2 LIMIT 1',
    [rows[0].id_cancha, rows[0].dia_semana]
  );
  return { idCancha: rows[0].id_cancha, diaCerrado: quedan.rowCount === 0 };
}

module.exports = { listarBloques, crearBloque, eliminarBloque };
