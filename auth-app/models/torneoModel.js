// models/torneoModel.js
// Torneos que organiza el superadministrador (tablas torneo, torneo_patrocinador, torneo_equipo y
// torneo_partido; ver sql/nuevas_tablas.sql SA-2 a SA-5). Las reglas puras están en config/torneos.js.
// Todas las consultas son parametrizadas ($1, $2...).

const { pool } = require('../config/db');
const reglas = require('../config/torneos');

const SELECT_TORNEO = `
  SELECT t.id, t.nombre, t.formato, t.estado, t.emparejamiento, t.id_modalidad, m.nombre AS modalidad, t.cantidad_equipos,
         t.id_cancha, c.nombre AS cancha, r.nombre AS recinto, co.nombre AS comuna, t.premios,
         t.foto_actualizada, t.id_campeon, ec.nombre AS campeon,
         to_char(t.fecha_inicio, 'YYYY-MM-DD') AS fecha_inicio, to_char(t.hora_inicio, 'HH24:MI') AS hora_inicio,
         (SELECT count(*)::int FROM torneo_equipo te WHERE te.id_torneo = t.id) AS inscritos
    FROM torneo t
    JOIN modalidad m ON m.id = t.id_modalidad
    JOIN cancha c ON c.id = t.id_cancha
    JOIN recinto_deportivo r ON r.id = c.id_recinto_deportivo
    LEFT JOIN direccion d ON d.id = r.id_direccion
    LEFT JOIN comunas co ON co.id = d.id_comunas
    LEFT JOIN equipo ec ON ec.id = t.id_campeon`;

function urlEscudo(id, actualizado) {
  return actualizado ? `/equipos/${id}/escudo?v=${actualizado.getTime()}` : null;
}

function aTorneo(f) {
  return {
    id: f.id,
    nombre: f.nombre,
    formato: f.formato,
    formatoTexto: reglas.FORMATOS[f.formato] || f.formato,
    estado: f.estado,
    estadoTexto: reglas.ESTADOS[f.estado] || f.estado,
    emparejamiento: f.emparejamiento,
    emparejamientoTexto: reglas.EMPAREJAMIENTOS[f.emparejamiento] || f.emparejamiento,
    idModalidad: f.id_modalidad,
    modalidad: f.modalidad,
    cantidadEquipos: f.cantidad_equipos,
    inscritos: f.inscritos,
    cuposLibres: Math.max(0, f.cantidad_equipos - f.inscritos),
    idCancha: f.id_cancha,
    cancha: f.cancha,
    recinto: f.recinto,
    comuna: f.comuna || '',
    premios: f.premios || '',
    foto: f.foto_actualizada ? `/torneos/${f.id}/foto?v=${f.foto_actualizada.getTime()}` : null,
    campeon: f.id_campeon ? { id: f.id_campeon, nombre: f.campeon } : null,
    // SA-5: 'AAAA-MM-DD' / 'HH:MM' o null (= Por confirmar)
    fechaInicio: f.fecha_inicio,
    horaInicio: f.hora_inicio,
    fechaInicioTexto: reglas.textoFechaInicio(f.fecha_inicio, f.hora_inicio),
  };
}

async function patrocinadoresDe(idsTorneos) {
  if (idsTorneos.length === 0) return new Map();
  const { rows } = await pool.query(
    `SELECT id, id_torneo, nombre FROM torneo_patrocinador WHERE id_torneo = ANY($1::int[]) ORDER BY id`,
    [idsTorneos]
  );
  const porTorneo = new Map(idsTorneos.map((id) => [id, []]));
  rows.forEach((p) => porTorneo.get(p.id_torneo).push({ id: p.id, nombre: p.nombre, logo: `/torneos/patrocinadores/${p.id}/logo` }));
  return porTorneo;
}

/** @param {string} texto  @param {{estados?: string[]}} [opciones] */
async function listar(texto = '', { estados = null } = {}) {
  const { rows } = await pool.query(
    `${SELECT_TORNEO}
      WHERE ($1 = '' OR t.nombre ILIKE '%' || $1 || '%' OR r.nombre ILIKE '%' || $1 || '%')
        AND ($2::text[] IS NULL OR t.estado = ANY($2::text[]))
      ORDER BY array_position(ARRAY['inscripcion', 'en_curso', 'finalizado'], t.estado), t.creado_en DESC
      LIMIT 100`,
    [texto, estados]
  );
  const torneos = rows.map(aTorneo);
  const patrocinadores = await patrocinadoresDe(torneos.map((t) => t.id));
  return torneos.map((t) => ({ ...t, patrocinadores: patrocinadores.get(t.id) }));
}

/** Torneo con patrocinadores, equipos inscritos, partidos y (si es liga) tabla de posiciones. */
async function obtener(idTorneo) {
  if (!idTorneo) return null;
  const { rows } = await pool.query(`${SELECT_TORNEO} WHERE t.id = $1`, [idTorneo]);
  if (!rows[0]) return null;
  const torneo = aTorneo(rows[0]);
  torneo.patrocinadores = (await patrocinadoresDe([torneo.id])).get(torneo.id);

  const equipos = await pool.query(
    `SELECT e.id, e.nombre, e.escudo_actualizado, e.id_usuario_creador
       FROM torneo_equipo te JOIN equipo e ON e.id = te.id_equipo
      WHERE te.id_torneo = $1
      ORDER BY te.inscrito_en`,
    [idTorneo]
  );
  torneo.equipos = equipos.rows.map((e) => ({
    id: e.id, nombre: e.nombre, escudo: urlEscudo(e.id, e.escudo_actualizado), idCapitan: e.id_usuario_creador,
  }));

  const partidos = await pool.query(
    `SELECT p.id, p.ronda, p.orden, p.id_local, p.id_visita, p.goles_local, p.goles_visita, p.id_ganador, p.jugado,
            el.nombre AS local, el.escudo_actualizado AS escudo_local,
            ev.nombre AS visita, ev.escudo_actualizado AS escudo_visita
       FROM torneo_partido p
       LEFT JOIN equipo el ON el.id = p.id_local
       LEFT JOIN equipo ev ON ev.id = p.id_visita
      WHERE p.id_torneo = $1
      ORDER BY p.ronda, p.orden`,
    [idTorneo]
  );
  const ultimaRonda = Math.max(0, ...partidos.rows.map((p) => p.ronda));
  const rondas = new Map();
  partidos.rows.forEach((p) => {
    if (!rondas.has(p.ronda)) rondas.set(p.ronda, []);
    rondas.get(p.ronda).push({
      id: p.id,
      local: p.id_local ? { id: p.id_local, nombre: p.local, escudo: urlEscudo(p.id_local, p.escudo_local) } : null,
      visita: p.id_visita ? { id: p.id_visita, nombre: p.visita, escudo: urlEscudo(p.id_visita, p.escudo_visita) } : null,
      golesLocal: p.goles_local,
      golesVisita: p.goles_visita,
      idGanador: p.id_ganador,
      jugado: p.jugado,
      // En la llave, un resultado se puede corregir mientras no exista la ronda siguiente.
      editable: torneo.estado !== 'inscripcion' && (torneo.formato === 'liga' || p.ronda === ultimaRonda),
    });
  });
  torneo.rondas = [...rondas.entries()].map(([numero, lista]) => ({
    numero,
    nombre: torneo.formato === 'liga' ? `Fecha ${numero}` : reglas.nombreRonda(lista.length),
    partidos: lista,
  }));
  if (torneo.formato === 'liga') {
    torneo.tabla = reglas.tablaLiga(torneo.equipos, partidos.rows);
    torneo.descansos = torneo.equipos.length % 2 === 1;
  }
  return torneo;
}

async function modalidades() {
  const { rows } = await pool.query('SELECT id, nombre FROM modalidad ORDER BY cantidad_de_jugadores, nombre');
  return rows;
}

/** Canchas activas de recintos activos, para el buscador del formulario. */
async function canchasDisponibles() {
  const { rows } = await pool.query(
    `SELECT c.id, c.nombre, r.nombre AS recinto, co.nombre AS comuna, m.nombre AS modalidad
       FROM cancha c
       JOIN recinto_deportivo r ON r.id = c.id_recinto_deportivo AND r.activo
       JOIN modalidad m ON m.id = c.id_modalidad
       LEFT JOIN direccion d ON d.id = r.id_direccion
       LEFT JOIN comunas co ON co.id = d.id_comunas
      WHERE c.activo
      ORDER BY co.nombre, r.nombre, c.nombre`
  );
  return rows;
}

/** Cancha activa con su modalidad (para validar que coincida con la del torneo). */
async function canchaParaTorneo(idCancha) {
  const { rows } = await pool.query(
    `SELECT c.id, c.id_modalidad
       FROM cancha c JOIN recinto_deportivo r ON r.id = c.id_recinto_deportivo
      WHERE c.id = $1 AND c.activo AND r.activo`,
    [idCancha]
  );
  return rows[0] || null;
}

async function agregarPatrocinadores(cliente, idTorneo, nuevos) {
  for (const p of nuevos) {
    await cliente.query(
      'INSERT INTO torneo_patrocinador (id_torneo, nombre, logo, logo_tipo) VALUES ($1, $2, $3, $4)',
      [idTorneo, p.nombre, p.logo.datos, p.logo.tipo]
    );
  }
}

async function enTransaccion(fn) {
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    const resultado = await fn(cliente);
    await cliente.query('COMMIT');
    return resultado;
  } catch (err) {
    await cliente.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    cliente.release();
  }
}

/** @param {{datos:Buffer, tipo:string}} foto  @param {{nombre:string, logo:{datos,tipo}}[]} patrocinadores */
async function crear(datos, foto, patrocinadores) {
  return enTransaccion(async (cliente) => {
    const { rows } = await cliente.query(
      `INSERT INTO torneo (nombre, formato, id_modalidad, cantidad_equipos, id_cancha, premios, foto, foto_tipo, foto_actualizada, emparejamiento,
                           fecha_inicio, hora_inicio)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now(), $9, $10, $11) RETURNING id`,
      [datos.nombre, datos.formato, datos.idModalidad, datos.cantidadEquipos, datos.idCancha, datos.premios || null, foto.datos, foto.tipo, datos.emparejamiento,
       datos.fechaInicio, datos.horaInicio]
    );
    await agregarPatrocinadores(cliente, rows[0].id, patrocinadores);
    return rows[0].id;
  });
}

/**
 * Edita un torneo. Formato, modalidad y cantidad solo cambian durante las inscripciones
 * (el controlador ya revisó que la cantidad no quede bajo los inscritos).
 * @param {{datos,tipo}|null} foto - null = conservar la actual.
 */
async function editar(idTorneo, datos, foto, patrocinadoresNuevos, idsPatrocinadoresQuitar) {
  return enTransaccion(async (cliente) => {
    await cliente.query(
      `UPDATE torneo
          SET nombre = $1, id_cancha = $2, premios = $3, fecha_inicio = $9, hora_inicio = $10,
              formato = CASE WHEN estado = 'inscripcion' THEN $4 ELSE formato END,
              id_modalidad = CASE WHEN estado = 'inscripcion' THEN $5 ELSE id_modalidad END,
              cantidad_equipos = CASE WHEN estado = 'inscripcion' THEN $6 ELSE cantidad_equipos END,
              emparejamiento = CASE WHEN estado = 'inscripcion' THEN $8 ELSE emparejamiento END
        WHERE id = $7`,
      [datos.nombre, datos.idCancha, datos.premios || null, datos.formato, datos.idModalidad, datos.cantidadEquipos, idTorneo, datos.emparejamiento,
       datos.fechaInicio, datos.horaInicio]
    );
    if (foto) {
      await cliente.query('UPDATE torneo SET foto = $1, foto_tipo = $2, foto_actualizada = now() WHERE id = $3', [foto.datos, foto.tipo, idTorneo]);
    }
    if (idsPatrocinadoresQuitar.length > 0) {
      await cliente.query('DELETE FROM torneo_patrocinador WHERE id_torneo = $1 AND id = ANY($2::int[])', [idTorneo, idsPatrocinadoresQuitar]);
    }
    await agregarPatrocinadores(cliente, idTorneo, patrocinadoresNuevos);
  });
}

async function eliminar(idTorneo) {
  const { rowCount } = await pool.query('DELETE FROM torneo WHERE id = $1', [idTorneo]);
  return rowCount > 0;
}

async function obtenerFoto(idTorneo) {
  const { rows } = await pool.query('SELECT foto AS datos, foto_tipo AS tipo FROM torneo WHERE id = $1 AND foto IS NOT NULL', [idTorneo]);
  return rows[0] || null;
}

async function obtenerLogo(idPatrocinador) {
  const { rows } = await pool.query('SELECT logo AS datos, logo_tipo AS tipo FROM torneo_patrocinador WHERE id = $1', [idPatrocinador]);
  return rows[0] || null;
}

// ---------- Inscripciones ----------

/** Equipos activos que creó la cuenta, con si juegan la modalidad del torneo y si ya están inscritos. */
async function equiposDelCapitan(authId, idTorneo) {
  const { rows } = await pool.query(
    `SELECT e.id, e.nombre,
            EXISTS (SELECT 1 FROM equipo_modalidad em WHERE em.id_equipo = e.id AND em.id_modalidad = t.id_modalidad)
              OR e.id_modalidad = t.id_modalidad AS juega_modalidad,
            EXISTS (SELECT 1 FROM torneo_equipo te WHERE te.id_equipo = e.id AND te.id_torneo = t.id) AS inscrito
       FROM equipo e
       JOIN usuario u ON u.id = e.id_usuario_creador AND u.auth_id = $1
       CROSS JOIN torneo t
      WHERE t.id = $2 AND e.activo
      ORDER BY e.nombre`,
    [authId, idTorneo]
  );
  return rows.map((f) => ({ id: f.id, nombre: f.nombre, juegaModalidad: f.juega_modalidad, inscrito: f.inscrito }));
}

/** Ids de los torneos donde juega algún equipo de la cuenta (lo creó o está en su plantel). Pestaña "Mis torneos". */
async function idsMisTorneos(authId) {
  const { rows } = await pool.query(
    `SELECT DISTINCT te.id_torneo
       FROM usuario u
       LEFT JOIN jugador j ON j.id_usuario = u.id
       JOIN equipo e ON e.activo
        AND (e.id_usuario_creador = u.id
             OR EXISTS (SELECT 1 FROM equipo_jugador x WHERE x.id_equipo = e.id AND x.id_jugador = j.id))
       JOIN torneo_equipo te ON te.id_equipo = e.id
      WHERE u.auth_id = $1`,
    [authId]
  );
  return rows.map((f) => f.id_torneo);
}

/**
 * Torneos con fecha de inicio entre dos días (ambos incluidos), para el calendario (SA-5).
 * @param {string} desde - 'AAAA-MM-DD'
 * @param {string} hasta - 'AAAA-MM-DD'
 * @param {string} authId - Marca "mio" en los que juega algún equipo de la cuenta.
 */
async function eventosCalendario(desde, hasta, authId) {
  const [{ rows }, mios] = await Promise.all([
    pool.query(`${SELECT_TORNEO} WHERE t.fecha_inicio BETWEEN $1::date AND $2::date ORDER BY t.fecha_inicio, t.hora_inicio NULLS LAST, t.nombre`, [desde, hasta]),
    idsMisTorneos(authId),
  ]);
  return rows.map(aTorneo).map((t) => ({
    tipo: 'torneo',
    id: t.id,
    titulo: t.nombre,
    fecha: t.fechaInicio,
    hora: t.horaInicio,
    estado: t.estado,
    estadoTexto: t.estadoTexto,
    detalle: [t.formatoTexto, t.modalidad, t.recinto].filter(Boolean).join(' · '),
    mio: mios.includes(t.id),
    url: `/torneos/${t.id}`,
  }));
}

/**
 * Inscribe un equipo del capitán. El torneo se bloquea (FOR UPDATE) para que dos inscripciones
 * simultáneas no superen los cupos.
 * @returns {'inscrito'|'inexistente'|'cerrado'|'lleno'|'no-capitan'|'modalidad'|'ya-inscrito'}
 */
async function inscribir(authId, idTorneo, idEquipo) {
  return enTransaccion(async (cliente) => {
    const t = await cliente.query('SELECT estado, cantidad_equipos, id_modalidad FROM torneo WHERE id = $1 FOR UPDATE', [idTorneo]);
    if (!t.rows[0]) return 'inexistente';
    if (t.rows[0].estado !== 'inscripcion') return 'cerrado';
    const equipos = await equiposDelCapitan(authId, idTorneo);
    const equipo = equipos.find((e) => e.id === idEquipo);
    if (!equipo) return 'no-capitan';
    if (equipo.inscrito) return 'ya-inscrito';
    if (!equipo.juegaModalidad) return 'modalidad';
    const { rows } = await cliente.query('SELECT count(*)::int AS n FROM torneo_equipo WHERE id_torneo = $1', [idTorneo]);
    if (rows[0].n >= t.rows[0].cantidad_equipos) return 'lleno';
    await cliente.query('INSERT INTO torneo_equipo (id_torneo, id_equipo) VALUES ($1, $2)', [idTorneo, idEquipo]);
    return 'inscrito';
  });
}

/** Saca un equipo de las inscripciones. authId = null → lo hace el superadministrador. */
async function retirar(authId, idTorneo, idEquipo) {
  const { rowCount } = await pool.query(
    `DELETE FROM torneo_equipo te
      USING torneo t, equipo e, usuario u
      WHERE te.id_torneo = $1 AND te.id_equipo = $2
        AND t.id = te.id_torneo AND t.estado = 'inscripcion'
        AND e.id = te.id_equipo AND u.id = e.id_usuario_creador
        AND ($3::uuid IS NULL OR u.auth_id = $3::uuid)`,
    [idTorneo, idEquipo, authId]
  );
  return rowCount > 0;
}

// ---------- Competencia ----------

async function insertarPartidos(cliente, idTorneo, partidos) {
  for (const p of partidos) {
    await cliente.query(
      'INSERT INTO torneo_partido (id_torneo, ronda, orden, id_local, id_visita) VALUES ($1, $2, $3, $4, $5)',
      [idTorneo, p.ronda, p.orden, p.local, p.visita]
    );
  }
}

/**
 * Empieza el torneo: solo con todos los cupos llenos. Arma el fixture (liga) o la primera ronda (relámpago).
 * @returns {{resultado:'empezado'|'inexistente'|'estado'|'faltan', equipos?:number[]}}
 */
async function empezar(idTorneo) {
  return enTransaccion(async (cliente) => {
    const t = await cliente.query('SELECT formato, estado, cantidad_equipos, emparejamiento FROM torneo WHERE id = $1 FOR UPDATE', [idTorneo]);
    if (!t.rows[0]) return { resultado: 'inexistente' };
    if (t.rows[0].estado !== 'inscripcion') return { resultado: 'estado' };
    // Orden de inscripción: con emparejamiento 'llegada' define los cruces (igual que el cuadrante previo).
    const { rows } = await cliente.query('SELECT id_equipo FROM torneo_equipo WHERE id_torneo = $1 ORDER BY inscrito_en, id_equipo', [idTorneo]);
    const equipos = rows.map((f) => f.id_equipo);
    if (equipos.length < t.rows[0].cantidad_equipos) return { resultado: 'faltan' };
    const { formato, emparejamiento } = t.rows[0];
    const partidos = formato === 'liga' ? reglas.fixtureLiga(equipos, emparejamiento) : reglas.primeraRondaLlave(equipos, emparejamiento);
    await insertarPartidos(cliente, idTorneo, partidos);
    await cliente.query(`UPDATE torneo SET estado = 'en_curso' WHERE id = $1`, [idTorneo]);
    return { resultado: 'empezado', equipos };
  });
}

/**
 * Guarda el resultado de un partido. En la llave no hay empates: si los goles empatan, ganadorPenales
 * dice quién pasó (local/visita). Cuando se completa una ronda se crea la siguiente; con la final
 * (o con todos los partidos de la liga jugados) el torneo queda finalizado y se guarda el campeón.
 * @returns {'guardado'|'inexistente'|'cerrado'|'penales'|'vacio'}
 */
async function registrarResultado(idTorneo, idPartido, golesLocal, golesVisita, ganadorPenales) {
  return enTransaccion(async (cliente) => {
    const t = await cliente.query('SELECT formato, estado FROM torneo WHERE id = $1 FOR UPDATE', [idTorneo]);
    if (!t.rows[0]) return 'inexistente';
    const { formato, estado } = t.rows[0];
    if (estado === 'inscripcion') return 'cerrado';
    const p = await cliente.query('SELECT * FROM torneo_partido WHERE id = $1 AND id_torneo = $2', [idPartido, idTorneo]);
    const partido = p.rows[0];
    if (!partido) return 'inexistente';
    const { rows: [{ max: ultimaRonda }] } = await cliente.query('SELECT max(ronda) FROM torneo_partido WHERE id_torneo = $1', [idTorneo]);
    if (formato === 'relampago' && partido.ronda !== ultimaRonda) return 'cerrado';

    let idGanador = null;
    if (golesLocal > golesVisita) idGanador = partido.id_local;
    else if (golesVisita > golesLocal) idGanador = partido.id_visita;
    else if (formato === 'relampago') {
      if (!['local', 'visita'].includes(ganadorPenales)) return 'penales';
      idGanador = ganadorPenales === 'local' ? partido.id_local : partido.id_visita;
    }
    // Si un equipo fue eliminado de la plataforma, su rival pasa igual.
    if (formato === 'relampago' && !idGanador) idGanador = partido.id_local || partido.id_visita;
    if (formato === 'relampago' && !idGanador) return 'vacio';

    await cliente.query(
      'UPDATE torneo_partido SET goles_local = $1, goles_visita = $2, id_ganador = $3, jugado = TRUE WHERE id = $4',
      [golesLocal, golesVisita, idGanador, idPartido]
    );

    const ronda = await cliente.query(
      'SELECT orden, id_ganador, jugado FROM torneo_partido WHERE id_torneo = $1 AND ronda = $2 ORDER BY orden',
      [idTorneo, formato === 'liga' ? partido.ronda : ultimaRonda]
    );
    if (formato === 'relampago') {
      if (!ronda.rows.every((f) => f.jugado)) return 'guardado';
      if (ronda.rows.length === 1) {
        await cliente.query(`UPDATE torneo SET estado = 'finalizado', id_campeon = $1 WHERE id = $2`, [idGanador, idTorneo]);
        return 'guardado';
      }
      const siguientes = [];
      for (let i = 0; i < ronda.rows.length; i += 2) {
        siguientes.push({ ronda: ultimaRonda + 1, orden: i / 2, local: ronda.rows[i].id_ganador, visita: ronda.rows[i + 1].id_ganador });
      }
      await insertarPartidos(cliente, idTorneo, siguientes);
      return 'guardado';
    }

    // Liga: termina cuando se jugaron todas las fechas; campeón = primero de la tabla.
    const pendientes = await cliente.query('SELECT 1 FROM torneo_partido WHERE id_torneo = $1 AND NOT jugado LIMIT 1', [idTorneo]);
    if (pendientes.rowCount === 0) {
      const equipos = await cliente.query(
        'SELECT e.id, e.nombre FROM torneo_equipo te JOIN equipo e ON e.id = te.id_equipo WHERE te.id_torneo = $1', [idTorneo]
      );
      const todos = await cliente.query('SELECT * FROM torneo_partido WHERE id_torneo = $1', [idTorneo]);
      const [primero] = reglas.tablaLiga(equipos.rows, todos.rows);
      await cliente.query(`UPDATE torneo SET estado = 'finalizado', id_campeon = $1 WHERE id = $2`, [primero ? primero.id : null, idTorneo]);
    }
    return 'guardado';
  });
}

module.exports = {
  listar, obtener, modalidades, canchasDisponibles, canchaParaTorneo, crear, editar, eliminar,
  obtenerFoto, obtenerLogo, equiposDelCapitan, idsMisTorneos, eventosCalendario, inscribir, retirar, empezar, registrarResultado,
};
