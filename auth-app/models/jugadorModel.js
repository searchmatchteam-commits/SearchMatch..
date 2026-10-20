// models/jugadorModel.js
// Perfil deportivo del jugador: tabla "jugador" (datos, pie hábil, nivel y
// estadísticas de la carta) y "jugador_posicion". Requiere la sección V de
// sql/seed.sql; si falta, PostgreSQL responde 42703 (columna inexistente).
// Todas las consultas son parametrizadas.

const { pool } = require('../config/db');
const { POSICIONES, NIVELES, ESTADISTICAS } = require('../config/perfilJugador');

// Código de PostgreSQL para "la columna no existe".
const COLUMNA_INEXISTENTE = '42703';

/** Clave del catálogo (ej. 'arquero') a partir del nombre en la tabla posicion. */
function clavePosicion(nombreDb) {
  if (!nombreDb) return null;
  const nombre = nombreDb.toLowerCase();
  const encontrada = Object.entries(POSICIONES).find(([, pos]) => pos.db.some((n) => n.toLowerCase() === nombre));
  return encontrada ? encontrada[0] : null;
}

/** Clave del catálogo (ej. 'intermedio') a partir del nombre en la tabla nivel. */
function claveNivel(nombreDb) {
  if (!nombreDb) return null;
  const nombre = nombreDb.toLowerCase();
  return Object.keys(NIVELES).find((clave) => clave === nombre) || null;
}

/**
 * Perfil del jugador de una cuenta de Supabase Auth.
 * @param {string} authId - UUID de auth.users.
 * @returns {Promise<object|null>} { id, nombre, apellido, fechaNacimiento, altura, peso,
 *          posicion, pieHabil, nivel, stats: {ritmo, ...} | null, perfilCompleto }
 */
async function obtenerPerfil(authId) {
  const columnasStats = ESTADISTICAS.map(({ columna }) => `j.${columna}`).join(', ');
  const consulta = `
    SELECT j.id, j.nombre_apodo, j.apellido,
           to_char(j.fecha_nacimiento, 'YYYY-MM-DD') AS fecha_nacimiento,
           j.altura, j.peso, j.pie_habil, j.perfil_completo, ${columnasStats},
           n.nombre AS nivel,
           (SELECT p.nombre
              FROM jugador_posicion jp
              JOIN posicion p ON p.id = jp.id_posicion
             WHERE jp.id_jugador = j.id
             ORDER BY jp.id
             LIMIT 1) AS posicion
    FROM usuario u
    JOIN jugador j ON j.id_usuario = u.id
    LEFT JOIN nivel n ON n.id = j.id_nivel
    WHERE u.auth_id = $1
  `;
  const { rows } = await pool.query(consulta, [authId]);
  const fila = rows[0];
  if (!fila) return null;

  const tieneStats = ESTADISTICAS.every(({ columna }) => fila[columna] !== null);
  return {
    id: fila.id,
    nombre: fila.nombre_apodo,
    apellido: fila.apellido,
    fechaNacimiento: fila.fecha_nacimiento,
    altura: fila.altura === null ? null : Number(fila.altura),
    peso: fila.peso === null ? null : Number(fila.peso),
    posicion: clavePosicion(fila.posicion),
    pieHabil: fila.pie_habil,
    nivel: claveNivel(fila.nivel),
    stats: tieneStats ? Object.fromEntries(ESTADISTICAS.map(({ clave, columna }) => [clave, fila[columna]])) : null,
    perfilCompleto: fila.perfil_completo,
  };
}

/**
 * Guarda el perfil del wizard en UNA transacción: datos de "jugador",
 * su posición (reemplaza la anterior) y las estadísticas iniciales.
 * Las estadísticas solo se escriben si aún no tenía (no se re-sortean al editar).
 * @param {number} idJugador
 * @param {{nombre, apellido, fechaNacimiento, altura, peso, posicion, pieHabil, nivel}} datos
 *        Ya validados; posicion y nivel son claves de config/perfilJugador.js.
 * @param {object} statsIniciales - { ritmo: 72, ... }
 */
async function guardarPerfil(idJugador, datos, statsIniciales) {
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');

    const posicion = await cliente.query(
      'SELECT id FROM posicion WHERE lower(nombre) = ANY($1) ORDER BY id LIMIT 1',
      [POSICIONES[datos.posicion].db.map((n) => n.toLowerCase())]
    );
    if (posicion.rowCount === 0) {
      throw new Error(`No existe la posición '${datos.posicion}' en la tabla posicion.`);
    }

    const nivel = await cliente.query('SELECT id FROM nivel WHERE lower(nombre) = $1 LIMIT 1', [datos.nivel]);
    if (nivel.rowCount === 0) {
      throw new Error(`No existe el nivel '${datos.nivel}' en la tabla nivel (ejecuta la sección V de sql/seed.sql).`);
    }

    // $9.. = estadísticas; COALESCE conserva las que ya tenía.
    const asignacionStats = ESTADISTICAS.map(({ columna }, i) => `${columna} = COALESCE(${columna}, $${i + 9})`).join(',\n           ');
    await cliente.query(
      `UPDATE jugador
          SET nombre_apodo = $1, apellido = $2, fecha_nacimiento = $3,
              altura = $4, peso = $5, pie_habil = $6, id_nivel = $7,
              ${asignacionStats},
              perfil_completo = TRUE
        WHERE id = $8`,
      [
        datos.nombre,
        datos.apellido,
        datos.fechaNacimiento,
        datos.altura,
        datos.peso,
        datos.pieHabil,
        nivel.rows[0].id,
        idJugador,
        ...ESTADISTICAS.map(({ clave }) => statsIniciales[clave]),
      ]
    );

    // Por ahora una sola posición por jugador: se reemplaza la anterior.
    await cliente.query('DELETE FROM jugador_posicion WHERE id_jugador = $1', [idJugador]);
    await cliente.query('INSERT INTO jugador_posicion (id_jugador, id_posicion) VALUES ($1, $2)', [
      idJugador,
      posicion.rows[0].id,
    ]);

    await cliente.query('COMMIT');
  } catch (err) {
    await cliente.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    cliente.release();
  }
}

module.exports = {
  COLUMNA_INEXISTENTE,
  obtenerPerfil,
  guardarPerfil,
};
