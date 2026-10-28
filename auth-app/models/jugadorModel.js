const { pool } = require('../config/db');
const { POSICIONES, ESTADISTICAS } = require('../config/perfilJugador');

const COLUMNA_INEXISTENTE = '42703';

function clavePosicion(nombreDb) {
  if (!nombreDb) return null;
  const nombre = nombreDb.toLowerCase();
  const encontrada = Object.entries(POSICIONES).find(([, pos]) => pos.db.some((n) => n.toLowerCase() === nombre));
  return encontrada ? encontrada[0] : null;
}

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
    apodo: fila.apodo || '',
    fechaNacimiento: fila.fecha_nacimiento,
    altura: fila.altura === null ? null : Number(fila.altura),
    peso: fila.peso === null ? null : Number(fila.peso),
    posiciones,
    posicion: posiciones[0] || null,
    stats: tieneStats ? Object.fromEntries(ESTADISTICAS.map(({ clave, columna }) => [clave, fila[columna]])) : null,
    perfilCompleto: fila.perfil_completo,
    fotoVersion: fila.foto_actualizada ? fila.foto_actualizada.getTime() : null,
  };
}

function obtenerPerfil(authId) {
  return leerPerfil('u.auth_id', authId);
}

function obtenerPerfilPorId(idJugador) {
  return leerPerfil('j.id', idJugador);
}

/** PE-010: cuenta dueña de un jugador (para no mostrar perfiles de cuentas inactivas ni el propio). */
async function cuentaDeJugador(idJugador) {
  const { rows } = await pool.query(
    'SELECT u.auth_id, u.activo FROM jugador j JOIN usuario u ON u.id = j.id_usuario WHERE j.id = $1',
    [idJugador]
  );
  return rows[0] ? { authId: rows[0].auth_id, activo: rows[0].activo !== false } : null;
}


async function escribirPerfil(idJugador, datos, stats, conservarStats) {
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');

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

    // PE-002: el editor también cambia nombre y apellido (el wizard no los envía: se piden en el registro).
    if (datos.nombre !== undefined) {
      await cliente.query('UPDATE jugador SET nombre_apodo = $1, apellido = $2 WHERE id = $3', [datos.nombre, datos.apellido, idJugador]);
    }

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

function guardarPerfil(idJugador, datos, statsIniciales) {
  return escribirPerfil(idJugador, datos, statsIniciales, true);
}

function actualizarPerfil(idJugador, datos, stats) {
  return escribirPerfil(idJugador, datos, stats, false);
}

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

async function obtenerFotoPorId(idJugador) {
  const { rows } = await pool.query('SELECT foto, foto_tipo FROM jugador WHERE id = $1 AND foto IS NOT NULL', [idJugador]);
  return rows[0] ? { datos: rows[0].foto, tipo: rows[0].foto_tipo } : null;
}

async function guardarFoto(idJugador, datos, tipo) {
  await pool.query('UPDATE jugador SET foto = $1, foto_tipo = $2, foto_actualizada = NOW() WHERE id = $3', [
    datos,
    tipo,
    idJugador,
  ]);
}

async function eliminarFoto(idJugador) {
  await pool.query('UPDATE jugador SET foto = NULL, foto_tipo = NULL, foto_actualizada = NULL WHERE id = $1', [idJugador]);
}

module.exports = {
  COLUMNA_INEXISTENTE,
  obtenerPerfil,
  obtenerPerfilPorId,
  cuentaDeJugador,
  guardarPerfil,
  actualizarPerfil,
  obtenerFoto,
  obtenerFotoPorId,
  guardarFoto,
  eliminarFoto,
};
