// models/pasarelaModel.js
// TO-013 · Configuración de las pasarelas de pago (tabla pasarela_config, SA-7).
// Las credenciales se guardan cifradas (config/cifrado.js) y solo se muestran sus últimos 4 caracteres.
// Una pasarela solo se puede activar después de una prueba de conexión exitosa con las credenciales actuales;
// cambiar credenciales o entorno la deja sin probar e inactiva (la base también lo exige: pasarela_activa_probada).

const { pool } = require('../config/db');
const cifrado = require('../config/cifrado');
const { PASARELAS } = require('../config/pasarelas');
const actividad = require('./actividadModel');

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

function aPasarela(f) {
  return {
    clave: f.clave,
    nombre: PASARELAS[f.clave].nombre,
    activa: f.activa,
    entorno: f.entorno,
    configurada: Boolean(f.credenciales),
    probada: Boolean(f.probada_en),
    probadaEn: f.probada_en,
    mascara: f.mascara || {},
    tipoCambio: f.tipo_cambio === null ? null : Number(f.tipo_cambio),
    actualizadaEn: f.actualizada_en,
  };
}

/** Las tres pasarelas, en el orden de config/pasarelas.js. */
async function listar() {
  const { rows } = await pool.query('SELECT * FROM pasarela_config');
  const porClave = new Map(rows.map((f) => [f.clave, aPasarela(f)]));
  return Object.keys(PASARELAS).map((clave) => porClave.get(clave)).filter(Boolean);
}

async function obtener(clave) {
  const { rows } = await pool.query('SELECT * FROM pasarela_config WHERE clave = $1', [clave]);
  return rows[0] ? aPasarela(rows[0]) : null;
}

/** Credenciales descifradas (solo para llamar a la pasarela; nunca a las vistas). null si no hay. */
async function credenciales(clave) {
  const { rows } = await pool.query('SELECT credenciales FROM pasarela_config WHERE clave = $1', [clave]);
  return rows[0] && rows[0].credenciales ? cifrado.descifrar(rows[0].credenciales) : null;
}

/** Lo que se registra en la actividad: nunca secretos, solo la máscara. */
function resumen(f) {
  return { activa: f.activa, entorno: f.entorno, credenciales: f.mascara || null, tipoCambio: f.tipo_cambio === null ? null : Number(f.tipo_cambio) };
}

/**
 * Guarda credenciales, entorno y (PayPal) tipo de cambio. Si cambian credenciales o entorno, queda sin probar e inactiva.
 * @param {{credenciales:object, cambiadas:boolean, entorno:string, tipoCambio:number|null}} datos
 * @returns {Promise<'guardada'|'guardada-sin-probar'>}
 */
async function guardar(admin, clave, datos) {
  return enTransaccion(async (cliente) => {
    const { rows: [antes] } = await cliente.query('SELECT * FROM pasarela_config WHERE clave = $1 FOR UPDATE', [clave]);
    const reinicia = datos.cambiadas || datos.entorno !== antes.entorno || !antes.credenciales;
    const mascara = Object.fromEntries(Object.entries(datos.credenciales).map(([k, v]) => [k, cifrado.enmascarar(v)]));
    const { rows: [despues] } = await cliente.query(
      `UPDATE pasarela_config
          SET credenciales = $2, mascara = $3::jsonb, entorno = $4, tipo_cambio = $5, actualizada_en = now(),
              probada_en = CASE WHEN $6 THEN NULL ELSE probada_en END,
              activa = CASE WHEN $6 THEN FALSE ELSE activa END
        WHERE clave = $1 RETURNING *`,
      [clave, datos.cambiadas || !antes.credenciales ? cifrado.cifrar(datos.credenciales) : antes.credenciales,
        JSON.stringify(mascara), datos.entorno, datos.tipoCambio, reinicia]
    );
    // PayPal activa con tipo de cambio borrado: se desactiva (TO-013 c4).
    if (clave === 'paypal' && despues.activa && !(Number(despues.tipo_cambio) > 0)) {
      await cliente.query('UPDATE pasarela_config SET activa = FALSE WHERE clave = $1', [clave]);
      despues.activa = false;
    }
    await actividad.registrar(cliente, {
      admin, seccion: 'configuracion', accion: 'Guardar pasarela de pago', elementoTipo: 'pasarela', elementoId: clave,
      elemento: PASARELAS[clave].nombre, anterior: resumen(antes), nuevo: resumen(despues),
    });
    return reinicia ? 'guardada-sin-probar' : 'guardada';
  });
}

/** Deja constancia del resultado de una prueba de conexión. Una prueba fallida deja la pasarela sin probar e inactiva. */
async function registrarPrueba(admin, clave, ok, detalle) {
  return enTransaccion(async (cliente) => {
    const { rows: [antes] } = await cliente.query('SELECT * FROM pasarela_config WHERE clave = $1 FOR UPDATE', [clave]);
    const { rows: [despues] } = await cliente.query(
      `UPDATE pasarela_config SET probada_en = CASE WHEN $2 THEN now() ELSE NULL END,
              activa = CASE WHEN $2 THEN activa ELSE FALSE END
        WHERE clave = $1 RETURNING *`,
      [clave, ok]
    );
    await actividad.registrar(cliente, {
      admin, seccion: 'configuracion', accion: ok ? 'Probar conexión (exitosa)' : 'Probar conexión (fallida)',
      elementoTipo: 'pasarela', elementoId: clave, elemento: PASARELAS[clave].nombre, motivo: detalle,
      anterior: { activa: antes.activa, probada: Boolean(antes.probada_en) }, nuevo: { activa: despues.activa, probada: ok },
    });
  });
}

/**
 * TO-013 c1, c3 y c4 · Activa o desactiva. Activar exige credenciales probadas y, en PayPal, tipo de cambio > 0.
 * Desactivar solo afecta a los pagos nuevos (los ya aprobados no se tocan).
 * @returns {Promise<'activada'|'desactivada'|'sin-probar'|'sin-tipo-cambio'|'sin-cambio'>}
 */
async function cambiarActiva(admin, clave, activa) {
  return enTransaccion(async (cliente) => {
    const { rows: [p] } = await cliente.query('SELECT * FROM pasarela_config WHERE clave = $1 FOR UPDATE', [clave]);
    if (p.activa === activa) return 'sin-cambio';
    if (activa && clave === 'paypal' && !(Number(p.tipo_cambio) > 0)) return 'sin-tipo-cambio';
    if (activa && (!p.credenciales || !p.probada_en)) return 'sin-probar';
    await cliente.query('UPDATE pasarela_config SET activa = $2, actualizada_en = now() WHERE clave = $1', [clave, activa]);
    await actividad.registrar(cliente, {
      admin, seccion: 'configuracion', accion: activa ? 'Activar pasarela' : 'Desactivar pasarela',
      elementoTipo: 'pasarela', elementoId: clave, elemento: PASARELAS[clave].nombre,
      anterior: { activa: p.activa }, nuevo: { activa },
    });
    return activa ? 'activada' : 'desactivada';
  });
}

/** TO-002 c4 · Pasarelas que se pueden ofrecer ahora (configuradas, probadas y activas). */
async function habilitadas() {
  const { rows } = await pool.query('SELECT clave, entorno, tipo_cambio FROM pasarela_config WHERE activa AND credenciales IS NOT NULL AND probada_en IS NOT NULL');
  return Object.fromEntries(rows.map((f) => [f.clave, { entorno: f.entorno, tipoCambio: f.tipo_cambio === null ? null : Number(f.tipo_cambio) }]));
}

module.exports = { listar, obtener, credenciales, guardar, registrarPrueba, cambiarActiva, habilitadas };
