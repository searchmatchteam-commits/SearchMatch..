// scripts/simular-torneo-y-partidos.js
// Datos de prueba en la base del .env (¡es la de producción!):
//  1) Inscribe en el torneo a todos los equipos activos que juegan su modalidad (hasta llenar los cupos).
//     Si el torneo cobra, cada inscripción queda con un pago SIMULADO aprobado (entorno 'pruebas',
//     comprobante {"simulado": true}): no pasa por Webpay ni cobra nada.
//  2) Crea 4 partidos entre equipos en los que NO juega el jugador indicado, con cupos publicados:
//     - Partidos 1 y 2: todas las posiciones con cupo libre → el jugador se une directo.
//     - Partidos 3 y 4: una posición con cupo libre y otra llena (ocupada por un jugador simulado)
//       → en la llena el jugador queda "pendiente" y el capitán decide.
//
// Todo va en UNA transacción. Sin --aplicar es un simulacro: muestra lo que haría y lo deshace.
//
// Uso:
//   node scripts/simular-torneo-y-partidos.js --jugador=tu@correo.cl                 (simulacro)
//   node scripts/simular-torneo-y-partidos.js --jugador=tu@correo.cl --aplicar       (guarda)
//   node scripts/simular-torneo-y-partidos.js --solo-torneo --aplicar              (solo el torneo)
//   npm run datos-prueba                                                           (todo y guarda; sin --jugador)
//   npm run partidos-prueba     (3 partidos más desde el día 6, sin torneo; jugador = JUGADOR_PRUEBA del .env)
//   npm run equipos-prueba      (4 equipos nuevos con plantel, inscritos al torneo y 4 partidos entre ellos)
//   Opcional: --torneo=ID si hay más de un torneo con inscripciones abiertas.

const { pool } = require('../config/db');
const reservaModel = require('../models/reservaModel');
const reglas = require('../config/torneos');
const { DURACION_PARTIDO_MIN } = require('../config/partidos');

const MARCA = '[Simulado] Partido de prueba para buscar jugadores.';

// --equipos-nuevos: 4 equipos con capitán y plantel (cuentas sin acceso: no tienen usuario en Supabase Auth,
// así que nadie puede iniciar sesión con ellas ni reciben correos de la plataforma).
const EQUIPOS_NUEVOS = [
  { nombre: 'Deportivo Los Leones', comuna: 'Ñuñoa', nivel: 'Intermedio', colores: ['#c8102e', '#ffffff'], plantel: [
    ['Matías', 'Fuentes', 'Mati', 'matias.fuentes.r@gmail.com', 'delantero'],
    ['Cristóbal', 'Muñoz', 'Cris', 'cristobal.munoz94@gmail.com', 'mediocampista'],
    ['Felipe', 'Araya', 'Pipe', 'felipe.araya.c@gmail.com', 'defensa'],
    ['Joaquín', 'Soto', 'Joaco', 'joaquin.soto.v@gmail.com', 'arquero'],
    ['Benjamín', 'Reyes', 'Benja', 'benjareyes.92@gmail.com', 'mediocampista'],
  ] },
  { nombre: 'Real Maipú F.C', comuna: 'Maipú', nivel: 'Intermedio', colores: ['#003da5', '#ffd100'], plantel: [
    ['Sebastián', 'Contreras', 'Seba', 'seba.contreras.m@gmail.com', 'mediocampista'],
    ['Diego', 'Morales', 'Dieguito', 'diego.morales.p@gmail.com', 'delantero'],
    ['Nicolás', 'Rojas', 'Nico', 'nicorojas.93@gmail.com', 'defensa'],
    ['Tomás', 'Espinoza', 'Tomi', 'tomas.espinoza.f@gmail.com', 'arquero'],
    ['Ignacio', 'Vargas', 'Nacho', 'ignacio.vargas.l@gmail.com', 'defensa'],
  ] },
  { nombre: 'Unión Providencia', comuna: 'Providencia', nivel: 'Intermedio', colores: ['#006341', '#ffffff'], plantel: [
    ['Vicente', 'Castillo', 'Vicho', 'vicente.castillo.a@gmail.com', 'defensa'],
    ['Agustín', 'Pérez', 'Agus', 'agustin.perez.s@gmail.com', 'mediocampista'],
    ['Martín', 'Silva', 'Tincho', 'martin.silva.h@gmail.com', 'delantero'],
    ['Lucas', 'Gutiérrez', 'Lucho', 'lucas.gutierrez95@gmail.com', 'arquero'],
    ['Francisco', 'Torres', 'Pancho', 'pancho.torres.b@gmail.com', 'mediocampista'],
  ] },
  { nombre: 'Atlético San Joaquín', comuna: 'San Joaquín', nivel: 'Intermedio', colores: ['#000000', '#e30613'], plantel: [
    ['Gonzalo', 'Herrera', 'Gonza', 'gonzalo.herrera.d@gmail.com', 'delantero'],
    ['Maximiliano', 'Díaz', 'Maxi', 'maxi.diaz.o@gmail.com', 'mediocampista'],
    ['Rodrigo', 'Navarro', 'Rorro', 'rodrigo.navarro.g@gmail.com', 'defensa'],
    ['Javier', 'Sepúlveda', 'Javi', 'javier.sepulveda.t@gmail.com', 'arquero'],
    ['Andrés', 'Carrasco', 'Andy', 'andres.carrasco.e@gmail.com', 'defensa'],
  ] },
];

// Estadísticas de la carta: estables (salen del índice) entre 58 y 84
const valorStat = (i, j) => 58 + ((i * 7 + j * 11) % 27);

async function crearEquiposNuevos(c, idModalidadTorneo) {
  const existentes = await c.query('SELECT nombre FROM equipo WHERE lower(nombre) = ANY($1::text[])',
    [EQUIPOS_NUEVOS.map((e) => e.nombre.toLowerCase())]);
  if (existentes.rowCount > 0) {
    throw new Error(`Ya existen: ${existentes.rows.map((f) => f.nombre).join(', ')}. No se crean de nuevo.`);
  }
  const { rows: [rolJugador] } = await c.query("SELECT id FROM rol_aplicacion WHERE lower(nombre) = 'jugador'");
  const { rows: rolesEquipo } = await c.query('SELECT id, lower(nombre) AS nombre FROM rol_equipo');
  const rolCapitan = rolesEquipo.find((r) => r.nombre.startsWith('capit')).id;
  const rolIntegrante = (rolesEquipo.find((r) => r.nombre === 'integrante') || rolesEquipo.find((r) => !r.nombre.startsWith('capit'))).id;
  const { rows: posiciones } = await c.query('SELECT id, lower(nombre) AS nombre FROM posicion');
  const idPosicion = (clave) => (posiciones.find((p) => (clave === 'arquero' ? ['arquero', 'portero'] : [clave]).includes(p.nombre)) || posiciones[0]).id;
  const statsCampo = ['stat_ritmo', 'stat_tiro', 'stat_pase', 'stat_regate', 'stat_defensa', 'stat_fisico'];
  const statsPortero = ['stat_estirada', 'stat_manejo', 'stat_saque', 'stat_reflejos', 'stat_velocidad', 'stat_colocacion'];

  console.log('\n🆕 Equipos nuevos:');
  const ids = [];
  for (const [i, e] of EQUIPOS_NUEVOS.entries()) {
    const { rows: [comuna] } = await c.query('SELECT id, nombre FROM comunas WHERE lower(nombre) = lower($1) LIMIT 1', [e.comuna]);
    const { rows: [nivel] } = await c.query('SELECT id, puntaje_min FROM nivel WHERE lower(nombre) = lower($1)', [e.nivel]);
    if (!comuna || !nivel) throw new Error(`Falta la comuna ${e.comuna} o el nivel ${e.nivel} en los catálogos.`);

    const jugadores = [];
    for (const [j, [nombre, apellido, apodo, correo, posicion]] of e.plantel.entries()) {
      // usuario.auth_id apunta a auth.users: se crea el usuario de Supabase Auth SIN contraseña
      // (nadie puede iniciar sesión con él) y con el correo sin confirmar (Supabase no le escribe).
      const { rows: [auth] } = await c.query(
        `INSERT INTO auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
         VALUES (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', $1,
                 '{"provider": "email", "providers": ["email"]}'::jsonb, jsonb_build_object('datos_prueba', true), now(), now())
         RETURNING id`,
        [correo]
      );
      const { rows: [u] } = await c.query(
        `INSERT INTO usuario (auth_id, correo, telefono, id_rol_aplicacion, activo) VALUES ($4, $1, $2, $3, TRUE) RETURNING id`,
        [correo, `+5699${String(1000000 + i * 97531 + j * 12347).slice(-7)}`, rolJugador.id, auth.id]
      );
      const stats = posicion === 'arquero' ? statsPortero : statsCampo;
      const { rows: [jug] } = await c.query(
        `INSERT INTO jugador (nombre_apodo, apellido, apodo, fecha_nacimiento, altura, peso, id_usuario, perfil_completo, ${stats.join(', ')})
         VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE, ${stats.map((_, k) => `$${k + 8}`).join(', ')}) RETURNING id`,
        [nombre, apellido, apodo, `${1990 + ((i * 5 + j * 3) % 12)}-0${1 + ((i + j) % 9)}-1${(i + j) % 9}`,
          170 + ((i * 3 + j * 4) % 18), 66 + ((i * 4 + j * 5) % 18), u.id, ...stats.map((_, k) => valorStat(i * 5 + j, k))]
      );
      await c.query('INSERT INTO jugador_posicion (id_jugador, id_posicion) VALUES ($1, $2)', [jug.id, idPosicion(posicion)]);
      jugadores.push({ idUsuario: u.id, idJugador: jug.id, correo });
    }

    const capitan = jugadores[0];
    const { rows: [eq] } = await c.query(
      `INSERT INTO equipo (nombre, zona, correo_contacto, id_modalidad, id_nivel, id_usuario_creador, puntaje_nivel, id_comuna,
                           color_primario, color_secundario, camiseta_local, camiseta_visita)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $9, $10) RETURNING id`,
      [e.nombre, comuna.nombre, capitan.correo, idModalidadTorneo, nivel.id, capitan.idUsuario, nivel.puntaje_min + 40 * i, comuna.id,
        e.colores[0], e.colores[1]]
    );
    await c.query('INSERT INTO equipo_modalidad (id_equipo, id_modalidad) VALUES ($1, $2) ON CONFLICT DO NOTHING', [eq.id, idModalidadTorneo]);
    for (const [j, jug] of jugadores.entries()) {
      await c.query('INSERT INTO equipo_jugador (id_jugador, id_equipo, id_rol_equipo) VALUES ($1, $2, $3)',
        [jug.idJugador, eq.id, j === 0 ? rolCapitan : rolIntegrante]);
    }
    ids.push(eq.id);
    console.log(`   ✅ ${e.nombre} (${comuna.nombre}) · capitán ${e.plantel[0][0]} ${e.plantel[0][1]} <${capitan.correo}> · ${jugadores.length} jugadores`);
  }
  return ids;
}
const HORAS = ['19:00', '20:00', '18:00', '21:00', '17:00'];

const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const [k, ...v] = a.replace(/^--/, '').split('=');
  return [k, v.length ? v.join('=') : true];
}));
const APLICAR = args.aplicar === true;
// Cuenta del jugador que va a postular: --jugador o JUGADOR_PRUEBA en .env (no se versiona)
if (!args.jugador && process.env.JUGADOR_PRUEBA) args.jugador = process.env.JUGADOR_PRUEBA;
const DESDE_DIA = Number(args['desde-dia']) || 2;
const CANTIDAD_PARTIDOS = Number(args.cantidad) || 4;

const SQL_PARTICIPA = `ARRAY[${reglas.INSCRIPCION_PARTICIPA.map((e) => `'${e}'`).join(', ')}]::text[]`;
const SQL_OCUPA = `(te.estado = ANY(${SQL_PARTICIPA}) OR (te.estado = 'pendiente_pago' AND te.reservada_hasta > now()))`;

function sumarMinutos(hora, minutos) {
  const [h, m] = hora.split(':').map(Number);
  const total = h * 60 + m + minutos;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function fechaEnDias(dias) {
  const d = new Date(Date.now() + dias * 86400000);
  return d.toLocaleDateString('en-CA', { timeZone: 'America/Santiago' }); // YYYY-MM-DD
}

// ---------------------------------------------------------------- 1) Torneo
async function inscribirTodos(c) {
  const { rows: abiertos } = await c.query(
    `SELECT id, nombre, estado, cupo_max, precio, medios_pago, id_modalidad,
            to_char(fecha_limite_inscripcion, 'YYYY-MM-DD') AS fecha_limite
       FROM torneo WHERE estado = ANY($1::text[]) ${args.torneo ? 'AND id = $2' : ''} ORDER BY id`,
    args.torneo ? [reglas.CON_INSCRIPCIONES, Number(args.torneo)] : [reglas.CON_INSCRIPCIONES]
  );
  if (abiertos.length === 0) {
    console.log('⚠️  Torneo: no hay ningún torneo con inscripciones abiertas' + (args.torneo ? ` con id ${args.torneo}.` : '.'));
    return;
  }
  if (abiertos.length > 1) {
    console.log('⚠️  Torneo: hay varios con inscripciones abiertas; repite con --torneo=ID:');
    abiertos.forEach((t) => console.log(`     ${t.id} · ${t.nombre} (${t.estado})`));
    return;
  }
  const t = abiertos[0];
  await c.query('SELECT 1 FROM torneo WHERE id = $1 FOR UPDATE', [t.id]);
  if (reglas.inscripcionVencida(t.fecha_limite)) {
    console.log(`⚠️  La fecha límite de inscripción de "${t.nombre}" (${t.fecha_limite}) ya pasó; se inscribe igual.`);
  }

  const { rows: [{ ocupados }] } = await c.query(
    `SELECT count(*)::int AS ocupados FROM torneo_equipo te WHERE te.id_torneo = $1 AND ${SQL_OCUPA}`, [t.id]);
  const { rows: candidatos } = await c.query(
    `SELECT e.id, e.nombre, e.id_usuario_creador,
            (EXISTS (SELECT 1 FROM equipo_modalidad em WHERE em.id_equipo = e.id AND em.id_modalidad = $2)
               OR e.id_modalidad = $2) AS juega
       FROM equipo e
      WHERE e.activo
        AND NOT EXISTS (SELECT 1 FROM torneo_equipo te WHERE te.id_torneo = $1 AND te.id_equipo = e.id AND ${SQL_OCUPA})
      ORDER BY e.id`,
    [t.id, t.id_modalidad]
  );
  const sinModalidad = candidatos.filter((e) => !e.juega);
  const libres = Math.max(t.cupo_max - ocupados, 0);
  // Todos los equipos creados (pedido explícito), aunque no jueguen la modalidad del torneo
  const aInscribir = candidatos.slice(0, libres);
  const sinCupo = candidatos.slice(libres);
  const pasarela = (t.medios_pago || [])[0] || 'webpay';

  console.log(`\n🏆 Torneo "${t.nombre}" (id ${t.id}) · ${ocupados}/${t.cupo_max} cupos ocupados · precio ${t.precio > 0 ? `$${t.precio} (pago simulado por ${pasarela})` : 'gratis'}`);
  for (const e of aInscribir) {
    const { rows: [ins] } = await c.query(
      `INSERT INTO torneo_equipo (id_torneo, id_equipo, estado, confirmada_en, id_usuario_inscribe)
       VALUES ($1, $2, 'confirmada', now(), $3)
       ON CONFLICT (id_torneo, id_equipo) DO UPDATE
          SET estado = 'confirmada', confirmada_en = now(), inscrito_en = now(), actualizada_en = now(), motivo = NULL,
              reservada_hasta = NULL, id_usuario_inscribe = EXCLUDED.id_usuario_inscribe
       RETURNING id`,
      [t.id, e.id, e.id_usuario_creador]
    );
    if (t.precio > 0) {
      const orden = `SIM${t.id}-${ins.id}-${Date.now().toString(36)}`.slice(0, 26);
      const { rows: [pago] } = await c.query(
        `INSERT INTO torneo_pago (id_inscripcion, pasarela, entorno, estado, monto, orden_compra, id_transaccion, comprobante, aprobado_en, motivo)
         VALUES ($1, $2, 'pruebas', 'aprobado', $3, $4, 'SIMULADO', '{"simulado": true}'::jsonb, now(), 'Pago simulado (datos de prueba).')
         RETURNING id`,
        [ins.id, pasarela, t.precio, orden]
      );
      await c.query('UPDATE torneo_pago SET numero_comprobante = $2 WHERE id = $1', [pago.id, `SM-${String(pago.id).padStart(8, '0')}`]);
    }
    console.log(`   ✅ ${e.nombre}`);
  }
  if (aInscribir.length === 0) console.log('   (no quedaban equipos por inscribir)');
  sinCupo.forEach((e) => console.log(`   ⏭️  ${e.nombre}: ya no hay cupos`));
  sinModalidad.filter((e) => aInscribir.includes(e))
    .forEach((e) => console.log(`   ℹ️  ${e.nombre} quedó inscrito aunque no juega la modalidad del torneo`));

  const { rows: [{ total }] } = await c.query(
    `SELECT count(*)::int AS total FROM torneo_equipo te WHERE te.id_torneo = $1 AND ${SQL_OCUPA}`, [t.id]);
  const nuevo = reglas.estadoPorCupos(t.estado, total, t.cupo_max);
  if (nuevo !== t.estado) await c.query('UPDATE torneo SET estado = $2 WHERE id = $1', [t.id, nuevo]);
  console.log(`   → ${total}/${t.cupo_max} cupos ocupados; estado: ${nuevo}`);
}

// ---------------------------------------------------------------- 2) Partidos que buscan jugadores
async function crearPartidos(c, soloEquipos = null) {
  // Sin --jugador no se excluye a nadie (quien juegue en uno de los dos equipos no verá ese partido)
  let yo = { id_usuario: 0, id_jugador: 0 };
  if (args.jugador) {
    const { rows } = await c.query(
      `SELECT u.id AS id_usuario, j.id AS id_jugador FROM usuario u LEFT JOIN jugador j ON j.id_usuario = u.id
        WHERE lower(u.correo) = lower($1)`,
      [String(args.jugador)]
    );
    if (!rows[0]) { console.log(`\n⚠️  Partidos: no existe una cuenta con el correo ${args.jugador}.`); return; }
    yo = rows[0];
    if (!yo.id_jugador) console.log('\n⚠️  Esa cuenta aún no tiene carta de jugador: créala para poder postular.');
  }

  // Pares de equipos activos de distinto capitán, con una modalidad en común, sin el jugador en ninguno
  const { rows: pares } = await c.query(
    `WITH libres AS (
       SELECT e.* FROM equipo e
        WHERE e.activo AND e.id_usuario_creador <> $1
          AND NOT EXISTS (SELECT 1 FROM equipo_jugador ej WHERE ej.id_equipo = e.id AND ej.id_jugador = $2))
     SELECT a.id AS id_a, a.nombre AS a, a.id_usuario_creador AS capitan_a, b.id AS id_b, b.nombre AS b,
            (SELECT m.id FROM equipo_modalidad x JOIN equipo_modalidad y ON y.id_modalidad = x.id_modalidad AND y.id_equipo = b.id
               JOIN modalidad m ON m.id = x.id_modalidad
              WHERE x.id_equipo = a.id
                AND EXISTS (SELECT 1 FROM cancha ca JOIN recinto_deportivo rd ON rd.id = ca.id_recinto_deportivo
                             WHERE ca.id_modalidad = m.id AND ca.activo AND rd.activo)
              ORDER BY m.cantidad_de_jugadores LIMIT 1) AS id_modalidad
       FROM libres a JOIN libres b ON b.id > a.id AND b.id_usuario_creador <> a.id_usuario_creador
      WHERE $3::int[] IS NULL OR (a.id = ANY($3::int[]) AND b.id = ANY($3::int[]))
      ORDER BY a.id, b.id`,
    [yo.id_usuario, yo.id_jugador || 0, soloEquipos]
  );
  const validos = pares.filter((p) => p.id_modalidad);
  // Primero pares que no repiten equipos; si no alcanzan, se repiten
  const elegidos = [];
  const usados = new Set();
  for (const p of validos) {
    if (elegidos.length < CANTIDAD_PARTIDOS && !usados.has(p.id_a) && !usados.has(p.id_b)) {
      elegidos.push(p); usados.add(p.id_a); usados.add(p.id_b);
    }
  }
  // Luego, los pares cuyos equipos llevan menos partidos (así se reparten entre todos)
  const veces = (id) => elegidos.filter((e) => e.id_a === id || e.id_b === id).length;
  while (elegidos.length < CANTIDAD_PARTIDOS) {
    const resto = validos.filter((p) => !elegidos.includes(p));
    if (resto.length === 0) break;
    resto.sort((x, y) => (veces(x.id_a) + veces(x.id_b)) - (veces(y.id_a) + veces(y.id_b)));
    elegidos.push(resto[0]);
  }
  if (elegidos.length === 0) { console.log('\n⚠️  Partidos: no hay dos equipos (sin ti) con una modalidad y una cancha en común.'); return; }

  const { rows: posiciones } = await c.query('SELECT id, nombre FROM posicion ORDER BY id');
  const pos = (nombre) => posiciones.find((p) => p.nombre.toLowerCase().startsWith(nombre)) || posiciones[0];
  const { rows: [{ id: aceptado }] } = await c.query("SELECT id FROM estado_desafio WHERE lower(nombre) = 'aceptado'");

  console.log('\n⚽ Partidos que buscan jugadores:');
  for (let i = 0; i < elegidos.length; i += 1) {
    const p = elegidos[i];
    const { rows: canchas } = await c.query(
      `SELECT ca.id, ca.nombre FROM cancha ca JOIN recinto_deportivo rd ON rd.id = ca.id_recinto_deportivo
        WHERE ca.id_modalidad = $1 AND ca.activo AND rd.activo ORDER BY ca.id LIMIT 5`,
      [p.id_modalidad]
    );
    const { rows: [desafio] } = await c.query(
      `INSERT INTO desafio (id_equipo_desafiante, id_equipo_desafiado, id_estado_desafio, mensaje, id_modalidad, fecha_respuesta)
       VALUES ($1, $2, $3, $4, $5, now()) RETURNING id`,
      [p.id_a, p.id_b, aceptado, MARCA, p.id_modalidad]
    );

    // Primer día y hora con cancha libre (un partido por día para no cruzar equipos)
    let creado = null;
    for (let dia = DESDE_DIA + i; dia < 30 && !creado; dia += CANTIDAD_PARTIDOS) {
      const fecha = fechaEnDias(dia);
      for (const hora of HORAS) {
        if (creado) break;
        for (const cancha of canchas) {
          await c.query('SAVEPOINT intento');
          const { rows: [partido] } = await c.query(
            `INSERT INTO partido (hora, fecha, id_modalidad, id_desafio, id_cancha) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
            [hora, fecha, p.id_modalidad, desafio.id, cancha.id]
          );
          const reserva = await reservaModel.insertarReserva(c, {
            idCancha: cancha.id, idUsuario: p.capitan_a, fecha, inicio: hora, fin: sumarMinutos(hora, DURACION_PARTIDO_MIN), idPartido: partido.id,
          });
          if (reserva.resultado === 'creada') {
            await c.query('RELEASE SAVEPOINT intento');
            creado = { id: partido.id, fecha, hora, cancha: cancha.nombre };
            break;
          }
          await c.query('ROLLBACK TO SAVEPOINT intento');
        }
      }
    }
    if (!creado) { console.log(`   ⚠️  ${p.a} vs ${p.b}: ninguna cancha libre en los próximos 30 días`); continue; }
    await c.query('INSERT INTO participacion (es_desafiante, id_equipo, id_partido) VALUES (TRUE, $1, $3), (FALSE, $2, $3)',
      [p.id_a, p.id_b, creado.id]);

    // Cupos del equipo desafiante
    const conLleno = i >= 2;
    const cupos = conLleno
      ? [[pos('defens').id, 2], [pos('delant').id, 1]]
      : [[pos('mediocamp').id, 2], [pos('delant').id, 1]];
    for (const [idPosicion, n] of cupos) {
      await c.query('INSERT INTO partido_cupo (id_partido, id_equipo, id_posicion, cupos) VALUES ($1, $2, $3, $4)',
        [creado.id, p.id_a, idPosicion, n]);
    }
    let detalle = cupos.map(([id, n]) => `${posiciones.find((x) => x.id === id).nombre} ×${n}`).join(', ');
    if (conLleno) {
      // La posición de 1 cupo queda llena con un jugador simulado (otro jugador ajeno a los dos equipos)
      const { rows: [relleno] } = await c.query(
        `SELECT j.id, coalesce(nullif(j.apodo, ''), j.nombre_apodo) AS nombre FROM jugador j
          WHERE j.id <> $1 AND j.id_usuario <> $2
            AND NOT EXISTS (SELECT 1 FROM equipo_jugador ej WHERE ej.id_jugador = j.id AND ej.id_equipo IN ($3, $4))
            AND NOT EXISTS (SELECT 1 FROM equipo e WHERE e.id IN ($3, $4) AND e.id_usuario_creador = j.id_usuario)
          -- Con equipos nuevos, el relleno sale de sus planteles (cuentas de prueba, no de personas reales)
          ORDER BY ($5::int[] IS NOT NULL AND EXISTS (SELECT 1 FROM equipo_jugador ej WHERE ej.id_jugador = j.id AND ej.id_equipo = ANY($5::int[]))) DESC, j.id
          LIMIT 1`,
        [yo.id_jugador || 0, yo.id_usuario, p.id_a, p.id_b, soloEquipos]
      );
      if (relleno) {
        await c.query(
          "INSERT INTO partido_postulacion (id_partido, id_equipo, id_posicion, id_jugador, estado) VALUES ($1, $2, $3, $4, 'aceptada')",
          [creado.id, p.id_a, cupos[1][0], relleno.id]
        );
        detalle += ` (${posiciones.find((x) => x.id === cupos[1][0]).nombre} lleno con ${relleno.nombre}: ahí quedarías pendiente)`;
      }
    }
    console.log(`   ✅ Partido ${creado.id}: ${p.a} vs ${p.b} · ${creado.fecha} ${creado.hora} · ${creado.cancha} · ${p.a} busca ${detalle}`);
  }
}

async function main() {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    let nuevos = null;
    if (args['equipos-nuevos']) {
      const { rows: [t] } = await c.query(
        `SELECT id_modalidad FROM torneo WHERE estado = ANY($1::text[]) AND ($2::int IS NULL OR id = $2) ORDER BY id LIMIT 1`,
        [reglas.CON_INSCRIPCIONES, args.torneo ? Number(args.torneo) : null]
      );
      if (!t) throw new Error('No hay un torneo con inscripciones abiertas para elegir la modalidad de los equipos.');
      nuevos = await crearEquiposNuevos(c, t.id_modalidad);
    }
    if (!args['solo-partidos']) await inscribirTodos(c);
    if (!args['solo-torneo']) await crearPartidos(c, nuevos);
    if (APLICAR) {
      await c.query('COMMIT');
      console.log('\n💾 Guardado.');
    } else {
      await c.query('ROLLBACK');
      console.log('\n🧪 Simulacro: no se guardó nada. Repite con --aplicar para guardarlo.');
    }
  } catch (err) {
    await c.query('ROLLBACK').catch(() => {});
    console.error('\n❌ Falló y se deshizo todo:', err.code || '', err.message);
    process.exitCode = 1;
  } finally {
    c.release();
    await pool.end();
  }
}

main();
