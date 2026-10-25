const { pool } = require('../config/db');
const { NIVELES, POSICIONES, ESTADISTICAS } = require('../config/perfilJugador');
const { MODALIDADES } = require('../config/equipo');

const NOMBRES_ROL_CAPITAN = ['capitán', 'capitan'];
const ESTADO_PENDIENTE = 'pendiente';
const ESTADO_ACEPTADA = 'aceptada';
const ESTADO_RECHAZADA = 'rechazada';
const ROL_INTEGRANTE = 'integrante';
const ESTADO_DESAFIO_PENDIENTE = 'pendiente';
const ESTADO_CANCELADA = 'cancelada';

async function idEstadoCancelada(cliente) {
  const { rows } = await cliente.query('SELECT id FROM estado_solicitud WHERE lower(nombre) = $1', [ESTADO_CANCELADA]);
  if (!rows[0]) throw new Error("No existe el estado 'cancelada' en estado_solicitud: ejecuta sql/nuevas_tablas.sql.");
  return rows[0].id;
}

function detalleEquipo(fila) {
  return [MODALIDADES[fila.jugadores], fila.nivel, fila.zona].filter(Boolean).join(' · ');
}

function urlEscudo(fila) {
  return fila.escudo_actualizado ? `/equipos/${fila.id}/escudo?v=${fila.escudo_actualizado.getTime()}` : null;
}

async function obtenerEquipoDeCapitan(authId) {
  const { rows } = await pool.query(
    `SELECT e.id, e.nombre, coalesce(cz.nombre, e.zona) AS zona, e.escudo_actualizado, m.cantidad_de_jugadores AS jugadores, n.nombre AS nivel
       FROM usuario u
       JOIN equipo e ON e.id_usuario_creador = u.id AND e.activo
       LEFT JOIN modalidad m ON m.id = e.id_modalidad
       LEFT JOIN comunas cz ON cz.id = e.id_comuna -- CORRECCIÓN: regla 11 (se muestra la comuna; equipos antiguos, su zona)
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

function clavePosicion(nombreDb) {
  if (!nombreDb) return null;
  const nombre = nombreDb.toLowerCase();
  const encontrada = Object.entries(POSICIONES).find(([, pos]) => pos.db.some((n) => n.toLowerCase() === nombre));
  return encontrada ? encontrada[0] : null;
}

function etiquetaPosicion(nombreDb) {
  const clave = clavePosicion(nombreDb);
  return clave ? POSICIONES[clave].etiqueta : nombreDb;
}

const SQL_MIS_EQUIPOS = `
  SELECT e.id, e.nombre, coalesce(cz.nombre, e.zona) AS zona, e.escudo_actualizado, m.cantidad_de_jugadores AS jugadores, n.nombre AS nivel,
         e.id_usuario_creador = u.id AS soy_capitan
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
  };
}

async function obtenerMiEquipo(authId, idEquipo = null) {
  const { rows } = await pool.query(`${SQL_MIS_EQUIPOS} LIMIT 1`, [authId, idEquipo]);
  return rows[0] ? filaMiEquipo(rows[0]) : null;
}

async function listarMisEquipos(authId) {
  const { rows } = await pool.query(SQL_MIS_EQUIPOS, [authId, null]);
  return rows.map(filaMiEquipo);
}

async function listarMisEquiposConPlantel(authId) {
  const equipos = await listarMisEquipos(authId);
  const planteles = await Promise.all(equipos.map((equipo) => listarPlantel(equipo.id)));
  return equipos.map((equipo, i) => ({ ...equipo, plantel: planteles[i] }));
}

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
       JOIN usuario uj ON uj.id = j.id_usuario AND uj.activo -- CORRECCIÓN: regla 7 (cuentas inactivas no aparecen)
       LEFT JOIN rol_equipo r ON r.id = ej.id_rol_equipo
      WHERE ej.id_equipo = $1
      ORDER BY capitan DESC NULLS LAST, ej.id`,
    [idEquipo, NOMBRES_ROL_CAPITAN]
  );
  return rows.map((fila) => ({
    id: fila.id,
    nombre: fila.nombre || 'Jugador',
    nombreCarta: fila.nombre_carta || 'Jugador',
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

async function obtenerEscudo(idEquipo) {
  const { rows } = await pool.query('SELECT escudo, escudo_tipo FROM equipo WHERE id = $1 AND activo AND escudo IS NOT NULL', [
    idEquipo,
  ]);
  return rows[0] ? { datos: rows[0].escudo, tipo: rows[0].escudo_tipo } : null;
}

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

async function responderSolicitud(authId, idSolicitud, aceptar) {
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');

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

    const resultado = aceptar ? ESTADO_ACEPTADA : ESTADO_RECHAZADA;
    const estado = await cliente.query('SELECT id FROM estado_solicitud WHERE lower(nombre) = $1', [resultado]);
    if (estado.rowCount === 0) throw new Error(`No existe el estado '${resultado}' en la tabla estado_solicitud.`);
    await cliente.query(
      'UPDATE solicitud_union_equipo SET id_estado_solicitud = $2, fecha_respuesta = now() WHERE id = $1',
      [idSolicitud, estado.rows[0].id]
    );

    if (aceptar) {
      const rol = await cliente.query('SELECT id FROM rol_equipo WHERE lower(nombre) = $1', [ROL_INTEGRANTE]);
      if (rol.rowCount === 0) throw new Error(`No existe el rol '${ROL_INTEGRANTE}' en la tabla rol_equipo.`);
      await cliente.query(
        `INSERT INTO equipo_jugador (id_jugador, id_equipo, id_rol_equipo) VALUES ($1, $2, $3)
         ON CONFLICT (id_jugador, id_equipo) DO NOTHING`,
        [idJugador, idEquipo, rol.rows[0].id]
      );
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

async function listarRivales(idEquipo) {
  const { rows } = await pool.query(
    `SELECT e.id, e.nombre, coalesce(cz.nombre, e.zona) AS zona, e.escudo_actualizado, m.cantidad_de_jugadores AS jugadores, n.nombre AS nivel,
            EXISTS (SELECT 1 FROM desafio d JOIN estado_desafio ed ON ed.id = d.id_estado_desafio
                     WHERE d.id_equipo_desafiante = $1 AND d.id_equipo_desafiado = e.id
                       AND lower(ed.nombre) = $2) AS enviado,
            EXISTS (SELECT 1 FROM desafio d JOIN estado_desafio ed ON ed.id = d.id_estado_desafio
                     WHERE d.id_equipo_desafiante = e.id AND d.id_equipo_desafiado = $1
                       AND lower(ed.nombre) = $2) AS recibido
       FROM equipo e
       LEFT JOIN modalidad m ON m.id = e.id_modalidad
       LEFT JOIN comunas cz ON cz.id = e.id_comuna -- CORRECCIÓN: regla 11 (se muestra la comuna; equipos antiguos, su zona)
       LEFT JOIN nivel n ON n.id = e.id_nivel
      WHERE e.activo AND e.id <> $1
        -- CORRECCIÓN: regla 12 — solo rivales de la misma modalidad que el equipo del capitán
        AND e.id_modalidad = (SELECT propio.id_modalidad FROM equipo propio WHERE propio.id = $1)
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

async function enviarDesafio(authId, idRival, mensaje) {
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');

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

      const rival = await cliente.query('SELECT 1 FROM equipo WHERE id = $1 AND activo AND id <> $2', [idRival, idEquipo]);
      const estado = await cliente.query('SELECT id FROM estado_desafio WHERE lower(nombre) = $1', [ESTADO_DESAFIO_PENDIENTE]);
      if (estado.rowCount === 0) throw new Error("No existe el estado 'pendiente' en la tabla estado_desafio.");

      const mismaModalidad = await cliente.query(
        `SELECT 1 FROM equipo rival JOIN equipo propio ON propio.id = $2
          WHERE rival.id = $1 AND rival.id_modalidad = propio.id_modalidad`,
        [idRival, idEquipo]
      );

      if (rival.rowCount === 0) {
        resultado = 'inexistente';
      } else if (mismaModalidad.rowCount === 0) {
        resultado = 'modalidad';
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

async function crearEquipo(authId, { nombre, correo, zona, nivel, jugadores, idComuna = null }) {
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');

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

    const rol = await cliente.query('SELECT id FROM rol_equipo WHERE lower(nombre) = ANY($1) ORDER BY id LIMIT 1', [
      NOMBRES_ROL_CAPITAN,
    ]);
    if (rol.rowCount === 0) throw new Error("No existe el rol 'capitan' en la tabla rol_equipo.");

    const filaNivel = await cliente.query('SELECT id, puntaje_min FROM nivel WHERE lower(nombre) = lower($1)', [NIVELES[nivel]]);
    if (filaNivel.rowCount === 0) throw new Error(`No existe el nivel '${NIVELES[nivel]}' en la tabla nivel.`);

    const modalidad = await cliente.query('SELECT id FROM modalidad WHERE cantidad_de_jugadores = $1 ORDER BY id LIMIT 1', [
      jugadores,
    ]);
    if (modalidad.rowCount === 0) throw new Error(`No existe una modalidad de ${jugadores} jugadores en la tabla modalidad.`);

    const equipo = await cliente.query(
      `INSERT INTO equipo (nombre, zona, correo_contacto, id_modalidad, id_nivel, id_usuario_creador, puntaje_nivel, id_comuna)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id`,
      [nombre, zona, correo, modalidad.rows[0].id, filaNivel.rows[0].id, idUsuario, filaNivel.rows[0].puntaje_min, idComuna]
    );
    const idEquipo = equipo.rows[0].id;

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

async function listarEquipos(authId) {
  const { rows } = await pool.query(
    `WITH yo AS (
       SELECT u.id AS id_usuario, j.id AS id_jugador
         FROM usuario u
         LEFT JOIN jugador j ON j.id_usuario = u.id
        WHERE u.auth_id = $1
     )
     SELECT e.id, e.nombre, coalesce(cz.nombre, e.zona) AS zona, e.escudo_actualizado, m.cantidad_de_jugadores AS jugadores, n.nombre AS nivel,
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
    modalidad: MODALIDADES[fila.jugadores] || null,
    detalle: detalleEquipo(fila),
    escudo: urlEscudo(fila),
    relacion: fila.es_capitan ? 'capitan' : fila.es_miembro ? 'miembro' : fila.pendiente ? 'pendiente' : null,
  }));
}

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
  if (postulo) return 'solicitud-pendiente';

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

async function listarMisInvitaciones(authId) {
  const { rows } = await pool.query(
    `SELECT i.id, i.fecha_invitacion, e.id AS id_equipo, e.nombre, coalesce(cz.nombre, e.zona) AS zona, e.escudo_actualizado,
            m.cantidad_de_jugadores AS jugadores, n.nombre AS nivel,
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

async function responderInvitacion(authId, idInvitacion, aceptar) {
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');

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

    const resultado = aceptar ? ESTADO_ACEPTADA : ESTADO_RECHAZADA;
    const estado = await cliente.query('SELECT id FROM estado_solicitud WHERE lower(nombre) = $1', [resultado]);
    if (estado.rowCount === 0) throw new Error(`No existe el estado '${resultado}' en la tabla estado_solicitud.`);
    await cliente.query(
      'UPDATE invitacion_equipo SET id_estado_solicitud = $2, fecha_respuesta = now() WHERE id = $1',
      [idInvitacion, estado.rows[0].id]
    );

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
  contarEquiposDeCapitan,
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
  listarJugadoresParaInvitar,
  invitarJugador,
  listarMisInvitaciones,
  responderInvitacion,
  sacarJugador,
  salirDeEquipo,
};
