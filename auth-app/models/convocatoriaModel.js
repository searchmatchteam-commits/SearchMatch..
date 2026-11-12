// models/convocatoriaModel.js
// Asistencia y cupos de un partido (sql/partido_asistencia.sql):
//  - Cada integrante de los dos equipos confirma su asistencia o avisa que no podrá ir.
//  - El capitán ve cuántos van y, si faltan, publica las posiciones que necesita (cupos por posición).
//  - Jugadores de afuera se inscriben en una posición publicada: entran solos si hay cupo libre y nadie más
//    espera esa posición; si no, quedan pendientes y el capitán elige.
// Todas las consultas son parametrizadas.

const { pool } = require('../config/db');
const { SQL_AHORA } = require('./reservaModel');

const ESTADOS_ASISTENCIA = ['confirmado', 'no_asiste'];

/** Cuenta (usuario + jugador) a partir del UUID de Supabase Auth. */
async function cuentaDe(cliente, authId) {
  const { rows } = await cliente.query(
    `SELECT u.id AS id_usuario, j.id AS id_jugador
       FROM usuario u LEFT JOIN jugador j ON j.id_usuario = u.id
      WHERE u.auth_id = $1`,
    [authId]
  );
  return rows[0] || null;
}

/** Datos mínimos del partido para validar acciones (bloquea la fila si se pide). */
async function partidoBase(cliente, idPartido, bloquear = false) {
  const { rows } = await cliente.query(
    `SELECT p.id, p.cancelado, p.marcador_desafiante IS NOT NULL AS jugado, (p.fecha + p.hora) > ${SQL_AHORA} AS futuro,
            m.cantidad_de_jugadores AS jugadores, d.id_equipo_desafiante, d.id_equipo_desafiado
       FROM partido p
       JOIN desafio d ON d.id = p.id_desafio
       JOIN modalidad m ON m.id = p.id_modalidad
      WHERE p.id = $1 ${bloquear ? 'FOR UPDATE OF p' : ''}`,
    [idPartido]
  );
  const partido = rows[0];
  if (!partido) return null;
  return { ...partido, abierto: !partido.cancelado && !partido.jugado && partido.futuro, equipos: [partido.id_equipo_desafiante, partido.id_equipo_desafiado] };
}

/**
 * Relación de la cuenta con los equipos del partido: el equipo donde es capitán (si lo es) o donde es integrante.
 * @returns {Promise<{idEquipo:number, capitan:boolean, integrante:boolean}|null>}
 */
async function miLado(cliente, cuenta, equipos) {
  const { rows } = await cliente.query(
    `SELECT e.id, e.id_usuario_creador = $2 AS capitan,
            EXISTS (SELECT 1 FROM equipo_jugador ej WHERE ej.id_equipo = e.id AND ej.id_jugador = $3) AS integrante
       FROM equipo e WHERE e.id = ANY($1::int[])`,
    [equipos, cuenta.id_usuario, cuenta.id_jugador]
  );
  const fila = rows.find((r) => r.capitan) || rows.find((r) => r.integrante);
  return fila ? { idEquipo: fila.id, capitan: fila.capitan, integrante: fila.integrante } : null;
}

/** Plantel de un equipo con su respuesta de asistencia a un partido. */
async function plantelConAsistencia(cliente, idPartido, idEquipo) {
  const { rows } = await cliente.query(
    `SELECT j.id, coalesce(nullif(j.apodo, ''), j.nombre_apodo) AS nombre, pa.estado
       FROM equipo_jugador ej
       JOIN jugador j ON j.id = ej.id_jugador
       LEFT JOIN partido_asistencia pa ON pa.id_partido = $1 AND pa.id_jugador = j.id
      WHERE ej.id_equipo = $2
      ORDER BY (pa.estado = 'confirmado') DESC NULLS LAST, (pa.estado IS NULL) DESC, nombre`,
    [idPartido, idEquipo]
  );
  return rows;
}

/** Cupos publicados por un equipo, con sus inscritos (aceptados y pendientes). */
async function cuposDeEquipo(cliente, idPartido, idEquipo) {
  const { rows } = await cliente.query(
    `SELECT c.id_posicion, po.nombre AS posicion, c.cupos,
            coalesce(json_agg(json_build_object('id', pp.id, 'idJugador', j.id, 'nombre', coalesce(nullif(j.apodo, ''), j.nombre_apodo), 'estado', pp.estado)
                              ORDER BY pp.estado, pp.fecha) FILTER (WHERE pp.id IS NOT NULL), '[]') AS inscritos
       FROM partido_cupo c
       JOIN posicion po ON po.id = c.id_posicion
       LEFT JOIN partido_postulacion pp ON pp.id_partido = c.id_partido AND pp.id_equipo = c.id_equipo
                                       AND pp.id_posicion = c.id_posicion AND pp.estado IN ('aceptada', 'pendiente')
       LEFT JOIN jugador j ON j.id = pp.id_jugador
      WHERE c.id_partido = $1 AND c.id_equipo = $2
      GROUP BY c.id_posicion, po.nombre, c.cupos
      ORDER BY c.id_posicion`,
    [idPartido, idEquipo]
  );
  return rows.map((r) => {
    const aceptados = r.inscritos.filter((i) => i.estado === 'aceptada');
    const pendientes = r.inscritos.filter((i) => i.estado === 'pendiente');
    return { idPosicion: r.id_posicion, posicion: r.posicion, cupos: r.cupos, aceptados, pendientes, libres: Math.max(r.cupos - aceptados.length, 0) };
  });
}

/** Posiciones del catálogo (para publicar cupos). */
async function posiciones() {
  const { rows } = await pool.query('SELECT id, nombre FROM posicion ORDER BY id');
  return rows;
}

/**
 * Todo lo que la pantalla del partido necesita sobre asistencia y cupos, según quién mira.
 * @returns {Promise<object|null>} null si el partido no existe.
 */
async function contexto(authId, idPartido) {
  const cliente = await pool.connect();
  try {
    const partido = await partidoBase(cliente, idPartido);
    const cuenta = await cuentaDe(cliente, authId);
    if (!partido || !cuenta) return null;
    const lado = await miLado(cliente, cuenta, partido.equipos);

    const salida = { abierto: partido.abierto, jugadoresPorEquipo: partido.jugadores, lado, tieneJugador: Boolean(cuenta.id_jugador) };

    if (lado) {
      const [plantel, cupos] = await Promise.all([
        plantelConAsistencia(cliente, idPartido, lado.idEquipo),
        cuposDeEquipo(cliente, idPartido, lado.idEquipo),
      ]);
      const confirmados = plantel.filter((p) => p.estado === 'confirmado').length;
      const externos = cupos.reduce((n, c) => n + c.aceptados.length, 0);
      salida.equipo = {
        plantel,
        cupos,
        confirmados,
        noAsisten: plantel.filter((p) => p.estado === 'no_asiste').length,
        sinResponder: plantel.filter((p) => !p.estado).length,
        externos,
        faltan: Math.max(partido.jugadores - confirmados - externos, 0),
        cuposPublicados: cupos.reduce((n, c) => n + c.cupos, 0),
      };
      const yo = plantel.find((p) => p.id === cuenta.id_jugador);
      salida.miAsistencia = yo ? yo.estado || null : null;
      salida.soyDelPlantel = Boolean(yo);
    } else {
      // Jugador de afuera: los cupos abiertos de ambos equipos y su propia inscripción
      const [a, b, mia] = await Promise.all([
        cuposDeEquipo(cliente, idPartido, partido.id_equipo_desafiante),
        cuposDeEquipo(cliente, idPartido, partido.id_equipo_desafiado),
        cuenta.id_jugador
          ? cliente.query(
            `SELECT pp.id, pp.estado, pp.id_equipo, po.nombre AS posicion FROM partido_postulacion pp JOIN posicion po ON po.id = pp.id_posicion
              WHERE pp.id_partido = $1 AND pp.id_jugador = $2`,
            [idPartido, cuenta.id_jugador]
          ).then((r) => r.rows[0] || null)
          : null,
      ]);
      salida.cuposPublicos = [
        { idEquipo: partido.id_equipo_desafiante, cupos: a },
        { idEquipo: partido.id_equipo_desafiado, cupos: b },
      ].filter((e) => e.cupos.length > 0);
      salida.miPostulacion = mia;
    }
    return salida;
  } finally {
    cliente.release();
  }
}

/**
 * Un integrante responde si va al partido. Se puede cambiar hasta que el partido empiece.
 * @returns {Promise<{resultado:string, idEquipo?:number, cambio?:boolean}>}
 */
async function responderAsistencia(authId, idPartido, estado) {
  if (!ESTADOS_ASISTENCIA.includes(estado)) return { resultado: 'invalido' };
  const cliente = await pool.connect();
  try {
    const partido = await partidoBase(cliente, idPartido);
    const cuenta = await cuentaDe(cliente, authId);
    if (!partido) return { resultado: 'inexistente' };
    if (!cuenta || !cuenta.id_jugador) return { resultado: 'sin-permiso' };
    if (!partido.abierto) return { resultado: 'cerrado' };
    // Equipo del partido en cuyo plantel está (si está en ambos, el primero)
    const { rows } = await cliente.query(
      'SELECT id_equipo FROM equipo_jugador WHERE id_jugador = $1 AND id_equipo = ANY($2::int[]) ORDER BY id_equipo LIMIT 1',
      [cuenta.id_jugador, partido.equipos]
    );
    if (!rows[0]) return { resultado: 'sin-permiso' };
    const anterior = await cliente.query('SELECT estado FROM partido_asistencia WHERE id_partido = $1 AND id_jugador = $2', [idPartido, cuenta.id_jugador]);
    await cliente.query(
      `INSERT INTO partido_asistencia (id_partido, id_jugador, id_equipo, estado) VALUES ($1, $2, $3, $4)
       ON CONFLICT (id_partido, id_jugador) DO UPDATE SET estado = EXCLUDED.estado, fecha = now()`,
      [idPartido, cuenta.id_jugador, rows[0].id_equipo, estado]
    );
    return { resultado: estado, idEquipo: rows[0].id_equipo, cambio: !anterior.rows[0] || anterior.rows[0].estado !== estado };
  } finally {
    cliente.release();
  }
}

/** Verifica que la cuenta capitanea ese equipo del partido. */
async function esCapitanDe(cliente, authId, idEquipo) {
  const { rowCount } = await cliente.query(
    'SELECT 1 FROM equipo e JOIN usuario u ON u.id = e.id_usuario_creador WHERE e.id = $1 AND u.auth_id = $2',
    [idEquipo, authId]
  );
  return rowCount > 0;
}

/**
 * El capitán publica (o ajusta) los cupos por posición de su equipo. Un cupo no puede quedar por debajo de los
 * jugadores de afuera ya aceptados en esa posición; las posiciones que se quitan rechazan a sus pendientes.
 * Con todos en 0 deja de buscar (quedan solo los ya aceptados).
 * @param {Object<number, number>} cuposPorPosicion - { idPosicion: cupos }
 * @returns {Promise<{resultado:string, idEquipo?:number, rechazados?:number[], publicados?:number}>}
 */
async function publicarCupos(authId, idPartido, cuposPorPosicion) {
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    const partido = await partidoBase(cliente, idPartido, true);
    const cuenta = await cuentaDe(cliente, authId);
    let resultado = null;
    let lado = null;
    if (!partido) resultado = 'inexistente';
    else if (!cuenta) resultado = 'sin-permiso';
    else {
      lado = await miLado(cliente, cuenta, partido.equipos);
      if (!lado || !lado.capitan) resultado = 'sin-permiso';
      else if (!partido.abierto) resultado = 'cerrado';
    }
    if (resultado) {
      await cliente.query('ROLLBACK');
      return { resultado };
    }

    const { rows: catalogo } = await cliente.query('SELECT id FROM posicion');
    const validas = new Set(catalogo.map((p) => p.id));
    const pedidos = Object.entries(cuposPorPosicion)
      .map(([id, n]) => [Number(id), Number(n)])
      .filter(([id, n]) => validas.has(id) && Number.isInteger(n) && n >= 0 && n <= 11);

    const actuales = await cuposDeEquipo(cliente, idPartido, lado.idEquipo);
    const aceptadosEn = (id) => (actuales.find((c) => c.idPosicion === id) || { aceptados: [] }).aceptados.length;

    // Cupos finales por posición: lo pedido, nunca menos que los ya aceptados; lo no enviado queda como estaba
    const todas = [...new Set([...pedidos.map(([id]) => id), ...actuales.map((c) => c.idPosicion)])];
    const finales = todas.map((idPosicion) => {
      const pedido = pedidos.find(([id]) => id === idPosicion);
      const actual = actuales.find((c) => c.idPosicion === idPosicion);
      return [idPosicion, Math.max(pedido ? pedido[1] : actual.cupos, aceptadosEn(idPosicion))];
    });
    const publicados = finales.reduce((n, [id, c]) => n + c - aceptadosEn(id), 0);

    // Tope: lo que falta para completar el equipo con los confirmados del plantel (los aceptados ya ocupan su cupo)
    const confirmados = (await plantelConAsistencia(cliente, idPartido, lado.idEquipo)).filter((p) => p.estado === 'confirmado').length;
    const maximo = Math.max(partido.jugadores - confirmados, 0);
    if (publicados > 0 && finales.reduce((n, [, c]) => n + c, 0) > maximo) {
      await cliente.query('ROLLBACK');
      return { resultado: 'demasiados', maximo };
    }

    const rechazados = [];
    for (const [idPosicion, final] of finales) {
      if (final > 0) {
        await cliente.query(
          `INSERT INTO partido_cupo (id_partido, id_equipo, id_posicion, cupos) VALUES ($1, $2, $3, $4)
           ON CONFLICT (id_partido, id_equipo, id_posicion) DO UPDATE SET cupos = EXCLUDED.cupos`,
          [idPartido, lado.idEquipo, idPosicion, final]
        );
      } else {
        await cliente.query('DELETE FROM partido_cupo WHERE id_partido = $1 AND id_equipo = $2 AND id_posicion = $3', [idPartido, lado.idEquipo, idPosicion]);
      }
      // Si el capitán dejó de buscar esa posición (la puso en 0), los que esperaban quedan rechazados
      if (pedidos.some(([id, c]) => id === idPosicion && c === 0)) {
        const { rows } = await cliente.query(
          `UPDATE partido_postulacion SET estado = 'rechazada'
            WHERE id_partido = $1 AND id_equipo = $2 AND id_posicion = $3 AND estado = 'pendiente' RETURNING id_jugador`,
          [idPartido, lado.idEquipo, idPosicion]
        );
        rechazados.push(...rows.map((r) => r.id_jugador));
      }
    }
    await cliente.query('COMMIT');
    return { resultado: publicados > 0 ? 'publicado' : 'cerrado-cupos', idEquipo: lado.idEquipo, rechazados, publicados };
  } catch (err) {
    await cliente.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    cliente.release();
  }
}

/**
 * Un jugador de afuera se inscribe en una posición publicada. Entra solo si queda cupo y nadie más espera
 * esa posición; si no, queda pendiente para que el capitán elija.
 * @returns {Promise<{resultado:string, idEquipo?:number, posicion?:string}>}
 */
async function postular(authId, idPartido, idEquipo, idPosicion) {
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    const partido = await partidoBase(cliente, idPartido, true);
    const cuenta = await cuentaDe(cliente, authId);
    let resultado = null;
    if (!partido) resultado = 'inexistente';
    else if (!cuenta || !cuenta.id_jugador) resultado = 'sin-carta';
    else if (!partido.abierto) resultado = 'cerrado';
    else if (!partido.equipos.includes(idEquipo)) resultado = 'sin-cupo';
    else if (await miLado(cliente, cuenta, partido.equipos)) resultado = 'es-del-equipo';
    let cupo = null;
    if (!resultado) {
      const { rows } = await cliente.query(
        `SELECT c.cupos, po.nombre AS posicion FROM partido_cupo c JOIN posicion po ON po.id = c.id_posicion
          WHERE c.id_partido = $1 AND c.id_equipo = $2 AND c.id_posicion = $3 FOR UPDATE OF c`,
        [idPartido, idEquipo, idPosicion]
      );
      cupo = rows[0];
      if (!cupo) resultado = 'sin-cupo';
    }
    if (!resultado) {
      const previa = await cliente.query('SELECT estado FROM partido_postulacion WHERE id_partido = $1 AND id_jugador = $2', [idPartido, cuenta.id_jugador]);
      if (previa.rows[0]) resultado = previa.rows[0].estado === 'rechazada' ? 'rechazado-antes' : 'ya-inscrito';
    }
    if (resultado) {
      await cliente.query('ROLLBACK');
      return { resultado };
    }
    const { rows: conteo } = await cliente.query(
      `SELECT count(*) FILTER (WHERE estado = 'aceptada')::int AS aceptados, count(*) FILTER (WHERE estado = 'pendiente')::int AS pendientes
         FROM partido_postulacion WHERE id_partido = $1 AND id_equipo = $2 AND id_posicion = $3`,
      [idPartido, idEquipo, idPosicion]
    );
    const entraDirecto = conteo[0].aceptados < cupo.cupos && conteo[0].pendientes === 0;
    await cliente.query(
      'INSERT INTO partido_postulacion (id_partido, id_equipo, id_posicion, id_jugador, estado) VALUES ($1, $2, $3, $4, $5)',
      [idPartido, idEquipo, idPosicion, cuenta.id_jugador, entraDirecto ? 'aceptada' : 'pendiente']
    );
    await cliente.query('COMMIT');
    return { resultado: entraDirecto ? 'aceptada' : 'pendiente', idEquipo, posicion: cupo.posicion, idJugador: cuenta.id_jugador };
  } catch (err) {
    await cliente.query('ROLLBACK').catch(() => {});
    if (err.code === '23505') return { resultado: 'ya-inscrito' };
    throw err;
  } finally {
    cliente.release();
  }
}

/** El jugador de afuera se retira (se borra su inscripción, pendiente o aceptada). */
async function retirarse(authId, idPartido) {
  const cliente = await pool.connect();
  try {
    const partido = await partidoBase(cliente, idPartido);
    const cuenta = await cuentaDe(cliente, authId);
    if (!partido) return { resultado: 'inexistente' };
    if (!partido.abierto) return { resultado: 'cerrado' };
    if (!cuenta || !cuenta.id_jugador) return { resultado: 'sin-permiso' };
    const { rows } = await cliente.query(
      `DELETE FROM partido_postulacion WHERE id_partido = $1 AND id_jugador = $2 AND estado IN ('pendiente', 'aceptada')
       RETURNING id_equipo, estado`,
      [idPartido, cuenta.id_jugador]
    );
    if (!rows[0]) return { resultado: 'sin-inscripcion' };
    return { resultado: 'retirado', idEquipo: rows[0].id_equipo, estabaAceptado: rows[0].estado === 'aceptada' };
  } finally {
    cliente.release();
  }
}

/**
 * El capitán decide sobre un inscrito de su equipo: aceptar (si queda cupo en su posición), rechazar o
 * quitar a uno ya aceptado (para liberar el cupo y elegir a otro).
 * @param {'aceptar'|'rechazar'|'quitar'} accion
 */
async function decidir(authId, idPartido, idPostulacion, accion) {
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    const partido = await partidoBase(cliente, idPartido, true);
    const { rows } = await cliente.query(
      `SELECT pp.id, pp.estado, pp.id_equipo, pp.id_posicion, pp.id_jugador, c.cupos, po.nombre AS posicion
         FROM partido_postulacion pp
         JOIN posicion po ON po.id = pp.id_posicion
         LEFT JOIN partido_cupo c ON c.id_partido = pp.id_partido AND c.id_equipo = pp.id_equipo AND c.id_posicion = pp.id_posicion
        WHERE pp.id = $1 AND pp.id_partido = $2 FOR UPDATE OF pp`,
      [idPostulacion, idPartido]
    );
    const post = rows[0];
    let resultado = null;
    if (!partido || !post) resultado = 'inexistente';
    else if (!(await esCapitanDe(cliente, authId, post.id_equipo))) resultado = 'sin-permiso';
    else if (!partido.abierto) resultado = 'cerrado';
    else if (accion === 'aceptar' && post.estado !== 'pendiente') resultado = 'invalido';
    else if (accion === 'rechazar' && post.estado !== 'pendiente') resultado = 'invalido';
    else if (accion === 'quitar' && post.estado !== 'aceptada') resultado = 'invalido';
    else if (!['aceptar', 'rechazar', 'quitar'].includes(accion)) resultado = 'invalido';
    if (!resultado && accion === 'aceptar') {
      const { rows: n } = await cliente.query(
        `SELECT count(*)::int AS aceptados FROM partido_postulacion
          WHERE id_partido = $1 AND id_equipo = $2 AND id_posicion = $3 AND estado = 'aceptada'`,
        [idPartido, post.id_equipo, post.id_posicion]
      );
      if (!post.cupos || n[0].aceptados >= post.cupos) resultado = 'lleno';
    }
    if (resultado) {
      await cliente.query('ROLLBACK');
      return { resultado };
    }
    await cliente.query('UPDATE partido_postulacion SET estado = $2 WHERE id = $1', [post.id, accion === 'aceptar' ? 'aceptada' : 'rechazada']);
    await cliente.query('COMMIT');
    return { resultado: accion === 'aceptar' ? 'aceptado' : accion === 'quitar' ? 'quitado' : 'rechazado', idJugador: post.id_jugador, posicion: post.posicion, idEquipo: post.id_equipo };
  } catch (err) {
    await cliente.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    cliente.release();
  }
}

/**
 * Partidos futuros con cupos libres, para jugadores de afuera (no muestra los de sus propios equipos).
 * @returns {Promise<object[]>} un elemento por partido y equipo que busca, con sus posiciones libres.
 */
async function listarAbiertos(authId, limite = 20) {
  const { rows } = await pool.query(
    `WITH yo AS (SELECT u.id AS id_usuario, j.id AS id_jugador FROM usuario u LEFT JOIN jugador j ON j.id_usuario = u.id WHERE u.auth_id = $1),
     libres AS (
       SELECT c.id_partido, c.id_equipo, c.id_posicion, po.nombre AS posicion,
              c.cupos - count(pp.id) FILTER (WHERE pp.estado = 'aceptada') AS libres
         FROM partido_cupo c
         JOIN posicion po ON po.id = c.id_posicion
         LEFT JOIN partido_postulacion pp ON pp.id_partido = c.id_partido AND pp.id_equipo = c.id_equipo AND pp.id_posicion = c.id_posicion
        GROUP BY c.id_partido, c.id_equipo, c.id_posicion, po.nombre, c.cupos)
     SELECT p.id, to_char(p.fecha, 'YYYY-MM-DD') AS fecha, to_char(p.hora, 'HH24:MI') AS hora,
            e.id AS id_equipo, e.nombre AS equipo, rival.nombre AS rival, m.nombre AS modalidad,
            ca.nombre AS cancha, co.nombre AS comuna,
            json_agg(json_build_object('posicion', l.posicion, 'libres', l.libres) ORDER BY l.id_posicion) AS posiciones,
            sum(l.libres)::int AS total_libres,
            (SELECT pp.estado FROM partido_postulacion pp, yo WHERE pp.id_partido = p.id AND pp.id_jugador = yo.id_jugador) AS mi_estado
       FROM libres l
       JOIN partido p ON p.id = l.id_partido
       JOIN desafio d ON d.id = p.id_desafio
       JOIN equipo e ON e.id = l.id_equipo
       JOIN equipo rival ON rival.id = CASE WHEN d.id_equipo_desafiante = e.id THEN d.id_equipo_desafiado ELSE d.id_equipo_desafiante END
       JOIN modalidad m ON m.id = p.id_modalidad
       JOIN cancha ca ON ca.id = p.id_cancha
       JOIN recinto_deportivo rd ON rd.id = ca.id_recinto_deportivo
       JOIN direccion dir ON dir.id = rd.id_direccion
       JOIN comunas co ON co.id = dir.id_comunas
       CROSS JOIN yo
      WHERE l.libres > 0 AND NOT p.cancelado AND p.marcador_desafiante IS NULL AND (p.fecha + p.hora) > ${SQL_AHORA}
        AND NOT EXISTS (SELECT 1 FROM equipo x WHERE x.id IN (d.id_equipo_desafiante, d.id_equipo_desafiado)
                          AND (x.id_usuario_creador = yo.id_usuario
                               OR EXISTS (SELECT 1 FROM equipo_jugador ej WHERE ej.id_equipo = x.id AND ej.id_jugador = yo.id_jugador)))
      GROUP BY p.id, p.fecha, p.hora, e.id, e.nombre, rival.nombre, m.nombre, ca.nombre, co.nombre
      ORDER BY p.fecha, p.hora
      LIMIT $2`,
    [authId, limite]
  );
  return rows;
}

/** Jugadores de afuera inscritos (aceptados o pendientes) en un partido, para avisarles si se cancela. */
async function jugadoresInscritos(idPartido) {
  const { rows } = await pool.query(
    "SELECT id_jugador FROM partido_postulacion WHERE id_partido = $1 AND estado IN ('aceptada', 'pendiente')",
    [idPartido]
  );
  return rows.map((r) => r.id_jugador);
}

/** Nombre visible de un jugador (apodo o nombre). */
async function nombreJugador(idJugador) {
  const { rows } = await pool.query("SELECT coalesce(nullif(apodo, ''), nombre_apodo) AS nombre FROM jugador WHERE id = $1", [idJugador]);
  return rows[0] ? rows[0].nombre : 'Un jugador';
}

/** Nombre visible de la cuenta (para avisos de asistencia). */
async function nombreDeCuenta(authId) {
  const { rows } = await pool.query(
    `SELECT coalesce(nullif(j.apodo, ''), j.nombre_apodo) AS nombre FROM usuario u JOIN jugador j ON j.id_usuario = u.id WHERE u.auth_id = $1`,
    [authId]
  );
  return rows[0] ? rows[0].nombre : 'Un jugador';
}

module.exports = {
  ESTADOS_ASISTENCIA,
  posiciones,
  contexto,
  responderAsistencia,
  publicarCupos,
  postular,
  retirarse,
  decidir,
  listarAbiertos,
  jugadoresInscritos,
  nombreJugador,
  nombreDeCuenta,
};
