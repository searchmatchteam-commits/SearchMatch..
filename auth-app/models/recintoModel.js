// models/recintoModel.js
// Recintos deportivos (tablas "recinto_deportivo" y "direccion") para el panel de administración:
//  AD-001 registrar · AD-008 editar · AD-004/AD-005 desactivar y activar · AD-011 listado con filtros.
// Todas las consultas son parametrizadas ($1, $2...).

const { pool } = require('../config/db');
const { ZONA_HORARIA } = require('../config/canchas');

// Reservas confirmadas que todavía no terminan (fecha y hora de Chile). Usa el alias "r" de reservar_cancha.
const SQL_RESERVA_FUTURA = `
  EXISTS (SELECT 1 FROM estado_reserva er WHERE er.id = r.id_estado_reserva AND lower(er.nombre) = 'confirmada')
  AND (r.fecha + r.hora_fin) > (now() AT TIME ZONE '${ZONA_HORARIA}')`;

/**
 * AD-011 · Todos los recintos (activos e inactivos) con comuna, región, cantidad de canchas y sus canchas.
 * @param {{texto?: string, idComuna?: number|null, estado?: 'activos'|'inactivos'|''}} filtros
 */
async function listarRecintos({ texto = '', idComuna = null, estado = '' } = {}) {
  const { rows } = await pool.query(
    `SELECT rd.id, rd.nombre, rd.activo, c.nombre AS comuna, rg.nombre AS region,
            coalesce(json_agg(json_build_object(
                       'id', ca.id, 'nombre', ca.nombre, 'precio', ca.precio_hora, 'activo', ca.activo,
                       'modalidad', m.nombre, 'jugadores', m.cantidad_de_jugadores)
                     ORDER BY ca.nombre) FILTER (WHERE ca.id IS NOT NULL), '[]') AS canchas
       FROM recinto_deportivo rd
       JOIN direccion d ON d.id = rd.id_direccion
       JOIN comunas c ON c.id = d.id_comunas
       JOIN region rg ON rg.id = c.id_region
       LEFT JOIN cancha ca ON ca.id_recinto_deportivo = rd.id
       LEFT JOIN modalidad m ON m.id = ca.id_modalidad
      WHERE ($1 = '' OR rd.nombre ILIKE '%' || $1 || '%')
        AND ($2::int IS NULL OR c.id = $2)
        AND ($3 = '' OR rd.activo = ($3 = 'activos'))
      GROUP BY rd.id, c.nombre, rg.nombre
      ORDER BY rd.activo DESC, rd.nombre`,
    [texto, idComuna, estado]
  );
  return rows.map((fila) => ({ ...fila, totalCanchas: fila.canchas.length }));
}

/** ¿Hay al menos un recinto registrado? (para el estado vacío del panel) */
async function hayRecintos() {
  const { rowCount } = await pool.query('SELECT 1 FROM recinto_deportivo LIMIT 1');
  return rowCount > 0;
}

/**
 * Un recinto con su dirección, comuna y región, y cuántas reservas confirmadas futuras tienen sus canchas.
 * @returns {Promise<object|null>}
 */
async function obtenerRecinto(idRecinto) {
  const { rows } = await pool.query(
    `SELECT rd.id, rd.nombre, rd.telefono, rd.latitud, rd.longitud, rd.activo,
            d.id AS id_direccion, d.calle, d.numero, d.referencias, c.id AS id_comuna, c.nombre AS comuna,
            rg.id AS id_region, rg.nombre AS region,
            (SELECT count(*)::int FROM reservar_cancha r JOIN cancha ca ON ca.id = r.id_cancha
              WHERE ca.id_recinto_deportivo = rd.id AND ${SQL_RESERVA_FUTURA}) AS reservas_futuras
       FROM recinto_deportivo rd
       JOIN direccion d ON d.id = rd.id_direccion
       JOIN comunas c ON c.id = d.id_comunas
       JOIN region rg ON rg.id = c.id_region
      WHERE rd.id = $1`,
    [idRecinto]
  );
  const fila = rows[0];
  if (!fila) return null;
  return {
    id: fila.id,
    nombre: fila.nombre,
    telefono: fila.telefono,
    latitud: fila.latitud === null ? null : Number(fila.latitud),
    longitud: fila.longitud === null ? null : Number(fila.longitud),
    activo: fila.activo,
    idDireccion: fila.id_direccion,
    calle: fila.calle,
    numero: fila.numero || '',
    referencias: fila.referencias || '',
    idComuna: fila.id_comuna,
    comuna: fila.comuna,
    idRegion: fila.id_region,
    region: fila.region,
    reservasFuturas: fila.reservas_futuras,
  };
}

/**
 * AD-001 · Crea la dirección (asociada a la comuna) y el recinto ACTIVO, en UNA transacción.
 * @param {{nombre, telefono, latitud, longitud, calle, numero, referencias, idComuna}} datos - Ya validados.
 * @returns {Promise<number>} El id del recinto creado.
 */
async function crearRecinto(datos) {
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    const direccion = await cliente.query(
      'INSERT INTO direccion (calle, numero, referencias, id_comunas) VALUES ($1, $2, $3, $4) RETURNING id',
      [datos.calle, datos.numero || null, datos.referencias || null, datos.idComuna]
    );
    const recinto = await cliente.query(
      `INSERT INTO recinto_deportivo (nombre, telefono, latitud, longitud, activo, id_direccion)
       VALUES ($1, $2, $3, $4, TRUE, $5) RETURNING id`,
      [datos.nombre, datos.telefono, datos.latitud, datos.longitud, direccion.rows[0].id]
    );
    await cliente.query('COMMIT');
    return recinto.rows[0].id;
  } catch (err) {
    await cliente.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    cliente.release();
  }
}

/** AD-008 · Actualiza el recinto y su dirección, en UNA transacción. @returns {Promise<boolean>} */
async function editarRecinto(idRecinto, datos) {
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    const recinto = await cliente.query(
      `UPDATE recinto_deportivo SET nombre = $2, telefono = $3, latitud = $4, longitud = $5
        WHERE id = $1 RETURNING id_direccion`,
      [idRecinto, datos.nombre, datos.telefono, datos.latitud, datos.longitud]
    );
    if (recinto.rowCount === 0) {
      await cliente.query('ROLLBACK');
      return false;
    }
    await cliente.query(
      'UPDATE direccion SET calle = $2, numero = $3, referencias = $4, id_comunas = $5 WHERE id = $1',
      [recinto.rows[0].id_direccion, datos.calle, datos.numero || null, datos.referencias || null, datos.idComuna]
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

/**
 * AD-004 / AD-005 · Cambia el estado del recinto. Solo actúa si el estado es distinto
 * (desactivar uno ya inactivo no hace nada). Las canchas conservan su propio estado.
 * @returns {Promise<boolean>} true si cambió.
 */
async function cambiarEstadoRecinto(idRecinto, activo) {
  const { rowCount } = await pool.query(
    'UPDATE recinto_deportivo SET activo = $2 WHERE id = $1 AND activo <> $2',
    [idRecinto, activo]
  );
  return rowCount > 0;
}

module.exports = {
  SQL_RESERVA_FUTURA,
  listarRecintos,
  hayRecintos,
  obtenerRecinto,
  crearRecinto,
  editarRecinto,
  cambiarEstadoRecinto,
};
