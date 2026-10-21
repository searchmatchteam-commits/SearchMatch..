// models/jugadorModel.js
// Perfil deportivo del jugador: tabla "jugador" (datos, estadísticas de la carta,
// foto, apodo) y "jugador_posicion". Requiere las secciones V, X e Y
// de sql/seed.sql; si faltan, PostgreSQL responde 42703 (columna inexistente).
// Todas las consultas son parametrizadas.

const { pool } = require('../config/db');
const { POSICIONES, ESTADISTICAS } = require('../config/perfilJugador');

// Código de PostgreSQL para "la columna no existe".
const COLUMNA_INEXISTENTE = '42703';

/** Clave del catálogo (ej. 'arquero') a partir del nombre en la tabla posicion. */
function clavePosicion(nombreDb) {
  if (!nombreDb) return null;
  const nombre = nombreDb.toLowerCase();
  const encontrada = Object.entries(POSICIONES).find(([, pos]) => pos.db.some((n) => n.toLowerCase() === nombre));
  return encontrada ? encontrada[0] : null;
}

/**
 * Perfil de un jugador: el de una cuenta (filtro 'u.auth_id') o uno por su id (filtro 'j.id').
 * @param {'u.auth_id'|'j.id'} filtro - Columna fija del código, nunca algo que llegue del usuario.
 * @returns {Promise<object|null>} { id, nombre, apellido, apodo ('' si no tiene), fechaNacimiento, altura, peso,
 *          posiciones: ['defensa', ...], posicion: la primera (principal) | null,
 *          stats: {ritmo, ...} | null, perfilCompleto,
 *          fotoVersion: ms de la última foto (para la URL) | null }
 */
async function leerPerfil(filtro, valor) {
  const columnasStats = ESTADISTICAS.map(({ columna }) => `j.${columna}`).join(', ');
  const consulta = `
    SELECT j.id, j.nombre_apodo, j.apellido, j.apodo,
           to_char(j.fecha_nacimiento, 'YYYY-MM-DD') AS fecha_nacimiento,
           j.altura, j.peso, j.perfil_completo, j.foto_actualizada, ${columnasStats},
           ARRAY(SELECT p.nombre
                   FROM jugador_posicion jp
                   JOIN posicion p ON p.id = jp.id_posicion
                  WHERE jp.id_jugador = j.id
                  ORDER BY jp.id) AS posiciones
    FROM usuario u
    JOIN jugador j ON j.id_usuario = u.id
    WHERE ${filtro} = $1
  `;
  const { rows } = await pool.query(consulta, [valor]);
  const fila = rows[0];
  if (!fila) return null;

  const tieneStats = ESTADISTICAS.every(({ columna }) => fila[columna] !== null);
  const posiciones = fila.posiciones.map(clavePosicion).filter(Boolean);
  return {
    id: fila.id,
    nombre: fila.nombre_apodo,
    apellido: fila.apellido,
    apodo: fila.apodo || '', // los perfiles anteriores al apodo no tienen
    fechaNacimiento: fila.fecha_nacimiento,
    altura: fila.altura === null ? null : Number(fila.altura),
    peso: fila.peso === null ? null : Number(fila.peso),
    posiciones,
    posicion: posiciones[0] || null, // la principal (la que muestra la carta)
    stats: tieneStats ? Object.fromEntries(ESTADISTICAS.map(({ clave, columna }) => [clave, fila[columna]])) : null,
    perfilCompleto: fila.perfil_completo,
    fotoVersion: fila.foto_actualizada ? fila.foto_actualizada.getTime() : null,
  };
}

/** Perfil del jugador de una cuenta de Supabase Auth (ver leerPerfil). */
function obtenerPerfil(authId) {
  return leerPerfil('u.auth_id', authId);
}

/** Perfil de un jugador por su id (el capitán revisando una solicitud; ver leerPerfil). */
function obtenerPerfilPorId(idJugador) {
  return leerPerfil('j.id', idJugador);
}


/**
 * Escribe el perfil en UNA transacción: datos de "jugador",
 * sus posiciones (reemplazan las anteriores) y las estadísticas.
 * @param {number} idJugador
 * @param {{apodo, fechaNacimiento, altura, peso, posiciones}} datos
 *        Ya validados; posiciones (1 o más, la primera es la principal) son
 *        claves de config/perfilJugador.js.
 * @param {object} stats - { ritmo: 72, ... }
 * @param {boolean} conservarStats - true: solo se escriben si aún no tenía (wizard).
 */
async function escribirPerfil(idJugador, datos, stats, conservarStats) {
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');

    // Id de cada posición elegida, en el mismo orden (la primera es la principal).
    const idsPosiciones = [];
    for (const clave of datos.posiciones) {
      const posicion = await cliente.query(
        'SELECT id FROM posicion WHERE lower(nombre) = ANY($1) ORDER BY id LIMIT 1',
        [POSICIONES[clave].db.map((n) => n.toLowerCase())]
      );
      if (posicion.rowCount === 0) {
        throw new Error(`No existe la posición '${clave}' en la tabla posicion.`);
      }
      idsPosiciones.push(posicion.rows[0].id);
    }

    // Nombre y apellido no se tocan: se piden solo al crear la cuenta (/registro).
    // Pie hábil y nivel ya no se piden: las columnas quedan como estaban.
    // $6.. = estadísticas; con conservarStats, COALESCE deja las que ya tenía.
    const asignacionStats = ESTADISTICAS.map(({ columna }, i) => (
      conservarStats ? `${columna} = COALESCE(${columna}, $${i + 6})` : `${columna} = $${i + 6}`
    )).join(',\n           ');
    await cliente.query(
      `UPDATE jugador
          SET apodo = $1, fecha_nacimiento = $2, altura = $3, peso = $4,
              ${asignacionStats},
              perfil_completo = TRUE
        WHERE id = $5`,
      [
        datos.apodo,
        datos.fechaNacimiento,
        datos.altura,
        datos.peso,
        idJugador,
        ...ESTADISTICAS.map(({ clave }) => stats[clave]),
      ]
    );

    // Se reemplazan todas: WITH ORDINALITY inserta en el orden elegido (jp.id marca la principal).
    await cliente.query('DELETE FROM jugador_posicion WHERE id_jugador = $1', [idJugador]);
    await cliente.query(
      `INSERT INTO jugador_posicion (id_jugador, id_posicion)
       SELECT $1, id FROM unnest($2::int[]) WITH ORDINALITY AS t(id, orden) ORDER BY orden`,
      [idJugador, idsPosiciones]
    );

    await cliente.query('COMMIT');
  } catch (err) {
    await cliente.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    cliente.release();
  }
}

/**
 * Wizard (primera vez): guarda el perfil con las estadísticas sorteadas.
 * Si ya tenía estadísticas no se re-sortean.
 */
function guardarPerfil(idJugador, datos, statsIniciales) {
  return escribirPerfil(idJugador, datos, statsIniciales, true);
}

/** Editor /perfil/editar: guarda el perfil con las estadísticas que eligió el jugador. */
function actualizarPerfil(idJugador, datos, stats) {
  return escribirPerfil(idJugador, datos, stats, false);
}

/**
 * Foto del jugador de una cuenta (la sirve GET /perfil/foto).
 * @returns {Promise<{datos: Buffer, tipo: string}|null>}
 */
async function obtenerFoto(authId) {
  const { rows } = await pool.query(
    `SELECT j.foto, j.foto_tipo
       FROM usuario u
       JOIN jugador j ON j.id_usuario = u.id
      WHERE u.auth_id = $1 AND j.foto IS NOT NULL`,
    [authId]
  );
  return rows[0] ? { datos: rows[0].foto, tipo: rows[0].foto_tipo } : null;
}

/**
 * Foto de un jugador por su id (la sirve GET /mi-equipo/solicitudes/:id/foto).
 * @returns {Promise<{datos: Buffer, tipo: string}|null>}
 */
async function obtenerFotoPorId(idJugador) {
  const { rows } = await pool.query('SELECT foto, foto_tipo FROM jugador WHERE id = $1 AND foto IS NOT NULL', [idJugador]);
  return rows[0] ? { datos: rows[0].foto, tipo: rows[0].foto_tipo } : null;
}

/**
 * Reemplaza la foto del jugador.
 * @param {Buffer} datos - Imagen ya validada.
 * @param {string} tipo - 'image/jpeg' | 'image/png' | 'image/webp'
 */
async function guardarFoto(idJugador, datos, tipo) {
  await pool.query('UPDATE jugador SET foto = $1, foto_tipo = $2, foto_actualizada = NOW() WHERE id = $3', [
    datos,
    tipo,
    idJugador,
  ]);
}

/** Quita la foto: la carta vuelve a la silueta. */
async function eliminarFoto(idJugador) {
  await pool.query('UPDATE jugador SET foto = NULL, foto_tipo = NULL, foto_actualizada = NULL WHERE id = $1', [idJugador]);
}

module.exports = {
  COLUMNA_INEXISTENTE,
  obtenerPerfil,
  obtenerPerfilPorId,
  guardarPerfil,
  actualizarPerfil,
  obtenerFoto,
  obtenerFotoPorId,
  guardarFoto,
  eliminarFoto,
};
