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
//   Opcional: --torneo=ID si hay más de un torneo con inscripciones abiertas.

const { pool } = require('../config/db');
const reservaModel = require('../models/reservaModel');
const reglas = require('../config/torneos');
const { DURACION_PARTIDO_MIN } = require('../config/partidos');

const MARCA = '[Simulado] Partido de prueba para buscar jugadores.';
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
async function crearPartidos(c) {
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
      ORDER BY a.id, b.id`,
    [yo.id_usuario, yo.id_jugador || 0]
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
  for (const p of validos) if (elegidos.length < CANTIDAD_PARTIDOS && !elegidos.includes(p)) elegidos.push(p);
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
          ORDER BY j.id LIMIT 1`,
        [yo.id_jugador || 0, yo.id_usuario, p.id_a, p.id_b]
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
    if (!args['solo-partidos']) await inscribirTodos(c);
    if (!args['solo-torneo']) await crearPartidos(c);
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
