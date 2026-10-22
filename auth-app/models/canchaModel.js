// models/canchaModel.js
// Canchas (tabla "cancha"):
//  - Administración: AD-002 registrar · AD-009 editar · AD-006/AD-007 desactivar y activar.
//  - Usuarios (Fase 3): DE-002 buscar · DE-003 explorar (lista y mapa) · DE-004/DE-005 filtros · DE-006 ficha.
// Los usuarios solo ven canchas ACTIVAS de recintos ACTIVOS (AD-004, AD-006).
// Todas las consultas son parametrizadas ($1, $2...).

const { pool } = require('../config/db');
const { SQL_RESERVA_FUTURA } = require('./recintoModel');
const { ZONA_HORARIA } = require('../config/canchas');

// Código de PostgreSQL para "valor repetido en un índice único" (nombre de cancha en el mismo recinto).
const VALOR_REPETIDO = '23505';

/** Modalidades del catálogo (para los formularios y el filtro), con su cantidad de jugadores. */
async function listarModalidades() {
  const { rows } = await pool.query('SELECT id, nombre, cantidad_de_jugadores AS jugadores FROM modalidad ORDER BY cantidad_de_jugadores, nombre');
  return rows;
}

/* =====================================================================
   Administración
   ===================================================================== */

/** Canchas de un recinto (activas e inactivas) con su modalidad y sus reservas confirmadas futuras. */
async function listarCanchasDeRecinto(idRecinto) {
  const { rows } = await pool.query(
    `SELECT ca.id, ca.nombre, ca.precio_hora AS precio, ca.activo, m.nombre AS modalidad, m.cantidad_de_jugadores AS jugadores,
            (SELECT count(*)::int FROM reservar_cancha r WHERE r.id_cancha = ca.id AND ${SQL_RESERVA_FUTURA}) AS reservas_futuras,
            (SELECT count(*)::int FROM disponibilidad_cancha dc WHERE dc.id_cancha = ca.id) AS bloques
       FROM cancha ca
       JOIN modalidad m ON m.id = ca.id_modalidad
      WHERE ca.id_recinto_deportivo = $1
      ORDER BY ca.activo DESC, ca.nombre`,
    [idRecinto]
  );
  return rows;
}

/** Una cancha con su recinto y modalidad (panel de administración). @returns {Promise<object|null>} */
async function obtenerCanchaAdmin(idCancha) {
  const { rows } = await pool.query(
    `SELECT ca.id, ca.nombre, ca.precio_hora AS precio, ca.activo, ca.id_modalidad,
            m.nombre AS modalidad, m.cantidad_de_jugadores AS jugadores,
            rd.id AS id_recinto, rd.nombre AS recinto, rd.activo AS recinto_activo,
            (SELECT count(*)::int FROM reservar_cancha r WHERE r.id_cancha = ca.id AND ${SQL_RESERVA_FUTURA}) AS reservas_futuras
       FROM cancha ca
       JOIN modalidad m ON m.id = ca.id_modalidad
       JOIN recinto_deportivo rd ON rd.id = ca.id_recinto_deportivo
      WHERE ca.id = $1`,
    [idCancha]
  );
  return rows[0] || null;
}

/** ¿Ya hay en el recinto otra cancha con ese nombre (sin importar mayúsculas)? */
async function nombreRepetido(idRecinto, nombre, idCanchaExcluida = null) {
  const { rowCount } = await pool.query(
    `SELECT 1 FROM cancha
      WHERE id_recinto_deportivo = $1 AND lower(nombre) = lower($2) AND ($3::int IS NULL OR id <> $3)`,
    [idRecinto, nombre, idCanchaExcluida]
  );
  return rowCount > 0;
}

/**
 * AD-002 · Registra una cancha ACTIVA en un recinto ACTIVO.
 * @param {{nombre, precio, idModalidad}} datos - Ya validados.
 * @returns {Promise<'creada'|'recinto-inactivo'|'nombre-repetido'|'inexistente'>}
 */
async function crearCancha(idRecinto, { nombre, precio, idModalidad }) {
  const recinto = await pool.query('SELECT activo FROM recinto_deportivo WHERE id = $1', [idRecinto]);
  if (recinto.rowCount === 0) return 'inexistente';
  if (!recinto.rows[0].activo) return 'recinto-inactivo';
  if (await nombreRepetido(idRecinto, nombre)) return 'nombre-repetido';
  try {
    await pool.query(
      `INSERT INTO cancha (nombre, precio_hora, activo, id_recinto_deportivo, id_modalidad)
       VALUES ($1, $2, TRUE, $3, $4)`,
      [nombre, precio, idRecinto, idModalidad]
    );
    return 'creada';
  } catch (err) {
    if (err.code === VALOR_REPETIDO) return 'nombre-repetido'; // dos administradores a la vez
    throw err;
  }
}

/**
 * Partidos futuros en la cancha con una modalidad distinta a la indicada (AD-009: advertir antes de cambiarla).
 * @returns {Promise<number>}
 */
async function contarPartidosFuturosOtraModalidad(idCancha, idModalidad) {
  const { rows } = await pool.query(
    `SELECT count(*)::int AS total FROM partido p
      WHERE p.id_cancha = $1 AND p.id_modalidad <> $2
        AND (p.fecha + p.hora) > (now() AT TIME ZONE '${ZONA_HORARIA}')`,
    [idCancha, idModalidad]
  );
  return rows[0].total;
}

/**
 * AD-009 · Edita nombre, precio y modalidad. Las reservas ya confirmadas conservan su costo
 * (se guardó en reservar_cancha.costo al reservar).
 * @returns {Promise<'editada'|'nombre-repetido'|'inexistente'>}
 */
async function editarCancha(idCancha, { nombre, precio, idModalidad }) {
  const actual = await pool.query('SELECT id_recinto_deportivo FROM cancha WHERE id = $1', [idCancha]);
  if (actual.rowCount === 0) return 'inexistente';
  if (await nombreRepetido(actual.rows[0].id_recinto_deportivo, nombre, idCancha)) return 'nombre-repetido';
  try {
    await pool.query('UPDATE cancha SET nombre = $2, precio_hora = $3, id_modalidad = $4 WHERE id = $1', [
      idCancha, nombre, precio, idModalidad,
    ]);
    return 'editada';
  } catch (err) {
    if (err.code === VALOR_REPETIDO) return 'nombre-repetido';
    throw err;
  }
}

/** AD-006 / AD-007 · Cambia el estado solo si es distinto. @returns {Promise<boolean>} true si cambió. */
async function cambiarEstadoCancha(idCancha, activo) {
  const { rowCount } = await pool.query('UPDATE cancha SET activo = $2 WHERE id = $1 AND activo <> $2', [idCancha, activo]);
  return rowCount > 0;
}

/* =====================================================================
   Usuarios (Fase 3): solo canchas activas de recintos activos
   ===================================================================== */

// Columnas y uniones comunes de las canchas visibles para los usuarios.
const SQL_CANCHAS_VISIBLES = `
  SELECT ca.id, ca.nombre, ca.precio_hora AS precio,
         m.id AS id_modalidad, m.nombre AS modalidad, m.cantidad_de_jugadores AS jugadores,
         rd.id AS id_recinto, rd.nombre AS recinto, rd.telefono, rd.latitud, rd.longitud,
         d.calle, d.numero, d.referencias, c.id AS id_comuna, c.nombre AS comuna, rg.id AS id_region, rg.nombre AS region
    FROM cancha ca
    JOIN recinto_deportivo rd ON rd.id = ca.id_recinto_deportivo AND rd.activo
    JOIN direccion d ON d.id = rd.id_direccion
    JOIN comunas c ON c.id = d.id_comunas
    JOIN region rg ON rg.id = c.id_region
    JOIN modalidad m ON m.id = ca.id_modalidad
   WHERE ca.activo`;

/** Fila de la base → objeto para las vistas (coordenadas como número, dirección en una línea). */
function canchaParaVista(fila) {
  return {
    ...fila,
    precio: Number(fila.precio),
    latitud: fila.latitud === null ? null : Number(fila.latitud),
    longitud: fila.longitud === null ? null : Number(fila.longitud),
    direccion: [fila.calle, fila.numero].filter(Boolean).join(' '),
  };
}

/**
 * DE-002 a DE-005 · Canchas visibles que coinciden con la búsqueda y los filtros (todos opcionales y combinables).
 * @param {{texto?: string, idRegion?: number|null, idComuna?: number|null, idModalidad?: number|null}} filtros
 */
async function buscarCanchas({ texto = '', idRegion = null, idComuna = null, idModalidad = null } = {}) {
  const { rows } = await pool.query(
    `${SQL_CANCHAS_VISIBLES}
       AND ($1 = '' OR ca.nombre ILIKE '%' || $1 || '%' OR rd.nombre ILIKE '%' || $1 || '%')
       AND ($2::int IS NULL OR rg.id = $2)
       AND ($3::int IS NULL OR c.id = $3)
       AND ($4::int IS NULL OR m.id = $4)
     ORDER BY rd.nombre, ca.nombre`,
    [texto, idRegion, idComuna, idModalidad]
  );
  return rows.map(canchaParaVista);
}

/** DE-003 · ¿Hay alguna cancha visible en toda la plataforma? (estado vacío) */
async function hayCanchasVisibles() {
  const { rowCount } = await pool.query(`${SQL_CANCHAS_VISIBLES} LIMIT 1`);
  return rowCount > 0;
}

/** DE-003 / DE-006 · Ficha de una cancha visible, o null si no existe o está inactiva (o su recinto). */
async function obtenerFichaCancha(idCancha) {
  const { rows } = await pool.query(`${SQL_CANCHAS_VISIBLES} AND ca.id = $1`, [idCancha]);
  return rows[0] ? canchaParaVista(rows[0]) : null;
}

/**
 * DE-006 · Reservas confirmadas de la cancha entre hoy y los próximos "dias" días (hora de Chile).
 * @returns {Promise<Array<{fecha: string, inicio: string, fin: string}>>} fecha "AAAA-MM-DD", horas "HH:MM".
 */
async function reservasConfirmadasProximas(idCancha, dias) {
  const { rows } = await pool.query(
    `SELECT to_char(r.fecha, 'YYYY-MM-DD') AS fecha, to_char(r.hora_inicio, 'HH24:MI') AS inicio,
            to_char(r.hora_fin, 'HH24:MI') AS fin
       FROM reservar_cancha r
       JOIN estado_reserva er ON er.id = r.id_estado_reserva AND lower(er.nombre) = 'confirmada'
      WHERE r.id_cancha = $1
        AND r.fecha BETWEEN (now() AT TIME ZONE '${ZONA_HORARIA}')::date
                        AND (now() AT TIME ZONE '${ZONA_HORARIA}')::date + $2::int
      ORDER BY r.fecha, r.hora_inicio`,
    [idCancha, dias]
  );
  return rows;
}

module.exports = {
  listarModalidades,
  listarCanchasDeRecinto,
  obtenerCanchaAdmin,
  crearCancha,
  contarPartidosFuturosOtraModalidad,
  editarCancha,
  cambiarEstadoCancha,
  buscarCanchas,
  hayCanchasVisibles,
  obtenerFichaCancha,
  reservasConfirmadasProximas,
};
