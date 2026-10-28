// models/torneoModel.js
// Torneos que organiza la administración (tablas torneo, torneo_cancha, torneo_patrocinador, torneo_equipo,
// torneo_partido y torneo_pago; ver sql/nuevas_tablas.sql SA-2 a SA-7). Las reglas puras están en config/torneos.js.
// Estados: borrador → abierto ↔ completo → cerrado → en_curso → finalizado (cancelado: fase 4).
// Toda acción de administración escribe en el registro de actividad dentro de su transacción (AP-032).
// Todas las consultas son parametrizadas ($1, $2...).

const { pool } = require('../config/db');
const { construirSQL, MAX_CSV } = require('../config/listados');
const reglas = require('../config/torneos');
const actividad = require('./actividadModel');
const { notificarCapitanesEnTransaccion } = require('./notificacionModel');

// Listas fijas del código (no datos del usuario): se pegan como literales en el SQL.
const SQL_PARTICIPA = `ARRAY[${reglas.INSCRIPCION_PARTICIPA.map((e) => `'${e}'`).join(', ')}]::text[]`;
const SQL_ACTIVA = `ARRAY[${reglas.INSCRIPCION_ACTIVA.map((e) => `'${e}'`).join(', ')}]::text[]`;
// Una inscripción pendiente de pago ocupa cupo solo mientras su reserva está vigente (comprobación perezosa).
const SQL_OCUPA = `(te.estado = ANY(${SQL_PARTICIPA}) OR (te.estado = 'pendiente_pago' AND te.reservada_hasta > now()))`;

const SELECT_TORNEO = `
  SELECT t.id, t.nombre, t.formato, t.estado, t.emparejamiento, t.id_modalidad, m.nombre AS modalidad,
         t.cupo_min, t.cupo_max, t.min_jugadores, t.cantidad_grupos, t.clasifican_por_grupo,
         t.descripcion, t.reglamento, t.premios, t.precio, t.medios_pago,
         t.id_nivel_min, nmin.nombre AS nivel_min, t.id_nivel_max, nmax.nombre AS nivel_max,
         t.id_recinto, r.nombre AS recinto, co.nombre AS comuna,
         t.foto_actualizada, t.id_campeon, ec.nombre AS campeon, t.creado_en, t.publicado_en, t.cerrado_en,
         to_char(t.fecha_inicio, 'YYYY-MM-DD') AS fecha_inicio, to_char(t.hora_inicio, 'HH24:MI') AS hora_inicio,
         to_char(t.fecha_termino, 'YYYY-MM-DD') AS fecha_termino,
         to_char(t.fecha_limite_inscripcion, 'YYYY-MM-DD') AS fecha_limite,
         coalesce(ins.confirmados, 0) AS confirmados, coalesce(ins.reservados, 0) AS reservados,
         coalesce(pg.recaudado, 0) AS recaudado, coalesce(pg.aprobados, 0) AS pagos_aprobados,
         coalesce(ca.ids, '{}') AS ids_canchas, coalesce(ca.nombres, '') AS canchas_texto
    FROM torneo t
    JOIN modalidad m ON m.id = t.id_modalidad
    LEFT JOIN recinto_deportivo r ON r.id = t.id_recinto
    LEFT JOIN direccion d ON d.id = r.id_direccion
    LEFT JOIN comunas co ON co.id = d.id_comunas
    LEFT JOIN nivel nmin ON nmin.id = t.id_nivel_min
    LEFT JOIN nivel nmax ON nmax.id = t.id_nivel_max
    LEFT JOIN equipo ec ON ec.id = t.id_campeon
    LEFT JOIN LATERAL (
      SELECT count(*) FILTER (WHERE te.estado = ANY(${SQL_PARTICIPA}))::int AS confirmados,
             count(*) FILTER (WHERE te.estado = 'pendiente_pago' AND te.reservada_hasta > now())::int AS reservados
        FROM torneo_equipo te WHERE te.id_torneo = t.id) ins ON TRUE
    LEFT JOIN LATERAL (
      SELECT sum(p.monto)::int AS recaudado, count(*)::int AS aprobados
        FROM torneo_pago p JOIN torneo_equipo te ON te.id = p.id_inscripcion
       WHERE te.id_torneo = t.id AND p.estado = 'aprobado') pg ON TRUE
    LEFT JOIN LATERAL (
      SELECT array_agg(c.id ORDER BY c.nombre) AS ids, string_agg(c.nombre, ', ' ORDER BY c.nombre) AS nombres
        FROM torneo_cancha tc JOIN cancha c ON c.id = tc.id_cancha WHERE tc.id_torneo = t.id) ca ON TRUE`;

function urlEscudo(id, actualizado) {
  return actualizado ? `/equipos/${id}/escudo?v=${actualizado.getTime()}` : null;
}

function aTorneo(f) {
  const ocupados = f.confirmados + f.reservados;
  return {
    id: f.id,
    nombre: f.nombre,
    formato: f.formato,
    formatoTexto: reglas.FORMATOS[f.formato] || f.formato,
    estado: f.estado,
    estadoTexto: reglas.ESTADOS[f.estado] || f.estado,
    conInscripciones: reglas.CON_INSCRIPCIONES.includes(f.estado),
    emparejamiento: f.emparejamiento,
    emparejamientoTexto: reglas.EMPAREJAMIENTOS[f.emparejamiento] || f.emparejamiento,
    idModalidad: f.id_modalidad,
    modalidad: f.modalidad,
    descripcion: f.descripcion || '',
    reglamento: f.reglamento || '',
    premios: f.premios || '',
    idNivelMin: f.id_nivel_min,
    idNivelMax: f.id_nivel_max,
    nivelTexto: f.nivel_min && f.nivel_max ? (f.nivel_min === f.nivel_max ? f.nivel_min : `${f.nivel_min} a ${f.nivel_max}`) : 'Todos los niveles',
    idRecinto: f.id_recinto,
    recinto: f.recinto || '',
    comuna: f.comuna || '',
    idsCanchas: f.ids_canchas,
    cancha: f.canchas_texto,
    cupoMin: f.cupo_min,
    cupoMax: f.cupo_max,
    // Compatibilidad con las vistas de jugador: la capacidad del torneo es el cupo máximo.
    cantidadEquipos: f.cupo_max,
    minJugadores: f.min_jugadores,
    cantidadGrupos: f.cantidad_grupos,
    clasificanPorGrupo: f.clasifican_por_grupo,
    // inscritos = participantes confirmados; ocupados además cuenta las reservas de pago vigentes.
    inscritos: f.confirmados,
    reservados: f.reservados,
    ocupados,
    cuposLibres: Math.max(0, f.cupo_max - ocupados),
    faltanParaMinimo: Math.max(0, f.cupo_min - f.confirmados),
    precio: f.precio,
    precioTexto: f.precio > 0 ? reglas.formatoCLP(f.precio) : 'Gratuito',
    mediosPago: f.medios_pago || [],
    mediosTexto: (f.medios_pago || []).map((m) => reglas.MEDIOS_PAGO[m] || m).join(', '),
    recaudado: f.recaudado,
    pagosAprobados: f.pagos_aprobados,
    foto: f.foto_actualizada ? `/torneos/${f.id}/foto?v=${f.foto_actualizada.getTime()}` : null,
    campeon: f.id_campeon ? { id: f.id_campeon, nombre: f.campeon } : null,
    creadoEn: f.creado_en,
    publicadoEn: f.publicado_en,
    cerradoEn: f.cerrado_en,
    fechaInicio: f.fecha_inicio,
    horaInicio: f.hora_inicio,
    fechaTermino: f.fecha_termino,
    fechaLimite: f.fecha_limite,
    fechaInicioTexto: reglas.textoFechaInicio(f.fecha_inicio, f.hora_inicio),
    fechaTerminoTexto: reglas.textoFechaInicio(f.fecha_termino, null),
    fechaLimiteTexto: reglas.textoFechaInicio(f.fecha_limite, null),
    inscripcionVencida: reglas.inscripcionVencida(f.fecha_limite),
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

/**
 * Torneos que ven los jugadores (nunca los borradores).
 * @param {string} texto  @param {{estados?: string[]}} [opciones]
 */
async function listar(texto = '', { estados = null } = {}) {
  const { rows } = await pool.query(
    `${SELECT_TORNEO}
      WHERE t.estado <> 'borrador'
        AND ($1 = '' OR t.nombre ILIKE '%' || $1 || '%' OR r.nombre ILIKE '%' || $1 || '%')
        AND ($2::text[] IS NULL OR t.estado = ANY($2::text[]))
      ORDER BY array_position(ARRAY['abierto', 'completo', 'cerrado', 'en_curso', 'finalizado', 'cancelado'], t.estado), t.creado_en DESC
      LIMIT 100`,
    [texto, estados]
  );
  const torneos = rows.map(aTorneo);
  const patrocinadores = await patrocinadoresDe(torneos.map((t) => t.id));
  return torneos.map((t) => ({ ...t, patrocinadores: patrocinadores.get(t.id) }));
}

// ---------- AP-027 · Listado del panel (AP-003) ----------

const LISTADO = {
  buscar: ['t.nombre', 'r.nombre'],
  filtros: {
    estado: {
      etiqueta: 'Estado',
      tipo: 'opcion',
      opciones: Object.fromEntries(Object.entries(reglas.ESTADOS).map(([k, texto]) => [k, { texto, sql: `t.estado = '${k}'` }])),
    },
    modalidad: { etiqueta: 'Modalidad', tipo: 'id', sql: 't.id_modalidad = ?' },
    formato: {
      etiqueta: 'Formato',
      tipo: 'opcion',
      opciones: Object.fromEntries(Object.entries(reglas.FORMATOS).map(([k, texto]) => [k, { texto, sql: `t.formato = '${k}'` }])),
    },
    // Torneos que admiten ese nivel (su puntaje mínimo cae dentro del rango del torneo).
    nivel: {
      etiqueta: 'Nivel',
      tipo: 'id',
      sql: `EXISTS (SELECT 1 FROM nivel n WHERE n.id = ? AND n.puntaje_min BETWEEN coalesce(
              (SELECT puntaje_min FROM nivel WHERE id = t.id_nivel_min), 0) AND coalesce(
              (SELECT puntaje_min FROM nivel WHERE id = t.id_nivel_max), 2147483647))`,
    },
    recinto: { etiqueta: 'Recinto', tipo: 'id', sql: 't.id_recinto = ?' },
    desde: { etiqueta: 'Inicio desde', tipo: 'fecha', sql: 't.fecha_inicio >= ?::date' },
    hasta: { etiqueta: 'Inicio hasta', tipo: 'fecha', sql: 't.fecha_inicio <= ?::date' },
  },
  orden: {
    creado: 't.creado_en', nombre: 't.nombre', estado: 't.estado', inicio: 't.fecha_inicio',
    inscritos: 'coalesce(ins.confirmados, 0)', precio: 't.precio', recaudado: 'coalesce(pg.recaudado, 0)',
  },
  ordenDefecto: 'creado',
  dirDefecto: 'desc',
  desempate: 't.id',
};

/** @returns {Promise<{filas:object[], total:number}>} */
async function listarAdmin(estado, { todo = false } = {}) {
  const s = construirSQL(estado, LISTADO);
  const { rows } = await pool.query(
    `${SELECT_TORNEO.replace('SELECT t.id,', 'SELECT count(*) OVER()::int AS total, t.id,')}
      WHERE ${s.where}
      ORDER BY ${s.orderBy}
      ${todo ? `LIMIT ${MAX_CSV}` : s.limite}`,
    todo ? s.params : [...s.params, ...s.paramsPagina]
  );
  return { filas: rows.map((f) => ({ ...aTorneo(f), acciones: reglas.accionesTorneo(f.estado) })), total: rows[0] ? rows[0].total : 0 };
}

/** Opciones de los filtros del listado y del formulario. */
async function catalogos() {
  const [modalidades, niveles, recintos] = await Promise.all([
    pool.query('SELECT id, nombre FROM modalidad ORDER BY cantidad_de_jugadores, nombre'),
    pool.query('SELECT id, nombre, puntaje_min FROM nivel ORDER BY puntaje_min, nombre'),
    pool.query('SELECT DISTINCT r.id, r.nombre FROM recinto_deportivo r JOIN torneo t ON t.id_recinto = r.id ORDER BY r.nombre'),
  ]);
  return { modalidades: modalidades.rows, niveles: niveles.rows, recintosConTorneos: recintos.rows };
}

/**
 * TO-001 c5 · Recintos activos con al menos una cancha activa, con las modalidades que admiten.
 * Con idModalidad, solo los que tienen canchas activas de esa modalidad.
 */
async function recintosParaTorneo(idModalidad = null) {
  const { rows } = await pool.query(
    `SELECT r.id, r.nombre, co.nombre AS comuna, array_agg(DISTINCT c.id_modalidad) AS modalidades
       FROM recinto_deportivo r
       JOIN cancha c ON c.id_recinto_deportivo = r.id AND c.activo
       LEFT JOIN direccion d ON d.id = r.id_direccion
       LEFT JOIN comunas co ON co.id = d.id_comunas
      WHERE r.activo AND ($1::int IS NULL OR c.id_modalidad = $1)
      GROUP BY r.id, r.nombre, co.nombre
      ORDER BY co.nombre NULLS LAST, r.nombre`,
    [idModalidad]
  );
  return rows.map((f) => ({ id: f.id, nombre: f.nombre, comuna: f.comuna || '', modalidades: f.modalidades }));
}

/** TO-001 c5 · Canchas activas de un recinto activo (opcionalmente de una modalidad). */
async function canchasDeRecinto(idRecinto, idModalidad = null) {
  if (!idRecinto) return [];
  const { rows } = await pool.query(
    `SELECT c.id, c.nombre, c.id_modalidad, m.nombre AS modalidad
       FROM cancha c
       JOIN recinto_deportivo r ON r.id = c.id_recinto_deportivo AND r.activo
       JOIN modalidad m ON m.id = c.id_modalidad
      WHERE c.id_recinto_deportivo = $1 AND c.activo AND ($2::int IS NULL OR c.id_modalidad = $2)
      ORDER BY c.nombre`,
    [idRecinto, idModalidad]
  );
  return rows.map((f) => ({ id: f.id, nombre: f.nombre, idModalidad: f.id_modalidad, modalidad: f.modalidad }));
}

/** Niveles por id (para validar que el mínimo no supere al máximo). */
async function nivelesPorId(ids) {
  const { rows } = await pool.query('SELECT id, nombre, puntaje_min FROM nivel WHERE id = ANY($1::int[])', [ids.filter(Boolean)]);
  return new Map(rows.map((f) => [f.id, f]));
}

/**
 * Torneo con patrocinadores, inscripciones, partidos y (si es liga) tabla de posiciones.
 * @param {{admin?: boolean}} [opciones] - Sin admin, un borrador no existe (no se muestra a jugadores).
 */
async function obtener(idTorneo, { admin = false } = {}) {
  if (!idTorneo) return null;
  const { rows } = await pool.query(`${SELECT_TORNEO} WHERE t.id = $1`, [idTorneo]);
  if (!rows[0] || (!admin && rows[0].estado === 'borrador')) return null;
  const torneo = aTorneo(rows[0]);
  torneo.patrocinadores = (await patrocinadoresDe([torneo.id])).get(torneo.id);
  torneo.acciones = reglas.accionesTorneo(torneo.estado);
  torneo.camposEditables = reglas.camposEditables(torneo.estado);

  const inscripciones = await pool.query(
    `SELECT te.id AS id_inscripcion, te.estado, te.reservada_hasta, te.inscrito_en, te.confirmada_en, te.motivo,
            ${SQL_OCUPA} AS ocupa, e.id, e.nombre, e.escudo_actualizado, e.id_usuario_creador
       FROM torneo_equipo te JOIN equipo e ON e.id = te.id_equipo
      WHERE te.id_torneo = $1
      ORDER BY te.inscrito_en, te.id`,
    [idTorneo]
  );
  torneo.inscripciones = inscripciones.rows.map((e) => ({
    idInscripcion: e.id_inscripcion,
    id: e.id,
    nombre: e.nombre,
    escudo: urlEscudo(e.id, e.escudo_actualizado),
    idCapitan: e.id_usuario_creador,
    // Comprobación perezosa: una reserva vencida se muestra como expirada aunque el job no haya corrido.
    estado: e.estado === 'pendiente_pago' && !e.ocupa ? 'expirada' : e.estado,
    estadoTexto: reglas.ESTADOS_INSCRIPCION[e.estado === 'pendiente_pago' && !e.ocupa ? 'expirada' : e.estado],
    reservadaHasta: e.reservada_hasta,
    inscritoEn: e.inscrito_en,
    motivo: e.motivo,
  }));
  // Participantes (lo que usan el cuadrante, la tabla y las vistas de jugador).
  torneo.equipos = torneo.inscripciones.filter((i) => reglas.INSCRIPCION_PARTICIPA.includes(i.estado));

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
  const compitiendo = ['en_curso', 'finalizado'].includes(torneo.estado);
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
      editable: compitiendo && (torneo.formato === 'liga' || p.ronda === ultimaRonda),
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

/** Valores del torneo que se guardan en el registro de actividad (sin imágenes). */
function resumen(f) {
  return {
    nombre: f.nombre, estado: f.estado, formato: f.formato, id_modalidad: f.id_modalidad, id_nivel_min: f.id_nivel_min,
    id_nivel_max: f.id_nivel_max, id_recinto: f.id_recinto, canchas: f.canchas, fecha_inicio: f.fecha_inicio, hora_inicio: f.hora_inicio, fecha_termino: f.fecha_termino,
    fecha_limite_inscripcion: f.fecha_limite, cupo_min: f.cupo_min, cupo_max: f.cupo_max, min_jugadores: f.min_jugadores,
    cantidad_grupos: f.cantidad_grupos, clasifican_por_grupo: f.clasifican_por_grupo, precio: f.precio, medios_pago: f.medios_pago,
    emparejamiento: f.emparejamiento, premios: f.premios, descripcion: f.descripcion, reglamento: f.reglamento,
  };
}

/** Fila del torneo bloqueada (FOR UPDATE) con sus canchas, en el formato de resumen(). */
async function bloquear(cliente, idTorneo) {
  const { rows } = await cliente.query(
    `SELECT t.*, to_char(t.fecha_inicio, 'YYYY-MM-DD') AS fecha_inicio, to_char(t.hora_inicio, 'HH24:MI') AS hora_inicio,
            to_char(t.fecha_termino, 'YYYY-MM-DD') AS fecha_termino, to_char(t.fecha_limite_inscripcion, 'YYYY-MM-DD') AS fecha_limite,
            (t.foto IS NOT NULL) AS tiene_foto
       FROM torneo t WHERE t.id = $1 FOR UPDATE`,
    [idTorneo]
  );
  if (!rows[0]) return null;
  const canchas = await cliente.query('SELECT id_cancha FROM torneo_cancha WHERE id_torneo = $1 ORDER BY id_cancha', [idTorneo]);
  const t = rows[0];
  delete t.foto;
  t.canchas = canchas.rows.map((f) => f.id_cancha);
  return t;
}

async function contarInscripciones(cliente, idTorneo) {
  const { rows } = await cliente.query(
    `SELECT count(*) FILTER (WHERE te.estado = ANY(${SQL_PARTICIPA}))::int AS confirmados,
            count(*) FILTER (WHERE ${SQL_OCUPA})::int AS ocupados,
            array_agg(te.id_equipo) FILTER (WHERE te.estado = ANY(${SQL_ACTIVA})) AS activos,
            array_agg(te.id_equipo) FILTER (WHERE te.estado = ANY(${SQL_PARTICIPA})) AS participantes
       FROM torneo_equipo te WHERE te.id_torneo = $1`,
    [idTorneo]
  );
  return { ...rows[0], activos: rows[0].activos || [], participantes: rows[0].participantes || [] };
}

/** Pasa entre abierto y completo según los cupos ocupados (no toca otros estados). */
async function actualizarCompleto(cliente, idTorneo) {
  const { rows: [t] } = await cliente.query('SELECT estado, cupo_max FROM torneo WHERE id = $1', [idTorneo]);
  const { ocupados } = await contarInscripciones(cliente, idTorneo);
  const nuevo = reglas.estadoPorCupos(t.estado, ocupados, t.cupo_max);
  if (nuevo !== t.estado) await cliente.query('UPDATE torneo SET estado = $2 WHERE id = $1', [idTorneo, nuevo]);
  return nuevo;
}

async function guardarCanchas(cliente, idTorneo, idsCanchas) {
  await cliente.query('DELETE FROM torneo_cancha WHERE id_torneo = $1 AND NOT (id_cancha = ANY($2::int[]))', [idTorneo, idsCanchas]);
  await cliente.query(
    'INSERT INTO torneo_cancha (id_torneo, id_cancha) SELECT $1, unnest($2::int[]) ON CONFLICT DO NOTHING',
    [idTorneo, idsCanchas]
  );
  // id_cancha queda con la primera cancha por compatibilidad con el código anterior a SA-7.
  await cliente.query('UPDATE torneo SET id_cancha = $2 WHERE id = $1', [idTorneo, idsCanchas[0] || null]);
}

/**
 * TO-001 · Crea el torneo en Borrador (no lo ven los jugadores).
 * @param {{id:number, nombre:string}} admin
 * @returns {Promise<number>} id del torneo
 */
async function crear(admin, datos, foto, patrocinadores) {
  return enTransaccion(async (cliente) => {
    const { rows } = await cliente.query(
      `INSERT INTO torneo (nombre, formato, id_modalidad, cantidad_equipos, premios, foto, foto_tipo, foto_actualizada, emparejamiento,
                           fecha_inicio, hora_inicio, estado, descripcion, reglamento, id_nivel_min, id_nivel_max, id_recinto,
                           fecha_termino, fecha_limite_inscripcion, cupo_min, cupo_max, min_jugadores, cantidad_grupos,
                           clasifican_por_grupo, precio, medios_pago, creado_por)
       VALUES ($1, $2, $3, $4, $5, $6, $7, now(), $8, $9, $10, 'borrador', $11, $12, $13, $14, $15, $16, $17, $18, $4, $19, $20, $21,
               $22, $23, (SELECT id FROM usuario WHERE id = $24))
       RETURNING id`,
      [datos.nombre, datos.formato, datos.idModalidad, datos.cupoMax, datos.premios || null, foto.datos, foto.tipo, datos.emparejamiento,
        datos.fechaInicio, datos.horaInicio, datos.descripcion, datos.reglamento, datos.idNivelMin, datos.idNivelMax, datos.idRecinto,
        datos.fechaTermino, datos.fechaLimite, datos.cupoMin, datos.minJugadores, datos.cantidadGrupos, datos.clasificanPorGrupo,
        datos.precio, datos.mediosPago, admin.id]
    );
    const idTorneo = rows[0].id;
    await guardarCanchas(cliente, idTorneo, datos.idsCanchas);
    await agregarPatrocinadores(cliente, idTorneo, patrocinadores);
    const nuevo = await bloquear(cliente, idTorneo);
    await actividad.registrar(cliente, {
      admin, seccion: 'torneos', accion: 'Crear torneo', elementoTipo: 'torneo', elementoId: idTorneo, elemento: datos.nombre,
      nuevo: { ...resumen(nuevo), patrocinadores: patrocinadores.map((p) => p.nombre) },
    });
    return idTorneo;
  });
}

/** Qué campos del formulario cambian entre la fila guardada (resumen) y los datos nuevos. */
function camposCambiados(antes, datos, foto, patrocinadoresNuevos, quitar) {
  const nuevo = {
    nombre: datos.nombre, descripcion: datos.descripcion, reglamento: datos.reglamento, premios: datos.premios || null,
    formato: datos.formato, emparejamiento: datos.emparejamiento, id_modalidad: datos.idModalidad, id_nivel_min: datos.idNivelMin,
    id_nivel_max: datos.idNivelMax, id_recinto: datos.idRecinto, canchas: datos.idsCanchas, fecha_inicio: datos.fechaInicio,
    hora_inicio: datos.horaInicio, fecha_termino: datos.fechaTermino, fecha_limite_inscripcion: datos.fechaLimite,
    cupo_min: datos.cupoMin, cupo_max: datos.cupoMax, min_jugadores: datos.minJugadores, cantidad_grupos: datos.cantidadGrupos,
    clasifican_por_grupo: datos.clasificanPorGrupo, precio: datos.precio, medios_pago: datos.mediosPago,
  };
  const actual = { ...antes, fecha_limite_inscripcion: antes.fecha_limite, canchas: antes.canchas, medios_pago: [...(antes.medios_pago || [])].sort() };
  const cambiados = Object.keys(nuevo).filter((k) => JSON.stringify(nuevo[k] ?? null) !== JSON.stringify(actual[k] ?? null));
  if (foto) cambiados.push('foto');
  if (patrocinadoresNuevos.length > 0 || quitar.length > 0) cambiados.push('patrocinadores');
  return cambiados;
}

/**
 * TO-003 · Edita un torneo. El controlador ya validó los datos y fijó los campos que el estado no deja cambiar;
 * aquí se vuelve a comprobar con la fila bloqueada (FOR UPDATE), por si cambió el estado entretanto.
 * @param {string} estadoEsperado - Estado con el que el controlador validó el formulario.
 * @returns {Promise<{resultado:'editado'|'sin-cambios'|'inexistente'|'estado'|'no-editable'|'precio-con-pagos'|'cupo-bajo-inscritos'|'cupo-reducido'|'fecha-reducida', campos?:string[], notificados?:number}>}
 */
async function editar(admin, idTorneo, estadoEsperado, datos, foto, patrocinadoresNuevos, idsPatrocinadoresQuitar) {
  return enTransaccion(async (cliente) => {
    const antes = await bloquear(cliente, idTorneo);
    if (!antes) return { resultado: 'inexistente' };
    if (antes.estado !== estadoEsperado) return { resultado: 'estado' };
    const editables = reglas.camposEditables(antes.estado);
    if (editables && editables.length === 0) return { resultado: 'no-editable' };
    const cambiados = camposCambiados(antes, datos, foto, patrocinadoresNuevos, idsPatrocinadoresQuitar);
    if (cambiados.length === 0) return { resultado: 'sin-cambios' };
    if (editables && cambiados.some((c) => !editables.includes(c))) return { resultado: 'no-editable', campos: cambiados.filter((c) => !editables.includes(c)) };

    const { ocupados, activos } = await contarInscripciones(cliente, idTorneo);
    // TO-002 c5: con un pago aprobado el precio no cambia.
    if (cambiados.includes('precio')) {
      const { rowCount } = await cliente.query(
        `SELECT 1 FROM torneo_pago p JOIN torneo_equipo te ON te.id = p.id_inscripcion WHERE te.id_torneo = $1 AND p.estado = 'aprobado' LIMIT 1`,
        [idTorneo]
      );
      if (rowCount > 0) return { resultado: 'precio-con-pagos' };
    }
    if (reglas.CON_INSCRIPCIONES.includes(antes.estado)) {
      if (datos.cupoMax < ocupados) return { resultado: 'cupo-bajo-inscritos', ocupados };
      if (datos.cupoMax < antes.cupo_max) return { resultado: 'cupo-reducido' };
      if (datos.fechaLimite < antes.fecha_limite) return { resultado: 'fecha-reducida' };
    }

    await cliente.query(
      `UPDATE torneo
          SET nombre = $2, descripcion = $3, reglamento = $4, premios = $5, formato = $6, emparejamiento = $7, id_modalidad = $8,
              id_nivel_min = $9, id_nivel_max = $10, id_recinto = $11, fecha_inicio = $12, hora_inicio = $13, fecha_termino = $14,
              fecha_limite_inscripcion = $15, cupo_min = $16, cupo_max = $17, cantidad_equipos = $17, min_jugadores = $18,
              cantidad_grupos = $19, clasifican_por_grupo = $20, precio = $21, medios_pago = $22
        WHERE id = $1`,
      [idTorneo, datos.nombre, datos.descripcion, datos.reglamento, datos.premios || null, datos.formato, datos.emparejamiento, datos.idModalidad,
        datos.idNivelMin, datos.idNivelMax, datos.idRecinto, datos.fechaInicio, datos.horaInicio, datos.fechaTermino, datos.fechaLimite,
        datos.cupoMin, datos.cupoMax, datos.minJugadores, datos.cantidadGrupos, datos.clasificanPorGrupo, datos.precio, datos.mediosPago]
    );
    if (cambiados.includes('canchas')) await guardarCanchas(cliente, idTorneo, datos.idsCanchas);
    if (foto) {
      await cliente.query('UPDATE torneo SET foto = $1, foto_tipo = $2, foto_actualizada = now() WHERE id = $3', [foto.datos, foto.tipo, idTorneo]);
    }
    if (idsPatrocinadoresQuitar.length > 0) {
      await cliente.query('DELETE FROM torneo_patrocinador WHERE id_torneo = $1 AND id = ANY($2::int[])', [idTorneo, idsPatrocinadoresQuitar]);
    }
    await agregarPatrocinadores(cliente, idTorneo, patrocinadoresNuevos);
    await actualizarCompleto(cliente, idTorneo);

    const despues = await bloquear(cliente, idTorneo);
    await actividad.registrar(cliente, {
      admin, seccion: 'torneos', accion: 'Editar torneo', elementoTipo: 'torneo', elementoId: idTorneo, elemento: despues.nombre,
      anterior: Object.fromEntries(cambiados.filter((c) => c in resumen(antes)).map((c) => [c, resumen(antes)[c]])),
      nuevo: Object.fromEntries(cambiados.map((c) => [c, c in resumen(despues) ? resumen(despues)[c] : 'actualizado'])),
    });
    // TO-003 c6: los capitanes de los equipos inscritos reciben el cambio.
    const textos = cambiados.map((c) => reglas.CAMPOS[c] || c).join(', ');
    const notificados = await notificarCapitanesEnTransaccion(cliente, activos, 'torneo',
      `El torneo "${despues.nombre}" cambió: ${textos}. Revisa los detalles.`, `/torneos/${idTorneo}`);
    return { resultado: 'editado', campos: cambiados, notificados };
  });
}

/**
 * TO-004 · Publica un borrador: pasa a Inscripciones abiertas y avisa a los capitanes de equipos cuya
 * modalidad y nivel calzan con el torneo.
 * @param {Object<string, object>} habilitadas - Pasarelas activas (pasarelaModel.habilitadas()).
 * @returns {Promise<{resultado:'publicado'|'inexistente'|'estado'|'incompleto'|'sin-medios'|'medio-inactivo'|'fecha-vencida', faltan?:string[], medios?:string[], notificados?:number}>}
 */
async function publicar(admin, idTorneo, habilitadas) {
  return enTransaccion(async (cliente) => {
    const t = await bloquear(cliente, idTorneo);
    if (!t) return { resultado: 'inexistente' };
    if (t.estado !== 'borrador') return { resultado: 'estado' };
    const faltan = [];
    const revisar = { descripcion: t.descripcion, reglamento: t.reglamento, foto: t.tiene_foto, id_modalidad: t.id_modalidad, id_nivel_min: t.id_nivel_min,
      id_nivel_max: t.id_nivel_max, id_recinto: t.id_recinto, canchas: t.canchas.length > 0, fecha_inicio: t.fecha_inicio, fecha_termino: t.fecha_termino,
      fecha_limite_inscripcion: t.fecha_limite, cupo_min: t.cupo_min, cupo_max: t.cupo_max, min_jugadores: t.min_jugadores };
    Object.entries(revisar).forEach(([campo, valor]) => { if (!valor) faltan.push(reglas.CAMPOS[campo]); });
    if (faltan.length > 0) return { resultado: 'incompleto', faltan };
    if (t.precio > 0 && t.medios_pago.length === 0) return { resultado: 'sin-medios' };
    const inactivos = t.precio > 0 ? t.medios_pago.filter((m) => !habilitadas[m]) : [];
    if (inactivos.length > 0) return { resultado: 'medio-inactivo', medios: inactivos.map((m) => reglas.MEDIOS_PAGO[m]) };
    if (reglas.inscripcionVencida(t.fecha_limite)) return { resultado: 'fecha-vencida' };

    await cliente.query(`UPDATE torneo SET estado = 'abierto', publicado_en = now() WHERE id = $1`, [idTorneo]);
    await actividad.registrar(cliente, {
      admin, seccion: 'torneos', accion: 'Publicar torneo', elementoTipo: 'torneo', elementoId: idTorneo, elemento: t.nombre,
      anterior: { estado: 'borrador' }, nuevo: { estado: 'abierto' },
    });
    // TO-004 c4: equipos activos que juegan la modalidad y cuyo nivel está dentro del rango del torneo.
    const { rows } = await cliente.query(
      `SELECT e.id FROM equipo e
         JOIN nivel ne ON ne.id = e.id_nivel
        WHERE e.activo
          AND (e.id_modalidad = $1 OR EXISTS (SELECT 1 FROM equipo_modalidad em WHERE em.id_equipo = e.id AND em.id_modalidad = $1))
          AND ne.puntaje_min BETWEEN (SELECT puntaje_min FROM nivel WHERE id = $2) AND (SELECT puntaje_min FROM nivel WHERE id = $3)`,
      [t.id_modalidad, t.id_nivel_min, t.id_nivel_max]
    );
    const precio = t.precio > 0 ? `Inscripción ${reglas.formatoCLP(t.precio)}` : 'Inscripción gratuita';
    const notificados = await notificarCapitanesEnTransaccion(cliente, rows.map((f) => f.id), 'torneo',
      `Nuevo torneo para tu equipo: "${t.nombre}". ${precio}; inscripciones hasta el ${reglas.textoFechaInicio(t.fecha_limite, null).larga}.`,
      `/torneos/${idTorneo}`);
    return { resultado: 'publicado', notificados };
  });
}

/**
 * TO-005 · Cierra las inscripciones: exige el cupo mínimo de Confirmadas, expira las Pendientes de pago
 * (liberan su cupo) y avisa a los capitanes confirmados. admin = null → cierre automático por fecha límite.
 * @returns {Promise<{resultado:'cerrado'|'inexistente'|'estado'|'faltan', faltan?:number, expiradas?:number, notificados?:number}>}
 */
async function cerrarInscripciones(admin, idTorneo) {
  return enTransaccion(async (cliente) => {
    const t = await bloquear(cliente, idTorneo);
    if (!t) return { resultado: 'inexistente' };
    if (!reglas.CON_INSCRIPCIONES.includes(t.estado)) return { resultado: 'estado' };
    const { confirmados } = await contarInscripciones(cliente, idTorneo);
    if (confirmados < t.cupo_min) return { resultado: 'faltan', faltan: t.cupo_min - confirmados, confirmados, cupoMin: t.cupo_min };

    const expiradas = await cliente.query(
      `UPDATE torneo_equipo SET estado = 'expirada', actualizada_en = now(), motivo = 'Inscripciones cerradas antes de confirmar el pago.'
        WHERE id_torneo = $1 AND estado = 'pendiente_pago' RETURNING id_equipo`,
      [idTorneo]
    );
    await cliente.query(`UPDATE torneo SET estado = 'cerrado', cerrado_en = now() WHERE id = $1`, [idTorneo]);
    await actividad.registrar(cliente, {
      admin, seccion: 'torneos', accion: admin ? 'Cerrar inscripciones' : 'Cerrar inscripciones (fecha límite)',
      elementoTipo: 'torneo', elementoId: idTorneo, elemento: t.nombre,
      anterior: { estado: t.estado }, nuevo: { estado: 'cerrado', confirmadas: confirmados, expiradas: expiradas.rowCount },
    });
    const { participantes } = await contarInscripciones(cliente, idTorneo);
    const notificados = await notificarCapitanesEnTransaccion(cliente, participantes, 'torneo',
      `Se cerraron las inscripciones del torneo "${t.nombre}". Tu equipo está confirmado: pronto se publica el fixture.`, `/torneos/${idTorneo}`);
    await notificarCapitanesEnTransaccion(cliente, expiradas.rows.map((f) => f.id_equipo), 'torneo',
      `Se cerraron las inscripciones del torneo "${t.nombre}" y tu inscripción quedó expirada porque el pago no se confirmó.`, `/torneos/${idTorneo}`);
    return { resultado: 'cerrado', expiradas: expiradas.rowCount, notificados };
  });
}

/**
 * TO-005 c4 · Tarea programada (idempotente): cierra los torneos cuya fecha límite ya pasó y que cumplen el
 * cupo mínimo. Los que no lo cumplen quedan abiertos y aparecen como alerta del panel (alertaModel).
 * @returns {Promise<{cerrados:number[], sinMinimo:number[]}>}
 */
async function cerrarVencidos() {
  const { rows } = await pool.query(
    `SELECT id FROM torneo WHERE estado IN ('abierto', 'completo') AND fecha_limite_inscripcion < (now() AT TIME ZONE 'America/Santiago')::date`
  );
  const cerrados = [];
  const sinMinimo = [];
  for (const { id } of rows) {
    const r = await cerrarInscripciones(null, id);
    if (r.resultado === 'cerrado') cerrados.push(id);
    else if (r.resultado === 'faltan') sinMinimo.push(id);
  }
  return { cerrados, sinMinimo };
}

/**
 * Elimina un torneo. Un borrador lo puede eliminar cualquier administrador; uno publicado solo el
 * Administrador principal, con motivo (se avisa a los capitanes inscritos).
 * @returns {Promise<'eliminado'|'inexistente'|'sin-permiso'|'con-pagos'>}
 */
async function eliminar(admin, idTorneo, { esPrincipal = false, motivo = null } = {}) {
  return enTransaccion(async (cliente) => {
    const t = await bloquear(cliente, idTorneo);
    if (!t) return 'inexistente';
    if (t.estado !== 'borrador' && !esPrincipal) return 'sin-permiso';
    const pagos = await cliente.query(
      'SELECT 1 FROM torneo_pago p JOIN torneo_equipo te ON te.id = p.id_inscripcion WHERE te.id_torneo = $1 LIMIT 1', [idTorneo]
    );
    if (pagos.rowCount > 0) return 'con-pagos'; // con pagos se cancela (TO-012), no se borra
    const { activos } = await contarInscripciones(cliente, idTorneo);
    await notificarCapitanesEnTransaccion(cliente, activos, 'torneo', `El torneo "${t.nombre}" fue eliminado por la administración. Motivo: ${motivo}`, '/torneos');
    await cliente.query('DELETE FROM torneo WHERE id = $1', [idTorneo]);
    await actividad.registrar(cliente, {
      admin, seccion: 'torneos', accion: 'Eliminar torneo', elementoTipo: 'torneo', elementoId: idTorneo, elemento: t.nombre,
      motivo, anterior: resumen(t),
    });
    return 'eliminado';
  });
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

/** Equipos activos que creó la cuenta, con si juegan la modalidad del torneo y si tienen una inscripción activa. */
async function equiposDelCapitan(authId, idTorneo, cliente = pool) {
  const { rows } = await cliente.query(
    `SELECT e.id, e.nombre,
            EXISTS (SELECT 1 FROM equipo_modalidad em WHERE em.id_equipo = e.id AND em.id_modalidad = t.id_modalidad)
              OR e.id_modalidad = t.id_modalidad AS juega_modalidad,
            EXISTS (SELECT 1 FROM torneo_equipo te WHERE te.id_equipo = e.id AND te.id_torneo = t.id
                       AND (te.estado = ANY(${SQL_PARTICIPA}) OR (te.estado = 'pendiente_pago' AND te.reservada_hasta > now()))) AS inscrito
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
       JOIN torneo_equipo te ON te.id_equipo = e.id AND ${SQL_OCUPA}
      WHERE u.auth_id = $1`,
    [authId]
  );
  return rows.map((f) => f.id_torneo);
}

/**
 * Torneos publicados con fecha de inicio entre dos días (ambos incluidos), para el calendario (SA-5).
 * @param {string} desde - 'AAAA-MM-DD'
 * @param {string} hasta - 'AAAA-MM-DD'
 * @param {string} authId - Marca "mio" en los que juega algún equipo de la cuenta.
 */
async function eventosCalendario(desde, hasta, authId) {
  const [{ rows }, mios] = await Promise.all([
    pool.query(
      `${SELECT_TORNEO} WHERE t.estado NOT IN ('borrador', 'cancelado') AND t.fecha_inicio BETWEEN $1::date AND $2::date
        ORDER BY t.fecha_inicio, t.hora_inicio NULLS LAST, t.nombre`,
      [desde, hasta]
    ),
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
    lugar: [t.recinto, t.comuna].filter(Boolean).join(', '),
    subtitulo: `${t.formatoTexto} (${t.modalidad})`,
    mio: mios.includes(t.id),
    url: `/torneos/${t.id}`,
  }));
}

/**
 * Inscribe un equipo del capitán en un torneo gratuito (las inscripciones con pago llegan en TO-018).
 * El torneo se bloquea (FOR UPDATE) para que dos inscripciones simultáneas no superen los cupos.
 * @returns {Promise<'inscrito'|'inexistente'|'cerrado'|'lleno'|'no-capitan'|'modalidad'|'ya-inscrito'|'con-pago'>}
 */
async function inscribir(authId, idTorneo, idEquipo) {
  return enTransaccion(async (cliente) => {
    const t = await cliente.query(
      `SELECT estado, cupo_max, precio, to_char(fecha_limite_inscripcion, 'YYYY-MM-DD') AS fecha_limite FROM torneo WHERE id = $1 FOR UPDATE`,
      [idTorneo]
    );
    if (!t.rows[0] || t.rows[0].estado === 'borrador') return 'inexistente';
    if (!reglas.CON_INSCRIPCIONES.includes(t.rows[0].estado) || reglas.inscripcionVencida(t.rows[0].fecha_limite)) return 'cerrado';
    const equipos = await equiposDelCapitan(authId, idTorneo, cliente);
    const equipo = equipos.find((e) => e.id === idEquipo);
    if (!equipo) return 'no-capitan';
    if (equipo.inscrito) return 'ya-inscrito';
    if (!equipo.juegaModalidad) return 'modalidad';
    if (t.rows[0].precio > 0) return 'con-pago';
    const { ocupados } = await contarInscripciones(cliente, idTorneo);
    if (ocupados >= t.rows[0].cupo_max) return 'lleno';
    // Un equipo cuya inscripción anterior expiró o se retiró vuelve a usar su misma fila.
    await cliente.query(
      `INSERT INTO torneo_equipo (id_torneo, id_equipo, estado, confirmada_en, id_usuario_inscribe)
       VALUES ($1, $2, 'confirmada', now(), (SELECT id FROM usuario WHERE auth_id = $3))
       ON CONFLICT (id_torneo, id_equipo) DO UPDATE
          SET estado = 'confirmada', confirmada_en = now(), inscrito_en = now(), actualizada_en = now(), motivo = NULL,
              reservada_hasta = NULL, id_usuario_inscribe = EXCLUDED.id_usuario_inscribe`,
      [idTorneo, idEquipo, authId]
    );
    await actualizarCompleto(cliente, idTorneo);
    return 'inscrito';
  });
}

/** El capitán retira a su equipo mientras hay inscripciones (torneos gratuitos; con pago: TO-024). */
async function retirar(authId, idTorneo, idEquipo) {
  return enTransaccion(async (cliente) => {
    const t = await cliente.query('SELECT estado, precio FROM torneo WHERE id = $1 FOR UPDATE', [idTorneo]);
    if (!t.rows[0] || !reglas.CON_INSCRIPCIONES.includes(t.rows[0].estado) || t.rows[0].precio > 0) return false;
    const { rowCount } = await cliente.query(
      `UPDATE torneo_equipo te SET estado = 'retirada', actualizada_en = now(), motivo = 'Retirado por su capitán.'
         FROM equipo e, usuario u
        WHERE te.id_torneo = $1 AND te.id_equipo = $2 AND te.estado = 'confirmada'
          AND e.id = te.id_equipo AND u.id = e.id_usuario_creador AND u.auth_id = $3`,
      [idTorneo, idEquipo, authId]
    );
    if (rowCount > 0) await actualizarCompleto(cliente, idTorneo);
    return rowCount > 0;
  });
}

/**
 * La administración saca a un equipo mientras hay inscripciones (con motivo, que se le notifica).
 * Solo inscripciones sin pago aprobado: las pagadas se gestionan con retiros y reembolsos (fase 4).
 * @returns {Promise<'quitado'|'estado'|'con-pago'|'inexistente'>}
 */
async function quitarEquipo(admin, idTorneo, idEquipo, motivo) {
  return enTransaccion(async (cliente) => {
    const t = await bloquear(cliente, idTorneo);
    if (!t) return 'inexistente';
    if (!reglas.CON_INSCRIPCIONES.includes(t.estado)) return 'estado';
    const { rows: [ins] } = await cliente.query(
      `SELECT te.id, te.estado, e.nombre FROM torneo_equipo te JOIN equipo e ON e.id = te.id_equipo
        WHERE te.id_torneo = $1 AND te.id_equipo = $2 AND te.estado = ANY(${SQL_ACTIVA}) FOR UPDATE OF te`,
      [idTorneo, idEquipo]
    );
    if (!ins) return 'inexistente';
    const pago = await cliente.query(`SELECT 1 FROM torneo_pago WHERE id_inscripcion = $1 AND estado = 'aprobado'`, [ins.id]);
    if (pago.rowCount > 0) return 'con-pago';
    await cliente.query(`UPDATE torneo_equipo SET estado = 'retirada', motivo = $2, actualizada_en = now() WHERE id = $1`, [ins.id, motivo]);
    await actualizarCompleto(cliente, idTorneo);
    await actividad.registrar(cliente, {
      admin, seccion: 'torneos', accion: 'Quitar equipo del torneo', elementoTipo: 'torneo', elementoId: idTorneo,
      elemento: `${t.nombre} · ${ins.nombre}`, motivo, anterior: { inscripcion: ins.estado }, nuevo: { inscripcion: 'retirada' },
    });
    await notificarCapitanesEnTransaccion(cliente, [idEquipo], 'torneo',
      `Tu equipo fue retirado del torneo "${t.nombre}" por la administración. Motivo: ${motivo}`, `/torneos/${idTorneo}`);
    return 'quitado';
  });
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
 * Genera el fixture y empieza el torneo: solo con las inscripciones cerradas. Arma el fixture (liga) o la
 * primera ronda (eliminación directa). Byes y fase de grupos llegan con TO-007 (fase 3).
 * @returns {{resultado:'empezado'|'inexistente'|'estado'|'faltan'|'byes'|'grupos', equipos?:number[]}}
 */
async function empezar(admin, idTorneo) {
  return enTransaccion(async (cliente) => {
    const t = await bloquear(cliente, idTorneo);
    if (!t) return { resultado: 'inexistente' };
    if (t.estado !== 'cerrado') return { resultado: 'estado' };
    // Orden de inscripción: con emparejamiento 'llegada' define los cruces (igual que el cuadrante previo).
    const { rows } = await cliente.query(
      `SELECT id_equipo FROM torneo_equipo WHERE id_torneo = $1 AND estado = 'confirmada' ORDER BY inscrito_en, id_equipo`, [idTorneo]
    );
    const equipos = rows.map((f) => f.id_equipo);
    if (equipos.length < t.cupo_min) return { resultado: 'faltan' };
    if (t.formato === 'grupos') return { resultado: 'grupos' };
    if (t.formato === 'relampago' && !reglas.EQUIPOS_RELAMPAGO.includes(equipos.length)) return { resultado: 'byes' };
    const partidos = t.formato === 'liga' ? reglas.fixtureLiga(equipos, t.emparejamiento) : reglas.primeraRondaLlave(equipos, t.emparejamiento);
    await insertarPartidos(cliente, idTorneo, partidos);
    await cliente.query(`UPDATE torneo SET estado = 'en_curso' WHERE id = $1`, [idTorneo]);
    await actividad.registrar(cliente, {
      admin, seccion: 'torneos', accion: 'Generar fixture', elementoTipo: 'torneo', elementoId: idTorneo, elemento: t.nombre,
      anterior: { estado: 'cerrado' }, nuevo: { estado: 'en_curso', partidos: partidos.length },
    });
    return { resultado: 'empezado', equipos };
  });
}

/**
 * Guarda el resultado de un partido. En la llave no hay empates: si los goles empatan, ganadorPenales
 * dice quién pasó (local/visita). Cuando se completa una ronda se crea la siguiente; con la final
 * (o con todos los partidos de la liga jugados) el torneo queda finalizado y se guarda el campeón.
 * @returns {'guardado'|'inexistente'|'cerrado'|'penales'|'vacio'}
 */
async function registrarResultado(admin, idTorneo, idPartido, golesLocal, golesVisita, ganadorPenales) {
  return enTransaccion(async (cliente) => {
    const t = await cliente.query('SELECT nombre, formato, estado FROM torneo WHERE id = $1 FOR UPDATE', [idTorneo]);
    if (!t.rows[0]) return 'inexistente';
    const { formato, estado } = t.rows[0];
    if (!['en_curso', 'finalizado'].includes(estado)) return 'cerrado';
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
    await actividad.registrar(cliente, {
      admin, seccion: 'torneos', accion: 'Registrar resultado', elementoTipo: 'torneo_partido', elementoId: idPartido,
      elemento: t.rows[0].nombre,
      anterior: partido.jugado ? { goles_local: partido.goles_local, goles_visita: partido.goles_visita } : null,
      nuevo: { goles_local: golesLocal, goles_visita: golesVisita, ganador: idGanador },
    });

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
        `SELECT e.id, e.nombre FROM torneo_equipo te JOIN equipo e ON e.id = te.id_equipo WHERE te.id_torneo = $1 AND te.estado = ANY(${SQL_PARTICIPA})`,
        [idTorneo]
      );
      const todos = await cliente.query('SELECT * FROM torneo_partido WHERE id_torneo = $1', [idTorneo]);
      const [primero] = reglas.tablaLiga(equipos.rows, todos.rows);
      await cliente.query(`UPDATE torneo SET estado = 'finalizado', id_campeon = $1 WHERE id = $2`, [primero ? primero.id : null, idTorneo]);
    }
    return 'guardado';
  });
}

module.exports = {
  LISTADO, listar, listarAdmin, catalogos, recintosParaTorneo, canchasDeRecinto, nivelesPorId, obtener, modalidades,
  crear, editar, publicar, cerrarInscripciones, cerrarVencidos, eliminar, obtenerFoto, obtenerLogo,
  equiposDelCapitan, idsMisTorneos, eventosCalendario, inscribir, retirar, quitarEquipo, empezar, registrarResultado,
};
