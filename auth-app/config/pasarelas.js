// config/pasarelas.js
// TO-013 · Pasarelas de pago: qué credenciales pide cada una y a qué servidor se conecta según el entorno.
// "pruebas" = integración de Transbank / credenciales de prueba de Mercado Pago / sandbox de PayPal.

const PASARELAS = {
  webpay: {
    nombre: 'Webpay Plus (Transbank)',
    campos: [
      { clave: 'codigoComercio', texto: 'Código de comercio', patron: /^\d{12}$/, ayuda: '12 dígitos. En integración: 597055555532.' },
      { clave: 'llaveSecreta', texto: 'Llave secreta (API key)', patron: /^[A-Za-z0-9]{20,}$/ },
    ],
    urls: { pruebas: 'https://webpay3gint.transbank.cl', produccion: 'https://webpay3g.transbank.cl' },
  },
  mercadopago: {
    nombre: 'Mercado Pago (Checkout Pro)',
    campos: [
      { clave: 'accessToken', texto: 'Access token', patron: /^(APP_USR|TEST)-[\w-]{20,}$/, ayuda: 'Empieza con APP_USR- o TEST-.' },
      { clave: 'publicKey', texto: 'Public key', patron: /^(APP_USR|TEST)-[\w-]{20,}$/ },
    ],
    urls: { pruebas: 'https://api.mercadopago.com', produccion: 'https://api.mercadopago.com' },
  },
  paypal: {
    nombre: 'PayPal (Orders v2)',
    campos: [
      { clave: 'clientId', texto: 'Client ID', patron: /^[\w-]{20,}$/ },
      { clave: 'secret', texto: 'Secret', patron: /^[\w-]{20,}$/ },
    ],
    urls: { pruebas: 'https://api-m.sandbox.paypal.com', produccion: 'https://api-m.paypal.com' },
  },
};

const ENTORNOS = { pruebas: 'Pruebas (integración / sandbox)', produccion: 'Producción' };

const TIPO_CAMBIO = { min: 1, max: 100000 };

/**
 * Lee las credenciales del formulario. Un campo vacío conserva el valor guardado.
 * @param {string} clave - webpay | mercadopago | paypal
 * @param {object} body
 * @param {object|null} actuales - Credenciales guardadas (descifradas) o null.
 * @returns {{credenciales:object|null, errores:Object<string,string>, cambiadas:boolean}}
 */
function leerCredenciales(clave, body, actuales) {
  const def = PASARELAS[clave];
  const credenciales = {};
  const errores = {};
  let cambiadas = false;
  def.campos.forEach((c) => {
    const nuevo = String(body[c.clave] || '').trim();
    if (nuevo) {
      cambiadas = true;
      if (!c.patron.test(nuevo)) errores[c.clave] = `${c.texto} no tiene el formato esperado.`;
      credenciales[c.clave] = nuevo;
    } else if (actuales && actuales[c.clave]) {
      credenciales[c.clave] = actuales[c.clave];
    } else {
      errores[c.clave] = `Ingresa ${c.texto.toLowerCase()}.`;
    }
  });
  return { credenciales, errores, cambiadas };
}

/** Tipo de cambio CLP por 1 USD (acepta "950" o "950,5"); null si no es un número > 0 en rango. */
function leerTipoCambio(valor) {
  const t = String(valor ?? '').trim().replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
  const n = Number(t);
  return n >= TIPO_CAMBIO.min && n <= TIPO_CAMBIO.max ? n : null;
}

module.exports = { PASARELAS, ENTORNOS, TIPO_CAMBIO, leerCredenciales, leerTipoCambio };
