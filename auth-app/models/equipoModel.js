// models/equipoModel.js
// Equipos: tabla "equipo" (nombre, zona, correo, modalidad, nivel y usuario creador),
// el plantel en "equipo_jugador" (rol "capitan" o "integrante" de rol_equipo, con el
// nombre y la posición desde "jugador"), las solicitudes en "solicitud_union_equipo",
// los desafíos entre equipos en "desafio" (estados en "estado_desafio") y las invitaciones
// del capitán en "invitacion_equipo".
// Requiere las secciones W, Z (mensaje de la solicitud), AA (escudo) y AB (invitaciones) de sql/seed.sql
// y la F8-2 (modalidades del equipo, alineación de cada una y modalidad del desafío) de sql/nuevas_tablas.sql.
// Todas las consultas son parametrizadas.

const { pool } = require('../config/db');
const { NIVELES, POSICIONES, ESTADISTICAS } = require('../config/perfilJugador');
const { MODALIDADES, FORMACIONES, formacionValida, textoModalidades } = require('../config/equipo');

// Nombres aceptados en los catálogos (se buscan en minúsculas).
const NOMBRES_ROL_CAPITAN = ['capitán', 'capitan'];
const ESTADO_PENDIENTE = 'pendiente';
const ESTADO_ACEPTADA = 'aceptada';
const ESTADO_RECHAZADA = 'rechazada';
const ROL_INTEGRANTE = 'integrante';
const ESTADO_DESAFIO_PENDIENTE = 'pendiente'; // tabla estado_desafio
const ESTADO_CANCELADA = 'cancelada'; // CORRECCIÓN: regla 6 (estado agregado por sql/nuevas_tablas.sql)

/** CORRECCIÓN: regla 6 — id del estado "cancelada" de estado_solicitud (dentro de la transacción en curso). */
async function idEstadoCancelada(cliente) {
  const { rows } = await cliente.query('SELECT id FROM estado_solicitud WHERE lower(nombre) = $1', [ESTADO_CANCELADA]);
  if (!rows[0]) throw new Error("No existe el estado 'cancelada' en estado_solicitud: ejecuta sql/nuevas_tablas.sql.");
  return rows[0].id;
}

// Modalidades que juega el equipo "e" (cantidades de jugadores, ej. {7,11}): equipo_modalidad.
const SQL_MODALIDADES_EQUIPO = `(SELECT array_agg(mm.cantidad_de_jugadores ORDER BY mm.cantidad_de_jugadores)
            FROM equipo_modalidad em JOIN modalidad mm ON mm.id = em.id_modalidad WHERE em.id_equipo = e.id) AS modalidades`;

/** 'Fútbol 7 y 11' (si aún no tiene filas en equipo_modalidad, su modalidad principal). */
function modalidadesDe(fila) {
  return textoModalidades(fila.modalidades || [fila.jugadores]) || null;
}

/** "Fútbol 7 y 11 · Intermedio · Puente Alto" (omite lo que falte). */
function detalleEquipo(fila) {
  return [modalidadesDe(fila), fila.nivel, fila.zona].filter(Boolean).join(' · ');
}

/** URL del escudo subido (la versión evita que el navegador muestre uno viejo), o null: la vista usa la inicial. */
function urlEscudo(fila) {
  return fila.escudo_actualizado ? `/equipos/${fila.id}/escudo?v=${fila.escudo_actualizado.getTime()}` : null;
}

/**
 * Último equipo activo que creó la cuenta (su capitán): el de la confirmación de /crear-equipo/listo.
 * @param {string} authId - UUID de auth.users.
 * @returns {Promise<{id, nombre, zona, modalidad, nivel, detalle}|null>}
 */
async function obtenerEquipoDeCapitan(authId) {
  const { rows } = await pool.query(
    `SELECT e.id, e.nombre, coalesce(cz.nombre, e.zona) AS zona, e.escudo_actualizado, m.cantidad_de_jugadores AS jugadores, ${SQL_MODALIDADES_EQUIPO}, n.nombre AS nivel
       FROM usuario u
       JOIN equipo e ON e.id_usuario_creador = u.id AND e.activo
       LEFT JOIN modalidad m ON m.id = e.id_modalidad
       LEFT JOIN comunas cz ON cz.id = e.id_comuna -- CORRECCIÓN: regla 11 (se muestra la comuna; equipos antiguos, su zona)
       LEFT JOIN nivel n ON n.id = e.id_nivel
      WHERE u.auth_id = $1
      ORDER BY e.id DESC
      LIMIT 1`,
    [authId]
  );
  const fila = rows[0];
  if (!fila) return null;
  return {
    id: fila.id,
    nombre: fila.nombre,
    zona: fila.zona,
    modalidad: modalidadesDe(fila),
    nivel: fila.nivel,
    detalle: detalleEquipo(fila),
    escudo: urlEscudo(fila),
  };
}

/**
 * CORRECCIÓN: regla 5 — cuántos equipos activos creó (capitanea) la cuenta, para compararlo con
 * MAX_EQUIPOS_COMO_CAPITAN (config/equipo.js).
 * @param {string} authId - UUID de auth.users.
 * @returns {Promise<number>}
 */
async function contarEquiposDeCapitan(authId) {
  const { rows } = await pool.query(
    `SELECT count(*)::int AS total
       FROM usuario u
       JOIN equipo e ON e.id_usuario_creador = u.id AND e.activo
      WHERE u.auth_id = $1`,
    [authId]
  );
  return rows[0].total;
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
  SELECT e.id, e.nombre, coalesce(cz.nombre, e.zona) AS zona, e.escudo_actualizado, m.cantidad_de_jugadores AS jugadores, ${SQL_MODALIDADES_EQUIPO}, n.nombre AS nivel,
         e.id_usuario_creador = u.id AS soy_capitan,
         (SELECT json_agg(json_build_object('jugadores', mm.cantidad_de_jugadores, 'formacion', em.formacion)
                          ORDER BY mm.cantidad_de_jugadores)
            FROM equipo_modalidad em JOIN modalidad mm ON mm.id = em.id_modalidad WHERE em.id_equipo = e.id) AS alineaciones
    FROM usuario u
    LEFT JOIN jugador j ON j.id_usuario = u.id
    JOIN equipo e ON e.activo
     AND (e.id_usuario_creador = u.id
          OR EXISTS (SELECT 1 FROM equipo_jugador x WHERE x.id_equipo = e.id AND x.id_jugador = j.id))
    LEFT JOIN modalidad m ON m.id = e.id_modalidad
    LEFT JOIN comunas cz ON cz.id = e.id_comuna -- CORRECCIÓN: regla 11 (se muestra la comuna; equipos antiguos, su zona)
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
    // Una alineación por modalidad que juega, de la más chica a la más grande: cuántos titulares
    // lleva (5, 7 u 11) y su formación (la guardada si es de esa modalidad; si no, la primera).
    modalidades: (fila.alineaciones || (fila.jugadores ? [{ jugadores: fila.jugadores, formacion: null }] : []))
      .filter(({ jugadores }) => FORMACIONES[jugadores])
      .map(({ jugadores, formacion }) => ({
        jugadores,
        formacion: formacionValida(jugadores, formacion) ? formacion : FORMACIONES[jugadores][0],
      })),
  };
}

/**
 * Equipo activo de la cuenta (ver SQL_MIS_EQUIPOS). Si tiene varios, prioriza el que capitanea.
 * @param {string} authId - UUID de auth.users.
 * @param {number|null} [idEquipo] - Uno en particular: null si la cuenta no pertenece a ese equipo.
 * @returns {Promise<{id, nombre, zona, detalle, escudo: string|null, soyCapitan: boolean,
 *          modalidades: Array<{jugadores, formacion}>}|null>}
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
 * y su puesto en la alineación de cada modalidad. El capitán va primero; el resto, en orden de llegada.
 * @param {number} idEquipo
 * @returns {Promise<Array<{id, nombre, nombreCarta, posicion, clavePosicion, capitan: boolean,
 *          stats: {ritmo, ...}|null, fotoVersion: number|null, puestos: {[jugadores]: number}}>>}
 *          puestos: índice en la formación (0 = arquero) por modalidad, ej. {7: 0, 11: 3}; sin la modalidad = suplente.
 *          clavePosicion: 'arquero' | 'defensa' | 'mediocampista' | 'delantero' | null (la línea en la cancha).
 */
async function listarPlantel(idEquipo) {
  const columnasStats = ESTADISTICAS.map(({ columna }) => `j.${columna}`).join(', ');
  const { rows } = await pool.query(
    `SELECT j.id, trim(concat_ws(' ', j.nombre_apodo, j.apellido)) AS nombre,
            coalesce(nullif(j.apodo, ''), j.nombre_apodo) AS nombre_carta,
            j.foto_actualizada, ${columnasStats},
            (SELECT json_object_agg(m.cantidad_de_jugadores, ap.puesto)
               FROM alineacion_puesto ap JOIN modalidad m ON m.id = ap.id_modalidad
              WHERE ap.id_equipo = ej.id_equipo AND ap.id_jugador = j.id) AS puestos,
            (SELECT p.nombre
               FROM jugador_posicion jp
               JOIN posicion p ON p.id = jp.id_posicion
              WHERE jp.id_jugador = j.id
              ORDER BY jp.id
              LIMIT 1) AS posicion,
            lower(r.nombre) = ANY($2) AS capitan
       FROM equipo_jugador ej
       JOIN jugador j ON j.id = ej.id_jugador
       JOIN usuario uj ON uj.id = j.id_usuario AND uj.activo -- CORRECCIÓN: regla 7 (cuentas inactivas no aparecen)
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
    puestos: fila.puestos || {},
  }));
}

/** Equipo activo creado por la cuenta, bloqueado hasta el fin de la transacción (true si es suyo). */
async function bloquearEquipoDeCapitan(cliente, authId, idEquipo) {
  const { rowCount } = await cliente.query(
    `SELECT 1
       FROM equipo e
       JOIN usuario u ON u.id = e.id_usuario_creador
      WHERE e.id = $1 AND e.activo AND u.auth_id = $2
        FOR UPDATE OF e`,
    [idEquipo, authId]
  );
  return rowCount > 0;
}

/**
 * El capitán guarda la alineación de una de sus modalidades, en UNA transacción:
 *  1) Bloquea el equipo y comprueba que sea suyo, que siga activo y que juegue esa modalidad.
 *  2) Revisa que la formación sea de la modalidad, que haya un lugar por titular
 *     y que cada titular sea del plantel y no se repita.
 *  3) Guarda la formación y reemplaza los titulares de esa modalidad (el resto queda de suplente).
 * @param {string} authId - UUID de auth.users (el capitán).
 * @param {number} idEquipo
 * @param {number} jugadores - La modalidad: 5, 7 u 11.
 * @param {string} formacion - Ej. '4-3-3'.
 * @param {Array<number|null>} titulares - Id del jugador de cada puesto, en orden (null = puesto vacío).
 * @returns {Promise<'guardada'|'sin-permiso'|'invalida'>}
 */
async function guardarAlineacion(authId, idEquipo, jugadores, formacion, titulares) {
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');

    // 1) Equipo del capitán y su modalidad
    if (!(await bloquearEquipoDeCapitan(cliente, authId, idEquipo))) {
      await cliente.query('ROLLBACK');
      return 'sin-permiso';
    }
    const modalidad = await cliente.query(
      `SELECT em.id_modalidad FROM equipo_modalidad em JOIN modalidad m ON m.id = em.id_modalidad
        WHERE em.id_equipo = $1 AND m.cantidad_de_jugadores = $2 LIMIT 1`,
      [idEquipo, jugadores]
    );

    // 2) Formación y titulares
    const ids = titulares.filter((id) => id !== null);
    const delPlantel = await cliente.query(
      'SELECT count(*)::int AS total FROM equipo_jugador WHERE id_equipo = $1 AND id_jugador = ANY($2::int[])',
      [idEquipo, ids]
    );
    if (modalidad.rowCount === 0 || !formacionValida(jugadores, formacion) || titulares.length !== jugadores
        || new Set(ids).size !== ids.length || delPlantel.rows[0].total !== ids.length) {
      await cliente.query('ROLLBACK');
      return 'invalida';
    }
    const idModalidad = modalidad.rows[0].id_modalidad;

    // 3) Formación y titulares de esa modalidad
    await cliente.query('UPDATE equipo_modalidad SET formacion = $3 WHERE id_equipo = $1 AND id_modalidad = $2', [
      idEquipo, idModalidad, formacion,
    ]);
    await cliente.query('DELETE FROM alineacion_puesto WHERE id_equipo = $1 AND id_modalidad = $2', [idEquipo, idModalidad]);
    await cliente.query(
      `INSERT INTO alineacion_puesto (id_equipo, id_modalidad, id_jugador, puesto)
       SELECT $1, $2, t.id_jugador, (t.orden - 1)::smallint
         FROM unnest($3::int[]) WITH ORDINALITY AS t(id_jugador, orden)
        WHERE t.id_jugador IS NOT NULL`,
      [idEquipo, idModalidad, titulares]
    );

    await cliente.query('COMMIT');
    return 'guardada';
  } catch (err) {
    await cliente.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    cliente.release();
  }
}

/**
 * Deja en equipo_modalidad las modalidades indicadas (las nuevas parten con la primera formación y
 * todo el plantel de suplente; las que se quitan se llevan su alineación). La modalidad principal
 * (equipo.id_modalidad) se conserva si sigue entre ellas; si no, pasa a ser la más chica.
 * Se usa dentro de una transacción ya abierta (crear equipo o actualizar sus modalidades).
 * @param {Array<number>} lista - Cantidades de jugadores, ya validadas contra MODALIDADES (al menos una).
 */
async function escribirModalidades(cliente, idEquipo, lista) {
  const { rows } = await cliente.query(
    'SELECT id, cantidad_de_jugadores FROM modalidad WHERE cantidad_de_jugadores = ANY($1::int[]) ORDER BY cantidad_de_jugadores, id',
    [lista]
  );
  // Una fila por cantidad (si el catálogo tuviera dos "Fútbol 7", la de menor id)
  const porCantidad = new Map();
  rows.forEach((fila) => { if (!porCantidad.has(fila.cantidad_de_jugadores)) porCantidad.set(fila.cantidad_de_jugadores, fila.id); });
  const faltan = lista.filter((n) => !porCantidad.has(n));
  if (faltan.length > 0) throw new Error(`No existe una modalidad de ${faltan.join(', ')} jugadores en la tabla modalidad.`);
  const idsModalidad = [...porCantidad.values()];

  await cliente.query('DELETE FROM equipo_modalidad WHERE id_equipo = $1 AND NOT (id_modalidad = ANY($2::int[]))', [
    idEquipo, idsModalidad,
  ]);
  await cliente.query(
    `INSERT INTO equipo_modalidad (id_equipo, id_modalidad)
     SELECT $1, unnest($2::int[])
     ON CONFLICT DO NOTHING`,
    [idEquipo, idsModalidad]
  );
  await cliente.query(
    'UPDATE equipo SET id_modalidad = $2 WHERE id = $1 AND (id_modalidad IS NULL OR NOT (id_modalidad = ANY($3::int[])))',
    [idEquipo, idsModalidad[0], idsModalidad]
  );
}

/**
 * El capitán cambia las modalidades que juega el equipo (ver escribirModalidades).
 * @param {string} authId - UUID de auth.users (el capitán).
 * @param {Array<number>} lista - Cantidades de jugadores, ya validadas (al menos una).
 * @returns {Promise<'actualizadas'|'sin-permiso'>}
 */
async function actualizarModalidades(authId, idEquipo, lista) {
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    if (!(await bloquearEquipoDeCapitan(cliente, authId, idEquipo))) {
      await cliente.query('ROLLBACK');
      return 'sin-permiso';
    }
    await escribirModalidades(cliente, idEquipo, lista);
    await cliente.query('COMMIT');
    return 'actualizadas';
  } catch (err) {
    await cliente.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    cliente.release();
  }
}

/**
 * El capitán suma una modalidad a las que ya juega el equipo (ej. desde un torneo de esa modalidad).
 * @param {string} authId - UUID de auth.users (el capitán).
 * @param {number} idModalidad - Fila de la tabla modalidad.
 * @returns {Promise<'actualizadas'|'sin-permiso'>}
 */
async function agregarModalidad(authId, idEquipo, idModalidad) {
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    if (!(await bloquearEquipoDeCapitan(cliente, authId, idEquipo))) {
      await cliente.query('ROLLBACK');
      return 'sin-permiso';
    }
    const { rows } = await cliente.query(
      `SELECT m.cantidad_de_jugadores
         FROM modalidad m
        WHERE m.id = $2
           OR m.id IN (SELECT em.id_modalidad FROM equipo_modalidad em WHERE em.id_equipo = $1)
           OR m.id = (SELECT e.id_modalidad FROM equipo e WHERE e.id = $1)`,
      [idEquipo, idModalidad]
    );
    await escribirModalidades(cliente, idEquipo, [...new Set(rows.map((f) => f.cantidad_de_jugadores))]);
    await cliente.query('COMMIT');
    return 'actualizadas';
  } catch (err) {
    await cliente.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    cliente.release();
  }
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
       JOIN usuario uj ON uj.id = j.id_usuario AND uj.activo -- CORRECCIÓN: regla 7
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
      // CORRECCIÓN: regla 6 — si el equipo también lo había invitado, esa invitación pendiente se cancela.
      await cliente.query(
        `UPDATE invitacion_equipo i
            SET id_estado_solicitud = $3, fecha_respuesta = now()
           FROM estado_solicitud es
          WHERE es.id = i.id_estado_solicitud AND lower(es.nombre) = $4
            AND i.id_jugador = $1 AND i.id_equipo = $2`,
        [idJugador, idEquipo, await idEstadoCancelada(cliente), ESTADO_PENDIENTE]
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
 * Rivales para desafiar: equipos activos menos el propio que juegan al menos una de sus modalidades,
 * con las que tienen en común y el estado del último desafío PENDIENTE entre ambos (para el botón "Enviar Desafío").
 * @param {number} idEquipo - El equipo del capitán.
 * @returns {Promise<Array<{id, nombre, zona, nivel, modalidad, modalidades: number[], comunes: number[],
 *          desafio: 'enviado'|'recibido'|null}>>} modalidades y comunes: cantidades de jugadores (ej. [7, 11]).
 */
async function listarRivales(idEquipo) {
  const { rows } = await pool.query(
    `SELECT e.id, e.nombre, coalesce(cz.nombre, e.zona) AS zona, e.escudo_actualizado, m.cantidad_de_jugadores AS jugadores, ${SQL_MODALIDADES_EQUIPO}, n.nombre AS nivel,
            EXISTS (SELECT 1 FROM desafio d JOIN estado_desafio ed ON ed.id = d.id_estado_desafio
                     WHERE d.id_equipo_desafiante = $1 AND d.id_equipo_desafiado = e.id
                       AND lower(ed.nombre) = $2) AS enviado,
            EXISTS (SELECT 1 FROM desafio d JOIN estado_desafio ed ON ed.id = d.id_estado_desafio
                     WHERE d.id_equipo_desafiante = e.id AND d.id_equipo_desafiado = $1
                       AND lower(ed.nombre) = $2) AS recibido,
            (SELECT array_agg(mc.cantidad_de_jugadores ORDER BY mc.cantidad_de_jugadores)
               FROM equipo_modalidad r
               JOIN equipo_modalidad propia ON propia.id_modalidad = r.id_modalidad AND propia.id_equipo = $1
               JOIN modalidad mc ON mc.id = r.id_modalidad
              WHERE r.id_equipo = e.id) AS comunes
       FROM equipo e
       LEFT JOIN modalidad m ON m.id = e.id_modalidad
       LEFT JOIN comunas cz ON cz.id = e.id_comuna -- CORRECCIÓN: regla 11 (se muestra la comuna; equipos antiguos, su zona)
       LEFT JOIN nivel n ON n.id = e.id_nivel
      WHERE e.activo AND e.id <> $1
        -- El capitán puede tener varios equipos: no se desafía a sí mismo
        AND e.id_usuario_creador <> (SELECT id_usuario_creador FROM equipo WHERE id = $1)
        -- CORRECCIÓN: regla 12 — solo rivales que juegan al menos una modalidad del equipo del capitán
        AND EXISTS (SELECT 1 FROM equipo_modalidad r
                      JOIN equipo_modalidad propia ON propia.id_modalidad = r.id_modalidad AND propia.id_equipo = $1
                     WHERE r.id_equipo = e.id)
      ORDER BY e.nombre`,
    [idEquipo, ESTADO_DESAFIO_PENDIENTE]
  );
  return rows.map((fila) => ({
    id: fila.id,
    nombre: fila.nombre,
    zona: fila.zona,
    nivel: fila.nivel,
    modalidad: modalidadesDe(fila),
    modalidades: fila.modalidades || [],
    comunes: fila.comunes || [],
    escudo: urlEscudo(fila),
    desafio: fila.enviado ? 'enviado' : fila.recibido ? 'recibido' : null,
  }));
}

/**
 * El capitán desafía a otro equipo, en UNA transacción:
 *  1) Busca el equipo desafiante (uno que él creó: el indicado o, sin indicar, el primero) y lo
 *     bloquea: dos clics seguidos no crean dos desafíos.
 *  2) Comprueba que el rival exista, esté activo, que la modalidad elegida la jueguen los dos
 *     y que no haya ya un desafío pendiente entre ambos (en cualquier sentido).
 *  3) Inserta el desafío como "pendiente" en esa modalidad (fecha_solicitud la pone la base).
 * @param {string} authId - UUID de auth.users (el capitán).
 * @param {number} idRival
 * @param {string|null} mensaje - Ya validado (fecha tentativa y/o mensaje).
 * @param {number|null} [jugadores] - Modalidad del desafío (5, 7 u 11); sin ella, la más chica que tengan en común.
 * @param {number|null} [idEquipoPropio] - Equipo desafiante (el capitán puede tener varios); debe ser suyo.
 * @returns {Promise<'enviado'|'pendiente'|'sin-equipo'|'inexistente'|'modalidad'>}
 */
async function enviarDesafio(authId, idRival, mensaje, jugadores = null, idEquipoPropio = null) {
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');

    // 1) Equipo del capitán
    const propio = await cliente.query(
      `SELECT e.id
         FROM usuario u
         JOIN equipo e ON e.id_usuario_creador = u.id AND e.activo
        WHERE u.auth_id = $1 AND ($2::int IS NULL OR e.id = $2)
        ORDER BY e.id
        LIMIT 1
          FOR UPDATE OF e`,
      [authId, idEquipoPropio]
    );
    let resultado;
    if (propio.rowCount === 0) {
      resultado = 'sin-equipo';
    } else {
      const idEquipo = propio.rows[0].id;

      // 2) Rival válido y sin desafío pendiente entre ambos
      const rival = await cliente.query(
        `SELECT 1 FROM equipo WHERE id = $1 AND activo AND id <> $2
            AND id_usuario_creador <> (SELECT id_usuario_creador FROM equipo WHERE id = $2)`,
        [idRival, idEquipo]
      );
      const estado = await cliente.query('SELECT id FROM estado_desafio WHERE lower(nombre) = $1', [ESTADO_DESAFIO_PENDIENTE]);
      if (estado.rowCount === 0) throw new Error("No existe el estado 'pendiente' en la tabla estado_desafio.");

      // CORRECCIÓN: regla 12 — modalidades que juegan los dos; la elegida debe ser una de ellas
      const comunes = await cliente.query(
        `SELECT m.id, m.cantidad_de_jugadores AS jugadores
           FROM equipo_modalidad r
           JOIN equipo_modalidad propia ON propia.id_modalidad = r.id_modalidad AND propia.id_equipo = $2
           JOIN modalidad m ON m.id = r.id_modalidad
          WHERE r.id_equipo = $1
          ORDER BY m.cantidad_de_jugadores`,
        [idRival, idEquipo]
      );
      const modalidad = jugadores === null ? comunes.rows[0] : comunes.rows.find((fila) => fila.jugadores === jugadores);

      if (rival.rowCount === 0) {
        resultado = 'inexistente';
      } else if (!modalidad) {
        resultado = 'modalidad'; // CORRECCIÓN: regla 12
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
          `INSERT INTO desafio (id_equipo_desafiante, id_equipo_desafiado, id_estado_desafio, mensaje, id_modalidad)
           VALUES ($1, $2, $3, $4, $5)`,
          [idEquipo, idRival, estado.rows[0].id, mensaje, modalidad.id]
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
 *  2) Busca los ids del rol capitán, del nivel y de la modalidad principal (la más chica).
 *  3) Inserta el equipo con la cuenta como id_usuario_creador y las modalidades que juega.
 *  4) Inserta al jugador en equipo_jugador con el rol capitán.
 * Si falla cualquier paso se hace ROLLBACK y no queda un equipo sin capitán.
 * @param {string} authId - UUID de auth.users.
 * @param {{nombre, correo, zona, nivel, modalidades}} datos - Ya validados;
 *        nivel es clave de NIVELES y modalidades, las cantidades de jugadores que juega (ej. [7, 11]).
 *        La formación de cada una parte en la primera (el capitán la cambia en /mi-equipo).
 * @returns {Promise<{id: number}>} El id del equipo creado.
 */
async function crearEquipo(authId, { nombre, correo, zona, nivel, modalidades, idComuna = null }) { // CORRECCIÓN: regla 11 (idComuna)
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

    // CORRECCIÓN: regla 10 — también el puntaje mínimo del nivel, que será el puntaje inicial del equipo.
    const filaNivel = await cliente.query('SELECT id, puntaje_min FROM nivel WHERE lower(nombre) = lower($1)', [NIVELES[nivel]]);
    if (filaNivel.rowCount === 0) throw new Error(`No existe el nivel '${NIVELES[nivel]}' en la tabla nivel.`);

    const principal = Math.min(...modalidades);
    const modalidad = await cliente.query('SELECT id FROM modalidad WHERE cantidad_de_jugadores = $1 ORDER BY id LIMIT 1', [
      principal,
    ]);
    if (modalidad.rowCount === 0) throw new Error(`No existe una modalidad de ${principal} jugadores en la tabla modalidad.`);

    // 3) El equipo; activo toma su valor por defecto.
    // CORRECCIÓN: regla 10 — puntaje_nivel parte en el mínimo del nivel elegido (antes quedaba en 0 para todos).
    // CORRECCIÓN: regla 11 — se guarda la comuna elegida de la lista (id_comuna).
    const equipo = await cliente.query(
      `INSERT INTO equipo (nombre, zona, correo_contacto, id_modalidad, id_nivel, id_usuario_creador, puntaje_nivel, id_comuna)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id`,
      [nombre, zona, correo, modalidad.rows[0].id, filaNivel.rows[0].id, idUsuario, filaNivel.rows[0].puntaje_min, idComuna]
    );
    const idEquipo = equipo.rows[0].id;
    await escribirModalidades(cliente, idEquipo, modalidades);

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
     SELECT e.id, e.nombre, coalesce(cz.nombre, e.zona) AS zona, e.escudo_actualizado, m.cantidad_de_jugadores AS jugadores, ${SQL_MODALIDADES_EQUIPO}, n.nombre AS nivel,
            e.id_usuario_creador = yo.id_usuario AS es_capitan,
            EXISTS (SELECT 1 FROM equipo_jugador ej
                     WHERE ej.id_equipo = e.id AND ej.id_jugador = yo.id_jugador) AS es_miembro,
            EXISTS (SELECT 1 FROM solicitud_union_equipo s
                      JOIN estado_solicitud es ON es.id = s.id_estado_solicitud
                     WHERE s.id_equipo = e.id AND s.id_jugador = yo.id_jugador
                       AND lower(es.nombre) = $2) AS pendiente
       FROM equipo e
       LEFT JOIN modalidad m ON m.id = e.id_modalidad
       LEFT JOIN comunas cz ON cz.id = e.id_comuna -- CORRECCIÓN: regla 11 (se muestra la comuna; equipos antiguos, su zona)
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
    modalidad: modalidadesDe(fila),
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
    } else if (
      // CORRECCIÓN: regla 6 — si ese equipo ya lo invitó, no se crea una solicitud paralela: acepta la invitación.
      (await cliente.query(
        `SELECT 1 FROM invitacion_equipo i JOIN estado_solicitud es ON es.id = i.id_estado_solicitud
          WHERE i.id_equipo = $1 AND i.id_jugador = $2 AND lower(es.nombre) = $3`,
        [idEquipo, idJugador, ESTADO_PENDIENTE]
      )).rowCount > 0
    ) {
      resultado = 'invitado';
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

/**
 * Jugadores para el modal "Invitar jugador +": TODOS los jugadores con cuenta activa (con o sin
 * equipo: un jugador puede estar en varios), menos los que ya están en este plantel.
 * Cada uno trae los equipos en que juega (equipo_jugador + equipo) y si tiene una invitación pendiente de este equipo.
 * @param {number} idEquipo - El equipo del capitán.
 * @returns {Promise<Array<{id, nombre, posicion, stats: {ritmo, ...}|null, fotoVersion: number|null,
 *          equipos: string[], invitado: boolean}>>}
 */
async function listarJugadoresParaInvitar(idEquipo) {
  const columnasStats = ESTADISTICAS.map(({ columna }) => `j.${columna}`).join(', ');
  const { rows } = await pool.query(
    `SELECT j.id, coalesce(nullif(j.apodo, ''), trim(concat_ws(' ', j.nombre_apodo, j.apellido))) AS nombre,
            j.foto_actualizada, ${columnasStats},
            (SELECT p.nombre
               FROM jugador_posicion jp
               JOIN posicion p ON p.id = jp.id_posicion
              WHERE jp.id_jugador = j.id
              ORDER BY jp.id
              LIMIT 1) AS posicion,
            ARRAY(SELECT e.nombre
                    FROM equipo_jugador ej
                    JOIN equipo e ON e.id = ej.id_equipo AND e.activo
                   WHERE ej.id_jugador = j.id
                   ORDER BY ej.id) AS equipos,
            EXISTS (SELECT 1 FROM invitacion_equipo i JOIN estado_solicitud es ON es.id = i.id_estado_solicitud
                     WHERE i.id_equipo = $1 AND i.id_jugador = j.id AND lower(es.nombre) = $2) AS invitado
       FROM jugador j
       JOIN usuario u ON u.id = j.id_usuario AND u.activo
      WHERE NOT EXISTS (SELECT 1 FROM equipo_jugador ej WHERE ej.id_equipo = $1 AND ej.id_jugador = j.id)
      ORDER BY nombre`,
    [idEquipo, ESTADO_PENDIENTE]
  );
  return rows.map((fila) => ({
    id: fila.id,
    nombre: fila.nombre || 'Jugador',
    posicion: etiquetaPosicion(fila.posicion) || 'Sin posición',
    stats: ESTADISTICAS.every(({ columna }) => fila[columna] !== null)
      ? Object.fromEntries(ESTADISTICAS.map(({ clave, columna }) => [clave, fila[columna]]))
      : null,
    fotoVersion: fila.foto_actualizada ? fila.foto_actualizada.getTime() : null,
    equipos: fila.equipos,
    invitado: fila.invitado,
  }));
}

/**
 * El capitán invita a un jugador: guarda en invitacion_equipo el equipo ($2) y el jugador ($3)
 * como "pendiente". Solo el que creó el equipo; UNIQUE (id_equipo, id_jugador) evita repetirla.
 * Si ya la había respondido (la rechazó, o la aceptó y después salió o lo sacaron), vuelve a "pendiente".
 * @param {string} authId - UUID de auth.users (el capitán).
 * @returns {Promise<'enviada'|'ya-invitado'|'miembro'|'sin-permiso'|'inexistente'>}
 */
async function invitarJugador(authId, idEquipo, idJugador) {
  const { rows } = await pool.query(
    `SELECT EXISTS (SELECT 1 FROM equipo e JOIN usuario u ON u.id = e.id_usuario_creador
                     WHERE e.id = $2 AND e.activo AND u.auth_id = $1) AS soy_capitan,
            -- CORRECCIÓN: regla 7 — solo jugadores con la cuenta activa pueden ser invitados
            EXISTS (SELECT 1 FROM jugador jx JOIN usuario ux ON ux.id = jx.id_usuario AND ux.activo
                     WHERE jx.id = $3) AS existe,
            EXISTS (SELECT 1 FROM equipo_jugador WHERE id_equipo = $2 AND id_jugador = $3) AS miembro,
            -- CORRECCIÓN: regla 6 — ¿el jugador ya pidió unirse a este equipo? (no se duplica con una invitación)
            EXISTS (SELECT 1 FROM solicitud_union_equipo s JOIN estado_solicitud es ON es.id = s.id_estado_solicitud
                     WHERE s.id_equipo = $2 AND s.id_jugador = $3 AND lower(es.nombre) = $4) AS postulo`,
    [authId, idEquipo, idJugador, ESTADO_PENDIENTE]
  );
  const { soy_capitan: soyCapitan, existe, miembro, postulo } = rows[0];
  if (!soyCapitan) return 'sin-permiso';
  if (!existe) return 'inexistente';
  if (miembro) return 'miembro';
  if (postulo) return 'solicitud-pendiente'; // CORRECCIÓN: regla 6

  const estado = await pool.query('SELECT id FROM estado_solicitud WHERE lower(nombre) = $1', [ESTADO_PENDIENTE]);
  if (estado.rowCount === 0) throw new Error("No existe el estado 'pendiente' en la tabla estado_solicitud.");
  const { rowCount } = await pool.query(
    `INSERT INTO invitacion_equipo (id_equipo, id_jugador, id_estado_solicitud) VALUES ($1, $2, $3)
     ON CONFLICT (id_equipo, id_jugador) DO UPDATE
       SET id_estado_solicitud = EXCLUDED.id_estado_solicitud, fecha_invitacion = now(), fecha_respuesta = NULL
     WHERE invitacion_equipo.id_estado_solicitud <> EXCLUDED.id_estado_solicitud`,
    [idEquipo, idJugador, estado.rows[0].id]
  );
  return rowCount > 0 ? 'enviada' : 'ya-invitado';
}

/**
 * Invitaciones pendientes que recibió el jugador de la cuenta (panel "Invitaciones" del dashboard),
 * de la más nueva a la más antigua, con el equipo que invita y su capitán.
 * @param {string} authId - UUID de auth.users.
 * @returns {Promise<Array<{id, fecha: Date, equipo: {id, nombre, detalle, escudo}, capitan: string|null}>>}
 *          id es el de la invitación.
 */
async function listarMisInvitaciones(authId) {
  const { rows } = await pool.query(
    `SELECT i.id, i.fecha_invitacion, e.id AS id_equipo, e.nombre, coalesce(cz.nombre, e.zona) AS zona, e.escudo_actualizado,
            m.cantidad_de_jugadores AS jugadores, ${SQL_MODALIDADES_EQUIPO}, n.nombre AS nivel,
            (SELECT trim(concat_ws(' ', jc.nombre_apodo, jc.apellido))
               FROM jugador jc
              WHERE jc.id_usuario = e.id_usuario_creador) AS capitan
       FROM usuario u
       JOIN jugador j ON j.id_usuario = u.id
       JOIN invitacion_equipo i ON i.id_jugador = j.id
       JOIN estado_solicitud es ON es.id = i.id_estado_solicitud
       JOIN equipo e ON e.id = i.id_equipo AND e.activo
       LEFT JOIN modalidad m ON m.id = e.id_modalidad
       LEFT JOIN comunas cz ON cz.id = e.id_comuna -- CORRECCIÓN: regla 11 (se muestra la comuna; equipos antiguos, su zona)
       LEFT JOIN nivel n ON n.id = e.id_nivel
      WHERE u.auth_id = $1 AND lower(es.nombre) = $2
      ORDER BY i.fecha_invitacion DESC, i.id DESC`,
    [authId, ESTADO_PENDIENTE]
  );
  return rows.map((fila) => ({
    id: fila.id,
    fecha: fila.fecha_invitacion,
    equipo: { id: fila.id_equipo, nombre: fila.nombre, detalle: detalleEquipo(fila), escudo: urlEscudo({ ...fila, id: fila.id_equipo }) },
    capitan: fila.capitan,
  }));
}

/**
 * El jugador acepta o rechaza una invitación, en UNA transacción:
 *  1) Bloquea la invitación y comprueba que siga pendiente, que sea para el jugador
 *     de esta cuenta (nadie más puede responderla) y que el equipo siga activo.
 *  2) La marca como aceptada o rechazada, con la fecha de respuesta.
 *  3) Si la acepta, lo suma al plantel con el rol "integrante" y da por aceptada la
 *     solicitud pendiente que él mismo hubiera enviado a ese equipo (así no le queda al capitán).
 * @param {string} authId - UUID de auth.users (el jugador invitado).
 * @param {number} idInvitacion
 * @param {boolean} aceptar
 * @returns {Promise<'aceptada'|'rechazada'|'inexistente'>}
 */
async function responderInvitacion(authId, idInvitacion, aceptar) {
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');

    // 1) Invitación pendiente para el jugador de esta cuenta
    const invitacion = await cliente.query(
      `SELECT i.id_jugador, i.id_equipo
         FROM invitacion_equipo i
         JOIN estado_solicitud es ON es.id = i.id_estado_solicitud
         JOIN jugador j ON j.id = i.id_jugador
         JOIN usuario u ON u.id = j.id_usuario
         JOIN equipo e ON e.id = i.id_equipo AND e.activo
        WHERE i.id = $1 AND u.auth_id = $2 AND lower(es.nombre) = $3
          FOR UPDATE OF i`,
      [idInvitacion, authId, ESTADO_PENDIENTE]
    );
    if (invitacion.rowCount === 0) {
      await cliente.query('ROLLBACK');
      return 'inexistente';
    }
    const { id_jugador: idJugador, id_equipo: idEquipo } = invitacion.rows[0];

    // 2) Nuevo estado
    const resultado = aceptar ? ESTADO_ACEPTADA : ESTADO_RECHAZADA;
    const estado = await cliente.query('SELECT id FROM estado_solicitud WHERE lower(nombre) = $1', [resultado]);
    if (estado.rowCount === 0) throw new Error(`No existe el estado '${resultado}' en la tabla estado_solicitud.`);
    await cliente.query(
      'UPDATE invitacion_equipo SET id_estado_solicitud = $2, fecha_respuesta = now() WHERE id = $1',
      [idInvitacion, estado.rows[0].id]
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
      await cliente.query(
        `UPDATE solicitud_union_equipo s
            SET id_estado_solicitud = $3, fecha_respuesta = now()
           FROM estado_solicitud es
          WHERE es.id = s.id_estado_solicitud AND lower(es.nombre) = $4
            AND s.id_jugador = $1 AND s.id_equipo = $2`,
        // CORRECCIÓN: regla 6 — su solicitud pendiente a ese equipo queda "cancelada" (antes se marcaba "aceptada")
        [idJugador, idEquipo, await idEstadoCancelada(cliente), ESTADO_PENDIENTE]
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
 * El capitán saca a un jugador del plantel: borra su fila de equipo_jugador
 * (WHERE id_equipo AND id_jugador). Solo el que creó el equipo, y nunca a sí mismo.
 * @param {string} authId - UUID de auth.users (el capitán).
 * @returns {Promise<boolean>} false si el equipo no es suyo, el jugador no está o es el propio capitán.
 */
async function sacarJugador(authId, idEquipo, idJugador) {
  const { rowCount } = await pool.query(
    `DELETE FROM equipo_jugador ej
      USING equipo e, usuario u, jugador j
      WHERE ej.id_equipo = $2 AND ej.id_jugador = $3
        AND e.id = ej.id_equipo AND e.activo
        AND u.id = e.id_usuario_creador AND u.auth_id = $1
        AND j.id = ej.id_jugador AND j.id_usuario <> e.id_usuario_creador`,
    [authId, idEquipo, idJugador]
  );
  return rowCount > 0;
}

/**
 * El jugador de la cuenta sale de un equipo: borra su fila de equipo_jugador
 * (WHERE id_equipo AND id_jugador). El que creó el equipo no puede salir: el equipo quedaría sin capitán.
 * @param {string} authId - UUID de auth.users.
 * @returns {Promise<boolean>} false si no estaba en ese equipo o es su capitán.
 */
async function salirDeEquipo(authId, idEquipo) {
  const { rowCount } = await pool.query(
    `DELETE FROM equipo_jugador ej
      USING jugador j, usuario u, equipo e
      WHERE ej.id_equipo = $2 AND ej.id_jugador = j.id
        AND j.id_usuario = u.id AND u.auth_id = $1
        AND e.id = ej.id_equipo AND e.id_usuario_creador <> u.id`,
    [authId, idEquipo]
  );
  return rowCount > 0;
}

module.exports = {
  contarEquiposDeCapitan, // CORRECCIÓN: regla 5
  obtenerEquipoDeCapitan,
  obtenerMiEquipo,
  listarMisEquipos,
  listarMisEquiposConPlantel,
  listarPlantel,
  guardarAlineacion,
  actualizarModalidades,
  agregarModalidad,
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
  listarJugadoresParaInvitar,
  invitarJugador,
  listarMisInvitaciones,
  responderInvitacion,
  sacarJugador,
  salirDeEquipo,
};
