// models/adminPagosModel.js
// Panel · Pagos (/admin/pagos): pagos de inscripción a torneos, los que esperan revisión y los reembolsos.
//  - en_verificacion: se cobró pero la inscripción no se pudo confirmar (sin cupo o monto distinto).
//  - Reembolso: reembolso_solicitado → (Webpay) → reembolsado | reembolso_fallido. Se marca "solicitado"
//    antes de llamar a Transbank, así un corte a mitad queda a la vista para reintentarlo.
// Toda acción queda en el registro de actividad y se avisa al capitán.

const { pool } = require('../config/db');
const reglas = require('../config/torneos');
const actividad = require('./actividadModel');
const { notificarCapitanesEnTransaccion } = require('./notificacionModel');
const torneoModel = require('./torneoModel');

const POR_PAGINA = 30;

const ESTADOS_PAGO = {
  iniciado: 'Iniciado (sin pagar)',
  aprobado: 'Aprobado',
  rechazado: 'Rechazado',
  en_verificacion: 'En verificación',
  reembolso_solicitado: 'Reembolso en curso',
  reembolsado: 'Reembolsado',
  reembolso_fallido: 'Reembolso fallido',
};

// Filtros (chips) → estados que incluyen. "resolver": lo que necesita una acción de la administración.
const FILTROS = {
  resolver: { nombre: 'Por resolver', estados: ['en_verificacion', 'reembolso_solicitado', 'reembolso_fallido'] },
  aprobado: { nombre: 'Aprobados', estados: ['aprobado'] },
  reembolsado: { nombre: 'Reembolsados', estados: ['reembolsado'] },
  rechazado: { nombre: 'Rechazados', estados: ['rechazado', 'iniciado'] },
  todos: { nombre: 'Todos', estados: Object.keys(ESTADOS_PAGO) },
};

// Un pago aprobado se puede reembolsar mientras el torneo no haya empezado (o si se canceló).
const TORNEO_REEMBOLSABLE = ['abierto', 'completo', 'cerrado', 'cancelado'];

const SELECT = `
  SELECT p.id, p.estado, p.pasarela, p.entorno, p.monto, p.monto_reembolso, p.orden_compra, p.numero_comprobante,
         p.id_pasarela, p.motivo, p.creado_en, p.aprobado_en, p.actualizado_en, p.id_inscripcion,
         (p.comprobante->>'amount')::int AS monto_pagado, p.comprobante->'card_detail'->>'card_number' AS tarjeta,
         te.estado AS estado_inscripcion, t.id AS id_torneo, t.nombre AS torneo, t.estado AS estado_torneo,
         e.id AS id_equipo, e.nombre AS equipo
    FROM torneo_pago p
    JOIN torneo_equipo te ON te.id = p.id_inscripcion
    JOIN torneo t ON t.id = te.id_torneo
    JOIN equipo e ON e.id = te.id_equipo`;

/** Qué acciones admite un pago (las vistas muestran solo esas; el servidor las vuelve a comprobar). */
function acciones(p) {
  const conToken = p.pasarela === 'webpay' && Boolean(p.id_pasarela);
  return {
    reembolsar: conToken && (['en_verificacion', 'reembolso_fallido', 'reembolso_solicitado'].includes(p.estado)
      || (p.estado === 'aprobado' && TORNEO_REEMBOLSABLE.includes(p.estado_torneo))),
    confirmar: p.estado === 'en_verificacion' && p.monto_pagado === p.monto && reglas.CON_INSCRIPCIONES.includes(p.estado_torneo),
    marcarReembolsado: ['reembolso_fallido', 'reembolso_solicitado'].includes(p.estado),
  };
}

function aPago(f) {
  return {
    ...f,
    estadoTexto: ESTADOS_PAGO[f.estado] || f.estado,
    estadoTorneoTexto: reglas.ESTADOS[f.estado_torneo] || f.estado_torneo,
    montoTexto: reglas.formatoCLP(f.monto),
    reembolsoTexto: f.monto_reembolso === null ? null : reglas.formatoCLP(f.monto_reembolso),
    acciones: acciones(f),
  };
}

/** Escapa los comodines de ILIKE para buscar el texto tal cual. */
function patron(texto) {
  return `%${texto.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

/**
 * @param {{texto:string, filtro:string, pagina:number}} opciones
 * @returns {Promise<{pagos:object[], total:number, conteo:Object<string,number>}>}
 */
async function listar({ texto, filtro, pagina }) {
  const busqueda = texto ? patron(texto) : null;
  const condicionTexto = `($1::text IS NULL OR t.nombre ILIKE $1 OR e.nombre ILIKE $1 OR p.numero_comprobante ILIKE $1 OR p.orden_compra ILIKE $1)`;
  const [filas, conteos] = await Promise.all([
    pool.query(
      `${SELECT}
        WHERE ${condicionTexto} AND p.estado = ANY($2::text[])
        ORDER BY (p.estado IN ('en_verificacion', 'reembolso_solicitado', 'reembolso_fallido')) DESC, p.actualizado_en DESC, p.id DESC
        LIMIT $3 OFFSET $4`,
      [busqueda, FILTROS[filtro].estados, POR_PAGINA, (pagina - 1) * POR_PAGINA]
    ),
    pool.query(
      `SELECT p.estado, count(*)::int AS n FROM torneo_pago p
         JOIN torneo_equipo te ON te.id = p.id_inscripcion JOIN torneo t ON t.id = te.id_torneo JOIN equipo e ON e.id = te.id_equipo
        WHERE ${condicionTexto} GROUP BY p.estado`,
      [busqueda]
    ),
  ]);
  const porEstado = Object.fromEntries(conteos.rows.map((f) => [f.estado, f.n]));
  const conteo = Object.fromEntries(Object.entries(FILTROS).map(([clave, f]) => [clave, f.estados.reduce((s, e) => s + (porEstado[e] || 0), 0)]));
  return { pagos: filas.rows.map(aPago), total: conteo[filtro], conteo };
}

async function enTransaccion(fn) {
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    const r = await fn(cliente);
    await cliente.query('COMMIT');
    return r;
  } catch (err) {
    await cliente.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    cliente.release();
  }
}

/** Bloquea el torneo y luego el pago (mismo orden que torneoModel, para no trabarse). */
async function bloquear(cliente, idPago) {
  const { rows: [previo] } = await cliente.query(`${SELECT} WHERE p.id = $1`, [idPago]);
  if (!previo) return null;
  await cliente.query('SELECT 1 FROM torneo WHERE id = $1 FOR UPDATE', [previo.id_torneo]);
  const { rows: [p] } = await cliente.query(`${SELECT} WHERE p.id = $1 FOR UPDATE OF p`, [idPago]);
  return p ? aPago(p) : null;
}

/**
 * Paso 1 del reembolso: lo deja "en curso" (con el motivo) antes de llamar a la pasarela.
 * @returns {Promise<{resultado:'listo'|'inexistente'|'no-permitido', pago?:object}>}
 */
async function iniciarReembolso(admin, idPago, motivo) {
  return enTransaccion(async (cliente) => {
    const p = await bloquear(cliente, idPago);
    if (!p) return { resultado: 'inexistente' };
    if (!p.acciones.reembolsar) return { resultado: 'no-permitido' };
    await cliente.query(
      `UPDATE torneo_pago SET estado = 'reembolso_solicitado', motivo = $2, actualizado_en = now() WHERE id = $1`,
      [idPago, motivo]
    );
    await actividad.registrar(cliente, {
      admin, seccion: 'pagos', accion: 'Solicitar reembolso', elementoTipo: 'pago', elementoId: idPago,
      elemento: `${p.numero_comprobante || p.orden_compra} · ${p.torneo} · ${p.equipo}`, motivo,
      anterior: { estado: p.estado }, nuevo: { estado: 'reembolso_solicitado', monto: p.monto },
    });
    return { resultado: 'listo', pago: p };
  });
}

/**
 * Paso 2: resultado de la pasarela (o marca manual). Con éxito, la inscripción pasa a 'reembolsada' (libera el
 * cupo si lo ocupaba) y se avisa al capitán; si falla, queda 'reembolso_fallido' con el error.
 * @param {{ok:boolean, monto?:number, detalle:string, datos?:object, manual?:boolean}} r
 */
async function terminarReembolso(admin, idPago, r) {
  return enTransaccion(async (cliente) => {
    const p = await bloquear(cliente, idPago);
    if (!p || !['reembolso_solicitado', 'reembolso_fallido'].includes(p.estado)) return 'no-permitido';
    if (!r.ok) {
      await cliente.query(
        `UPDATE torneo_pago SET estado = 'reembolso_fallido', motivo = $2, actualizado_en = now() WHERE id = $1`,
        [idPago, `Reembolso fallido: ${r.detalle}`.slice(0, 500)]
      );
      await actividad.registrar(cliente, {
        admin, seccion: 'pagos', accion: 'Reembolso fallido', elementoTipo: 'pago', elementoId: idPago,
        elemento: `${p.numero_comprobante || p.orden_compra} · ${p.torneo} · ${p.equipo}`, motivo: r.detalle,
        anterior: { estado: p.estado }, nuevo: { estado: 'reembolso_fallido' },
      });
      return 'fallido';
    }
    const monto = r.monto ?? p.monto;
    await cliente.query(
      `UPDATE torneo_pago SET estado = 'reembolsado', monto_reembolso = $2, actualizado_en = now(),
              comprobante = CASE WHEN $3::jsonb IS NULL THEN comprobante ELSE coalesce(comprobante, '{}'::jsonb) || jsonb_build_object('reembolso', $3::jsonb) END
        WHERE id = $1`,
      [idPago, monto, r.datos ? JSON.stringify(r.datos) : null]
    );
    // La inscripción pagada deja de participar (si estaba confirmada, su cupo queda libre).
    const { rowCount } = await cliente.query(
      `UPDATE torneo_equipo SET estado = 'reembolsada', reservada_hasta = NULL, motivo = $2, actualizada_en = now()
        WHERE id = $1 AND estado IN ('confirmada', 'pendiente_pago', 'expirada', 'retiro_pendiente')`,
      [p.id_inscripcion, `Pago reembolsado: ${p.motivo || ''}`.slice(0, 500)]
    );
    if (rowCount > 0) await torneoModel.actualizarCompleto(cliente, p.id_torneo);
    await actividad.registrar(cliente, {
      admin, seccion: 'pagos', accion: r.manual ? 'Marcar como reembolsado' : 'Reembolsar pago', elementoTipo: 'pago', elementoId: idPago,
      elemento: `${p.numero_comprobante || p.orden_compra} · ${p.torneo} · ${p.equipo}`, motivo: r.manual ? r.detalle : p.motivo,
      anterior: { estado: p.estado, inscripcion: p.estado_inscripcion },
      nuevo: { estado: 'reembolsado', monto, inscripcion: rowCount > 0 ? 'reembolsada' : p.estado_inscripcion },
    });
    await notificarCapitanesEnTransaccion(cliente, [p.id_equipo], 'torneo',
      `Te reembolsamos ${reglas.formatoCLP(monto)} de la inscripción al torneo "${p.torneo}"${p.numero_comprobante ? ` (comprobante ${p.numero_comprobante})` : ''}. `
        + 'El banco puede tardar unos días hábiles en reflejarlo.',
      `/torneos/${p.id_torneo}`);
    return 'reembolsado';
  });
}

/**
 * Pago en verificación cuyo cupo volvió a estar libre: se aprueba y la inscripción queda confirmada.
 * @returns {Promise<'confirmado'|'sin-cupo'|'no-permitido'|'inexistente'>}
 */
async function confirmarInscripcion(admin, idPago) {
  return enTransaccion(async (cliente) => {
    const p = await bloquear(cliente, idPago);
    if (!p) return 'inexistente';
    if (!p.acciones.confirmar || !['pendiente_pago', 'expirada'].includes(p.estado_inscripcion)) return 'no-permitido';
    const { rows: [t] } = await cliente.query('SELECT cupo_max FROM torneo WHERE id = $1', [p.id_torneo]);
    const { ocupados } = await torneoModel.contarInscripciones(cliente, p.id_torneo);
    const propia = p.estado_inscripcion === 'pendiente_pago' ? 1 : 0;
    if (ocupados - propia >= t.cupo_max) return 'sin-cupo';
    await cliente.query(
      `UPDATE torneo_pago SET estado = 'aprobado', aprobado_en = now(), motivo = NULL, actualizado_en = now() WHERE id = $1`,
      [idPago]
    );
    await cliente.query(
      `UPDATE torneo_equipo SET estado = 'confirmada', confirmada_en = now(), reservada_hasta = NULL, motivo = NULL, actualizada_en = now()
        WHERE id = $1`,
      [p.id_inscripcion]
    );
    await torneoModel.actualizarCompleto(cliente, p.id_torneo);
    await actividad.registrar(cliente, {
      admin, seccion: 'pagos', accion: 'Confirmar inscripción pagada', elementoTipo: 'pago', elementoId: idPago,
      elemento: `${p.numero_comprobante || p.orden_compra} · ${p.torneo} · ${p.equipo}`,
      anterior: { estado: p.estado, inscripcion: p.estado_inscripcion }, nuevo: { estado: 'aprobado', inscripcion: 'confirmada' },
    });
    await notificarCapitanesEnTransaccion(cliente, [p.id_equipo], 'torneo',
      `Revisamos tu pago y tu equipo quedó inscrito en el torneo "${p.torneo}"${p.numero_comprobante ? ` (comprobante ${p.numero_comprobante})` : ''}.`,
      `/torneos/${p.id_torneo}`);
    return 'confirmado';
  });
}

module.exports = {
  POR_PAGINA, ESTADOS_PAGO, FILTROS, listar, iniciarReembolso, terminarReembolso, confirmarInscripcion,
};
