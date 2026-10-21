// models/equipoModel.js
// Equipos: tabla "equipo" (nombre, zona, correo, modalidad, nivel y usuario creador),
// el plantel en "equipo_jugador" (rol "capitan" o "integrante" de rol_equipo, con el
// nombre y la posición desde "jugador"), las solicitudes en "solicitud_union_equipo"
// y los desafíos entre equipos en "desafio" (estados en "estado_desafio").
// Requiere las secciones W, Z (mensaje de la solicitud) y AA (escudo y posiciones en la cancha) de sql/seed.sql. Todas las consultas son parametrizadas.

const { pool } = require('../config/db');
const { NIVELES, POSICIONES, ESTADISTICAS } = require('../config/perfilJugador');
const { MODALIDADES } = require('../config/equipo');

// Nombres aceptados en los catálogos (se buscan en minúsculas).
const NOMBRES_ROL_CAPITAN = ['capitán', 'capitan'];
const ESTADO_PENDIENTE = 'pendiente';
const ESTADO_ACEPTADA = 'aceptada';
const ESTADO_RECHAZADA = 'rechazada';
const ROL_INTEGRANTE = 'integrante';
const ESTADO_DESAFIO_PENDIENTE = 'pendiente'; // tabla estado_desafio

/** "Fútbol 11 · Intermedio · Puente Alto" (omite lo que falte). */
function detalleEquipo(fila) {
  return [MODALIDADES[fila.jugadores], fila.nivel, fila.zona].filter(Boolean).join(' · ');
}

/** URL del escudo subido (la versión evita que el navegador muestre uno viejo), o null: la vista usa la inicial. */
function urlEscudo(fila) {
  return fila.escudo_actualizado ? `/equipos/${fila.id}/escudo?v=${fila.escudo_actualizado.getTime()}` : null;
}

/**
 * Equipo activo que creó la cuenta (su capitán).
 * @param {string} authId - UUID de auth.users.
 * @returns {Promise<{id, nombre, zona, modalidad, nivel, detalle}|null>}
 */
async function obtenerEquipoDeCapitan(authId) {
  const { rows } = await pool.query(
    `SELECT e.id, e.nombre, e.zona, e.escudo_actualizado, m.cantidad_de_jugadores AS jugadores, n.nombre AS nivel
       FROM usuario u
       JOIN equipo e ON e.id_usuario_creador = u.id AND e.activo
       LEFT JOIN modalidad m ON m.id = e.id_modalidad
       LEFT JOIN nivel n ON n.id = e.id_nivel
      WHERE u.auth_id = $1
      ORDER BY e.id
      LIMIT 1`,
    [authId]
  );
  const fila = rows[0];
  if (!fila) return null;
  return {
    id: fila.id,
    nombre: fila.nombre,
    zona: fila.zona,
    modalidad: MODALIDADES[fila.jugadores] || null,
    nivel: fila.nivel,
    detalle: detalleEquipo(fila),
    escudo: urlEscudo(fila),
  };
}

/** Clave del catálogo (ej. 'arquero') a partir del nombre en la tabla posicion. */
function clavePosicion(nombreDb) {
  if (!nombreDb) return null;
  const nombre = nombreDb.toLowerCase();
  const encontrada = Object.entries(POSICIONES).find(([, pos]) => pos.db.some((n) => n.toLowerCase() === nombre));
  return encontrada ? encontrada[0] : null;
}

/** Etiqueta de la posición (ej. 'Portero') a partir del nombre en la tabla posicion. */
function etiquetaPosicion(nombreDb) {
  const clave = clavePosicion(nombreDb);
  return clave ? POSICIONES[clave].etiqueta : nombreDb;
}

// Equipos activos de la cuenta ($1): los que creó y a los que pertenece según "equipo_jugador".
// Solo es capitán de los que creó (equipo.id_usuario_creador); en el resto es jugador.
// El creador los encuentra aunque falte su fila en equipo_jugador o en jugador.
// $2: un equipo en particular (o null para todos). Primero los que capitanea.
const SQL_MIS_EQUIPOS = `
  SELECT e.id, e.nombre, e.zona, e.escudo_actualizado, m.cantidad_de_jugadores AS jugadores, n.nombre AS nivel,
         e.id_usuario_creador = u.id AS soy_capitan
    FROM usuario u
    LEFT JOIN jugador j ON j.id_usuario = u.id
    JOIN equipo e ON e.activo
     AND (e.id_usuario_creador = u.id
          OR EXISTS (SELECT 1 FROM equipo_jugador x WHERE x.id_equipo = e.id AND x.id_jugador = j.id))
    LEFT JOIN modalidad m ON m.id = e.id_modalidad
    LEFT JOIN nivel n ON n.id = e.id_nivel
   WHERE u.auth_id = $1 AND ($2::int IS NULL OR e.id = $2)
   ORDER BY soy_capitan DESC, e.id`;

function filaMiEquipo(fila) {
  return {
    id: fila.id,
    nombre: fila.nombre,
    zona: fila.zona,
    detalle: detalleEquipo(fila),
    escudo: urlEscudo(fila),
    soyCapitan: Boolean(fila.soy_capitan),
  };
}

/**
 * Equipo activo de la cuenta (ver SQL_MIS_EQUIPOS). Si tiene varios, prioriza el que capitanea.
 * @param {string} authId - UUID de auth.users.
 * @param {number|null} [idEquipo] - Uno en particular: null si la cuenta no pertenece a ese equipo.
 * @returns {Promise<{id, nombre, zona, detalle, escudo: string|null, soyCapitan: boolean}|null>}
 */
async function obtenerMiEquipo(authId, idEquipo = null) {
  const { rows } = await pool.query(`${SQL_MIS_EQUIPOS} LIMIT 1`, [authId, idEquipo]);
  return rows[0] ? filaMiEquipo(rows[0]) : null;
}

/**
 * Todos los equipos activos de la cuenta (ver SQL_MIS_EQUIPOS), primero los que capitanea.
 * @param {string} authId - UUID de auth.users.
 * @returns {Promise<Array<{id, nombre, zona, detalle, soyCapitan: boolean}>>}
 */
async function listarMisEquipos(authId) {
  const { rows } = await pool.query(SQL_MIS_EQUIPOS, [authId, null]);
  return rows.map(filaMiEquipo);
}

/**
 * "Mis equipos" (dashboard y /mis-equipos): los equipos de la cuenta, cada uno con su plantel.
 * @param {string} authId - UUID de auth.users.
 * @returns {Promise<Array<{id, nombre, zona, detalle, soyCapitan: boolean, plantel: Array}>>}
 */
async function listarMisEquiposConPlantel(authId) {
  const equipos = await listarMisEquipos(authId);
  const planteles = await Promise.all(equipos.map((equipo) => listarPlantel(equipo.id)));
  return equipos.map((equipo, i) => ({ ...equipo, plantel: planteles[i] }));
}

/**
 * Plantel de un equipo: equipo_jugador + jugador (nombre, carta y foto) + su primera posición + rol,
 * y dónde dejó el capitán su carta en la cancha. El capitán va primero; el resto, en orden de llegada.
 * @param {number} idEquipo
 * @returns {Promise<Array<{id, nombre, nombreCarta, posicion, clavePosicion, capitan: boolean,
 *          stats: {ritmo, ...}|null, fotoVersion: number|null, posX: number|null, posY: number|null}>>}
 *          clavePosicion: 'arquero' | 'defensa' | 'mediocampista' | 'delantero' | null (la línea en la cancha).
 */
async function listarPlantel(idEquipo) {
  const columnasStats = ESTADISTICAS.map(({ columna }) => `j.${columna}`).join(', ');
  const { rows } = await pool.query(
    `SELECT j.id, trim(concat_ws(' ', j.nombre_apodo, j.apellido)) AS nombre,
            coalesce(nullif(j.apodo, ''), j.nombre_apodo) AS nombre_carta,
            j.foto_actualizada, ${columnasStats}, ej.pos_x, ej.pos_y,
            (SELECT p.nombre
               FROM jugador_posicion jp
               JOIN posicion p ON p.id = jp.id_posicion
              WHERE jp.id_jugador = j.id
              ORDER BY jp.id
              LIMIT 1) AS posicion,
            lower(r.nombre) = ANY($2) AS capitan
       FROM equipo_jugador ej
       JOIN jugador j ON j.id = ej.id_jugador
       LEFT JOIN rol_equipo r ON r.id = ej.id_rol_equipo
      WHERE ej.id_equipo = $1
      ORDER BY capitan DESC NULLS LAST, ej.id`,
    [idEquipo, NOMBRES_ROL_CAPITAN]
  );
  return rows.map((fila) => ({
    id: fila.id,
    nombre: fila.nombre || 'Jugador',
    nombreCarta: fila.nombre_carta || 'Jugador', // apodo si tiene (como en su carta)
    posicion: etiquetaPosicion(fila.posicion) || 'Sin posición',
    clavePosicion: clavePosicion(fila.posicion),
    capitan: Boolean(fila.capitan),
    stats: ESTADISTICAS.every(({ columna }) => fila[columna] !== null)
      ? Object.fromEntries(ESTADISTICAS.map(({ clave, columna }) => [clave, fila[columna]]))
      : null,
    fotoVersion: fila.foto_actualizada ? fila.foto_actualizada.getTime() : null,
    posX: fila.pos_x === null ? null : Number(fila.pos_x),
    posY: fila.pos_y === null ? null : Number(fila.pos_y),
  }));
}

/**
 * El capitán deja la carta de un jugador en un punto de la cancha (en % del ancho y del alto).
 * Solo el que creó el equipo, y solo con jugadores de su plantel.
 * @param {string} authId - UUID de auth.users (el capitán).
 * @returns {Promise<boolean>} false si el equipo no es suyo o el jugador no está en el plantel.
 */
async function guardarPosicionEnCancha(authId, idEquipo, idJugador, x, y) {
  const { rowCount } = await pool.query(
    `UPDATE equipo_jugador ej
        SET pos_x = $4, pos_y = $5
       FROM equipo e
       JOIN usuario u ON u.id = e.id_usuario_creador
      WHERE ej.id_equipo = e.id AND e.id = $2 AND e.activo AND u.auth_id = $1 AND ej.id_jugador = $3`,
    [authId, idEquipo, idJugador, x, y]
  );
  return rowCount > 0;
}

/**
 * Reemplaza el escudo del equipo (solo el capitán que lo creó).
 * @param {Buffer} datos - Imagen ya validada.
 * @param {string} tipo - 'image/jpeg' | 'image/png' | 'image/webp'
 * @returns {Promise<boolean>} false si el equipo no es de esta cuenta.
 */
async function guardarEscudo(authId, idEquipo, datos, tipo) {
  const { rowCount } = await pool.query(
    `UPDATE equipo e
        SET escudo = $3, escudo_tipo = $4, escudo_actualizado = NOW()
       FROM usuario u
      WHERE e.id = $2 AND e.activo AND u.id = e.id_usuario_creador AND u.auth_id = $1`,
    [authId, idEquipo, datos, tipo]
  );
  return rowCount > 0;
}

/**
 * Escudo de un equipo activo (lo sirve GET /equipos/:id/escudo).
 * @returns {Promise<{datos: Buffer, tipo: string}|null>}
 */
async function obtenerEscudo(idEquipo) {
  const { rows } = await pool.query('SELECT escudo, escudo_tipo FROM equipo WHERE id = $1 AND activo AND escudo IS NOT NULL', [
    idEquipo,
  ]);
  return rows[0] ? { datos: rows[0].escudo, tipo: rows[0].escudo_tipo } : null;
}

/**
 * Solicitudes pendientes de un equipo, de la más antigua a la más nueva,
 * con el nombre y la primera posición del jugador y su mensaje.
 * @param {number} idEquipo
 * @returns {Promise<Array<{id, nombre, posicion, mensaje: string|null}>>} id es el de la solicitud.
 */
async function listarSolicitudesPendientes(idEquipo) {
  const { rows } = await pool.query(
    `SELECT s.id, s.mensaje, trim(concat_ws(' ', j.nombre_apodo, j.apellido)) AS nombre,
            (SELECT p.nombre
               FROM jugador_posicion jp
               JOIN posicion p ON p.id = jp.id_posicion
              WHERE jp.id_jugador = j.id
              ORDER BY jp.id
              LIMIT 1) AS posicion
       FROM solicitud_union_equipo s
       JOIN estado_solicitud es ON es.id = s.id_estado_solicitud
       JOIN jugador j ON j.id = s.id_jugador
      WHERE s.id_equipo = $1 AND lower(es.nombre) = $2
      ORDER BY s.fecha_solicitud, s.id`,
    [idEquipo, ESTADO_PENDIENTE]
  );
  return rows.map((fila) => ({
    id: fila.id,
    nombre: fila.nombre || 'Jugador',
    posicion: etiquetaPosicion(fila.posicion) || 'Sin posición',
    mensaje: fila.mensaje,
  }));
}

/**
 * Una solicitud de un equipo creado por la cuenta (para que su capitán vea el perfil y el mensaje).
 * Cualquier estado: si ya se respondió, la vista lo dice en vez de mostrar Aceptar/Rechazar.
 * @param {string} authId - UUID de auth.users (el capitán).
 * @param {number} idSolicitud
 * @returns {Promise<{id, idJugador, mensaje, fecha: Date, estado: string, pendiente: boolean,
 *          equipo: {id, nombre}}|null>} null si no existe o no es de un equipo suyo.
 */
async function obtenerSolicitudDeMiEquipo(authId, idSolicitud) {
  const { rows } = await pool.query(
    `SELECT s.id, s.id_jugador, s.mensaje, s.fecha_solicitud, lower(es.nombre) AS estado,
            e.id AS id_equipo, e.nombre AS equipo
       FROM solicitud_union_equipo s
       JOIN estado_solicitud es ON es.id = s.id_estado_solicitud
       JOIN equipo e ON e.id = s.id_equipo AND e.activo
       JOIN usuario u ON u.id = e.id_usuario_creador
      WHERE s.id = $1 AND u.auth_id = $2`,
    [idSolicitud, authId]
  );
  const fila = rows[0];
  if (!fila) return null;
  return {
    id: fila.id,
    idJugador: fila.id_jugador,
    mensaje: fila.mensaje,
    fecha: fila.fecha_solicitud,
    estado: fila.estado,
    pendiente: fila.estado === ESTADO_PENDIENTE,
    equipo: { id: fila.id_equipo, nombre: fila.equipo },
  };
}

/**
 * El capitán acepta o rechaza una solicitud, en UNA transacción:
 *  1) Bloquea la solicitud y comprueba que siga pendiente y que sea de un equipo
 *     creado por esta cuenta (nadie más puede responderla).
 *  2) La marca como aceptada o rechazada, con la fecha de respuesta.
 *  3) Si se acepta, suma al jugador al plantel con el rol "integrante".
 * @param {string} authId - UUID de auth.users (el capitán).
 * @param {number} idSolicitud
 * @param {boolean} aceptar
 * @returns {Promise<'aceptada'|'rechazada'|'inexistente'>}
 */
async function responderSolicitud(authId, idSolicitud, aceptar) {
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');

    // 1) Solicitud pendiente de un equipo de este capitán
    const solicitud = await cliente.query(
      `SELECT s.id_jugador, s.id_equipo
         FROM solicitud_union_equipo s
         JOIN estado_solicitud es ON es.id = s.id_estado_solicitud
         JOIN equipo e ON e.id = s.id_equipo AND e.activo
         JOIN usuario u ON u.id = e.id_usuario_creador
        WHERE s.id = $1 AND u.auth_id = $2 AND lower(es.nombre) = $3
          FOR UPDATE OF s`,
      [idSolicitud, authId, ESTADO_PENDIENTE]
    );
    if (solicitud.rowCount === 0) {
      await cliente.query('ROLLBACK');
      return 'inexistente';
    }
    const { id_jugador: idJugador, id_equipo: idEquipo } = solicitud.rows[0];

    // 2) Nuevo estado
    const resultado = aceptar ? ESTADO_ACEPTADA : ESTADO_RECHAZADA;
    const estado = await cliente.query('SELECT id FROM estado_solicitud WHERE lower(nombre) = $1', [resultado]);
    if (estado.rowCount === 0) throw new Error(`No existe el estado '${resultado}' en la tabla estado_solicitud.`);
    await cliente.query(
      'UPDATE solicitud_union_equipo SET id_estado_solicitud = $2, fecha_respuesta = now() WHERE id = $1',
      [idSolicitud, estado.rows[0].id]
    );

    // 3) Al plantel como integrante (si ya estaba, no se duplica: UNIQUE (id_jugador, id_equipo))
    if (aceptar) {
      const rol = await cliente.query('SELECT id FROM rol_equipo WHERE lower(nombre) = $1', [ROL_INTEGRANTE]);
      if (rol.rowCount === 0) throw new Error(`No existe el rol '${ROL_INTEGRANTE}' en la tabla rol_equipo.`);
      await cliente.query(
        `INSERT INTO equipo_jugador (id_jugador, id_equipo, id_rol_equipo) VALUES ($1, $2, $3)
         ON CONFLICT (id_jugador, id_equipo) DO NOTHING`,
        [idJugador, idEquipo, rol.rows[0].id]
      );
    }

    await cliente.query('COMMIT');
    return resultado;
  } catch (err) {
    await cliente.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    cliente.release();
  }
}

/**
 * Rivales para desafiar: equipos activos menos el propio, con el estado del
 * último desafío PENDIENTE entre ambos (para el botón "Enviar Desafío").
 * @param {number} idEquipo - El equipo del capitán.
 * @returns {Promise<Array<{id, nombre, zona, nivel, modalidad, desafio: 'enviado'|'recibido'|null}>>}
 */
async function listarRivales(idEquipo) {
  const { rows } = await pool.query(
    `SELECT e.id, e.nombre, e.zona, e.escudo_actualizado, m.cantidad_de_jugadores AS jugadores, n.nombre AS nivel,
            EXISTS (SELECT 1 FROM desafio d JOIN estado_desafio ed ON ed.id = d.id_estado_desafio
                     WHERE d.id_equipo_desafiante = $1 AND d.id_equipo_desafiado = e.id
                       AND lower(ed.nombre) = $2) AS enviado,
            EXISTS (SELECT 1 FROM desafio d JOIN estado_desafio ed ON ed.id = d.id_estado_desafio
                     WHERE d.id_equipo_desafiante = e.id AND d.id_equipo_desafiado = $1
                       AND lower(ed.nombre) = $2) AS recibido
       FROM equipo e
       LEFT JOIN modalidad m ON m.id = e.id_modalidad
       LEFT JOIN nivel n ON n.id = e.id_nivel
      WHERE e.activo AND e.id <> $1
      ORDER BY e.nombre`,
    [idEquipo, ESTADO_DESAFIO_PENDIENTE]
  );
  return rows.map((fila) => ({
    id: fila.id,
    nombre: fila.nombre,
    zona: fila.zona,
    nivel: fila.nivel,
    modalidad: MODALIDADES[fila.jugadores] || null,
    escudo: urlEscudo(fila),
    desafio: fila.enviado ? 'enviado' : fila.recibido ? 'recibido' : null,
  }));
}

/**
 * El capitán desafía a otro equipo, en UNA transacción:
 *  1) Busca el equipo que capitanea (el que creó) y lo bloquea: dos clics
 *     seguidos no crean dos desafíos.
 *  2) Comprueba que el rival exista, esté activo y no tenga ya un desafío
 *     pendiente con este equipo (en cualquier sentido).
 *  3) Inserta el desafío como "pendiente" (fecha_solicitud la pone la base).
 * @param {string} authId - UUID de auth.users (el capitán).
 * @param {number} idRival
 * @param {string|null} mensaje - Ya validado (fecha tentativa y/o mensaje).
 * @returns {Promise<'enviado'|'pendiente'|'sin-equipo'|'inexistente'>}
 */
async function enviarDesafio(authId, idRival, mensaje) {
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');

    // 1) Equipo del capitán
    const propio = await cliente.query(
      `SELECT e.id
         FROM usuario u
         JOIN equipo e ON e.id_usuario_creador = u.id AND e.activo
        WHERE u.auth_id = $1
        ORDER BY e.id
        LIMIT 1
          FOR UPDATE OF e`,
      [authId]
    );
    let resultado;
    if (propio.rowCount === 0) {
      resultado = 'sin-equipo';
    } else {
      const idEquipo = propio.rows[0].id;

      // 2) Rival válido y sin desafío pendiente entre ambos
      const rival = await cliente.query('SELECT 1 FROM equipo WHERE id = $1 AND activo AND id <> $2', [idRival, idEquipo]);
      const estado = await cliente.query('SELECT id FROM estado_desafio WHERE lower(nombre) = $1', [ESTADO_DESAFIO_PENDIENTE]);
      if (estado.rowCount === 0) throw new Error("No existe el estado 'pendiente' en la tabla estado_desafio.");

      if (rival.rowCount === 0) {
        resultado = 'inexistente';
      } else if (
        (await cliente.query(
          `SELECT 1 FROM desafio
            WHERE id_estado_desafio = $3
              AND ((id_equipo_desafiante = $1 AND id_equipo_desafiado = $2)
                OR (id_equipo_desafiante = $2 AND id_equipo_desafiado = $1))`,
          [idEquipo, idRival, estado.rows[0].id]
        )).rowCount > 0
      ) {
        resultado = 'pendiente';
      } else {
        // 3) El desafío
        await cliente.query(
          `INSERT INTO desafio (id_equipo_desafiante, id_equipo_desafiado, id_estado_desafio, mensaje)
           VALUES ($1, $2, $3, $4)`,
          [idEquipo, idRival, estado.rows[0].id, mensaje]
        );
        resultado = 'enviado';
      }
    }

    await cliente.query('COMMIT');
    return resultado;
  } catch (err) {
    await cliente.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    cliente.release();
  }
}

/**
 * Crea el equipo y deja a la cuenta como su capitán, en UNA transacción:
 *  1) Busca la fila de "usuario" y de "jugador" de la cuenta.
 *  2) Busca los ids del rol capitán, del nivel y de la modalidad.
 *  3) Inserta el equipo con la cuenta como id_usuario_creador.
 *  4) Inserta al jugador en equipo_jugador con el rol capitán.
 * Si falla cualquier paso se hace ROLLBACK y no queda un equipo sin capitán.
 * @param {string} authId - UUID de auth.users.
 * @param {{nombre, correo, zona, nivel, jugadores}} datos - Ya validados;
 *        nivel es clave de NIVELES y jugadores es 5, 7 u 11.
 * @returns {Promise<{id: number}>} El id del equipo creado.
 */
async function crearEquipo(authId, { nombre, correo, zona, nivel, jugadores }) {
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');

    // 1) Usuario y jugador de la cuenta (el registro crea ambos).
    const cuenta = await cliente.query(
      `SELECT u.id AS id_usuario, j.id AS id_jugador
         FROM usuario u
         LEFT JOIN jugador j ON j.id_usuario = u.id
        WHERE u.auth_id = $1`,
      [authId]
    );
    const { id_usuario: idUsuario, id_jugador: idJugador } = cuenta.rows[0] || {};
    if (!idUsuario || !idJugador) {
      throw new Error(`La cuenta ${authId} no tiene fila en "usuario" o en "jugador".`);
    }

    // 2) Catálogos
    const rol = await cliente.query('SELECT id FROM rol_equipo WHERE lower(nombre) = ANY($1) ORDER BY id LIMIT 1', [
      NOMBRES_ROL_CAPITAN,
    ]);
    if (rol.rowCount === 0) throw new Error("No existe el rol 'capitan' en la tabla rol_equipo.");

    const filaNivel = await cliente.query('SELECT id FROM nivel WHERE lower(nombre) = lower($1)', [NIVELES[nivel]]);
    if (filaNivel.rowCount === 0) throw new Error(`No existe el nivel '${NIVELES[nivel]}' en la tabla nivel.`);

    const modalidad = await cliente.query('SELECT id FROM modalidad WHERE cantidad_de_jugadores = $1 ORDER BY id LIMIT 1', [
      jugadores,
    ]);
    if (modalidad.rowCount === 0) throw new Error(`No existe una modalidad de ${jugadores} jugadores en la tabla modalidad.`);

    // 3) El equipo; activo y puntaje_nivel toman su valor por defecto.
    const equipo = await cliente.query(
      `INSERT INTO equipo (nombre, zona, correo_contacto, id_modalidad, id_nivel, id_usuario_creador)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [nombre, zona, correo, modalidad.rows[0].id, filaNivel.rows[0].id, idUsuario]
    );
    const idEquipo = equipo.rows[0].id;

    // 4) El creador entra al plantel como capitán.
    await cliente.query('INSERT INTO equipo_jugador (id_jugador, id_equipo, id_rol_equipo) VALUES ($1, $2, $3)', [
      idJugador,
      idEquipo,
      rol.rows[0].id,
    ]);

    await cliente.query('COMMIT');
    return { id: idEquipo };
  } catch (err) {
    await cliente.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    cliente.release();
  }
}

/**
 * Directorio: todos los equipos activos, del más nuevo al más antiguo, con la
 * relación de la cuenta con cada uno (para el botón "Unirme").
 * @param {string} authId - UUID de auth.users.
 * @returns {Promise<Array<{id, nombre, zona, nivel, modalidad, detalle, relacion: 'capitan'|'miembro'|'pendiente'|null}>>}
 */
async function listarEquipos(authId) {
  const { rows } = await pool.query(
    `WITH yo AS (
       SELECT u.id AS id_usuario, j.id AS id_jugador
         FROM usuario u
         LEFT JOIN jugador j ON j.id_usuario = u.id
        WHERE u.auth_id = $1
     )
     SELECT e.id, e.nombre, e.zona, e.escudo_actualizado, m.cantidad_de_jugadores AS jugadores, n.nombre AS nivel,
            e.id_usuario_creador = yo.id_usuario AS es_capitan,
            EXISTS (SELECT 1 FROM equipo_jugador ej
                     WHERE ej.id_equipo = e.id AND ej.id_jugador = yo.id_jugador) AS es_miembro,
            EXISTS (SELECT 1 FROM solicitud_union_equipo s
                      JOIN estado_solicitud es ON es.id = s.id_estado_solicitud
                     WHERE s.id_equipo = e.id AND s.id_jugador = yo.id_jugador
                       AND lower(es.nombre) = $2) AS pendiente
       FROM equipo e
       LEFT JOIN modalidad m ON m.id = e.id_modalidad
       LEFT JOIN nivel n ON n.id = e.id_nivel
       LEFT JOIN yo ON TRUE
      WHERE e.activo
      ORDER BY e.id DESC`,
    [authId, ESTADO_PENDIENTE]
  );
  return rows.map((fila) => ({
    id: fila.id,
    nombre: fila.nombre,
    zona: fila.zona,
    nivel: fila.nivel,
    modalidad: MODALIDADES[fila.jugadores] || null,
    detalle: detalleEquipo(fila),
    escudo: urlEscudo(fila),
    relacion: fila.es_capitan ? 'capitan' : fila.es_miembro ? 'miembro' : fila.pendiente ? 'pendiente' : null,
  }));
}

/**
 * Envía la solicitud del jugador de la cuenta para unirse a un equipo, con su mensaje.
 * Bloquea la fila del jugador durante la transacción: dos clics seguidos no
 * crean dos solicitudes pendientes.
 * @param {string} authId - UUID de auth.users.
 * @param {number} idEquipo
 * @param {string|null} mensaje - Ya validado (validarSolicitudUnion).
 * @returns {Promise<'enviada'|'miembro'|'pendiente'|'inexistente'>}
 */
async function solicitarUnion(authId, idEquipo, mensaje) {
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');

    const cuenta = await cliente.query(
      `SELECT j.id
         FROM usuario u
         JOIN jugador j ON j.id_usuario = u.id
        WHERE u.auth_id = $1
          FOR UPDATE OF j`,
      [authId]
    );
    if (cuenta.rowCount === 0) throw new Error(`La cuenta ${authId} no tiene fila en "jugador".`);
    const idJugador = cuenta.rows[0].id;

    const equipo = await cliente.query('SELECT 1 FROM equipo WHERE id = $1 AND activo', [idEquipo]);
    let resultado;
    if (equipo.rowCount === 0) {
      resultado = 'inexistente';
    } else if (
      (await cliente.query('SELECT 1 FROM equipo_jugador WHERE id_equipo = $1 AND id_jugador = $2', [idEquipo, idJugador])).rowCount > 0
    ) {
      resultado = 'miembro';
    } else {
      const estado = await cliente.query('SELECT id FROM estado_solicitud WHERE lower(nombre) = $1', [ESTADO_PENDIENTE]);
      if (estado.rowCount === 0) throw new Error("No existe el estado 'pendiente' en la tabla estado_solicitud.");

      const yaPendiente = await cliente.query(
        'SELECT 1 FROM solicitud_union_equipo WHERE id_equipo = $1 AND id_jugador = $2 AND id_estado_solicitud = $3',
        [idEquipo, idJugador, estado.rows[0].id]
      );
      if (yaPendiente.rowCount > 0) {
        resultado = 'pendiente';
      } else {
        await cliente.query(
          'INSERT INTO solicitud_union_equipo (id_jugador, id_equipo, id_estado_solicitud, mensaje) VALUES ($1, $2, $3, $4)',
          [idJugador, idEquipo, estado.rows[0].id, mensaje]
        );
        resultado = 'enviada';
      }
    }

    await cliente.query('COMMIT');
    return resultado;
  } catch (err) {
    await cliente.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    cliente.release();
  }
}

module.exports = {
  obtenerEquipoDeCapitan,
  obtenerMiEquipo,
  listarMisEquipos,
  listarMisEquiposConPlantel,
  listarPlantel,
  guardarPosicionEnCancha,
  guardarEscudo,
  obtenerEscudo,
  listarSolicitudesPendientes,
  obtenerSolicitudDeMiEquipo,
  responderSolicitud,
  listarRivales,
  enviarDesafio,
  crearEquipo,
  listarEquipos,
  solicitarUnion,
};
