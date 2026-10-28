// models/pasarelasApi.js
// Llamadas HTTP a las pasarelas de pago (Webpay Plus REST, Mercado Pago y PayPal). Usa fetch de Node 18+:
// las tres APIs son REST simples, así que no hacen falta sus SDK (menos dependencias).
// Fase 1 (TO-013): probar la conexión. Fase 2 suma crear y confirmar pagos.

const { PASARELAS } = require('../config/pasarelas');

const TIEMPO_MAXIMO_MS = 15000;

async function llamar(url, opciones) {
  const respuesta = await fetch(url, { ...opciones, signal: AbortSignal.timeout(TIEMPO_MAXIMO_MS) });
  const texto = await respuesta.text();
  let cuerpo = null;
  try { cuerpo = texto ? JSON.parse(texto) : null; } catch { cuerpo = { texto }; }
  return { ok: respuesta.ok, status: respuesta.status, cuerpo };
}

function urlBase(clave, entorno) {
  return PASARELAS[clave].urls[entorno === 'produccion' ? 'produccion' : 'pruebas'];
}

// ---------- Webpay Plus ----------

function cabecerasWebpay(c) {
  return { 'Tbk-Api-Key-Id': c.codigoComercio, 'Tbk-Api-Key-Secret': c.llaveSecreta, 'Content-Type': 'application/json' };
}

/** Crea una transacción (monto en CLP). @returns {{ok, token?, url?, error?}} */
async function webpayCrear(c, entorno, { ordenCompra, sesion, monto, urlRetorno }) {
  const r = await llamar(`${urlBase('webpay', entorno)}/rswebpaytransaction/api/webpay/v1.2/transactions`, {
    method: 'POST',
    headers: cabecerasWebpay(c),
    body: JSON.stringify({ buy_order: ordenCompra, session_id: sesion, amount: monto, return_url: urlRetorno }),
  });
  if (r.ok && r.cuerpo && r.cuerpo.token) return { ok: true, token: r.cuerpo.token, url: r.cuerpo.url };
  return { ok: false, error: (r.cuerpo && r.cuerpo.error_message) || `HTTP ${r.status}` };
}

// ---------- Mercado Pago ----------

function cabecerasMP(c) {
  return { Authorization: `Bearer ${c.accessToken}`, 'Content-Type': 'application/json' };
}

// ---------- PayPal ----------

/** Token OAuth de PayPal. @returns {{ok, token?, error?}} */
async function paypalToken(c, entorno) {
  const r = await llamar(`${urlBase('paypal', entorno)}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${c.clientId}:${c.secret}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  if (r.ok && r.cuerpo && r.cuerpo.access_token) return { ok: true, token: r.cuerpo.access_token };
  return { ok: false, error: (r.cuerpo && (r.cuerpo.error_description || r.cuerpo.error)) || `HTTP ${r.status}` };
}

/**
 * TO-013 c1 · Prueba que las credenciales funcionan contra la pasarela real del entorno elegido.
 *  - Webpay: crea una transacción de $50 que nunca se paga (Transbank la descarta sola).
 *  - Mercado Pago: consulta la cuenta dueña del access token.
 *  - PayPal: pide un token OAuth.
 * @returns {Promise<{ok:boolean, detalle:string}>}
 */
async function probarConexion(clave, credenciales, entorno) {
  try {
    if (clave === 'webpay') {
      const r = await webpayCrear(credenciales, entorno, {
        ordenCompra: `PRUEBA${Date.now()}`.slice(0, 26), sesion: 'prueba-conexion', monto: 50, urlRetorno: 'https://example.com/retorno',
      });
      return r.ok ? { ok: true, detalle: 'Transbank aceptó las credenciales.' } : { ok: false, detalle: `Transbank rechazó las credenciales (${r.error}).` };
    }
    if (clave === 'mercadopago') {
      const r = await llamar(`${urlBase('mercadopago', entorno)}/users/me`, { headers: cabecerasMP(credenciales) });
      return r.ok ? { ok: true, detalle: `Cuenta de Mercado Pago verificada (${r.cuerpo.nickname || r.cuerpo.id}).` }
        : { ok: false, detalle: `Mercado Pago rechazó el access token (HTTP ${r.status}).` };
    }
    if (clave === 'paypal') {
      const r = await paypalToken(credenciales, entorno);
      return r.ok ? { ok: true, detalle: 'PayPal aceptó el Client ID y el Secret.' } : { ok: false, detalle: `PayPal rechazó las credenciales (${r.error}).` };
    }
    return { ok: false, detalle: 'Pasarela desconocida.' };
  } catch (err) {
    return { ok: false, detalle: `No se pudo conectar con la pasarela (${err.name === 'TimeoutError' ? 'no respondió a tiempo' : err.message}).` };
  }
}

module.exports = { llamar, urlBase, probarConexion, webpayCrear, cabecerasWebpay, cabecerasMP, paypalToken };
