// config/cifrado.js
// TO-013 · Cifrado de las credenciales de las pasarelas con AES-256-GCM.
// La clave (32 bytes en hexadecimal, 64 caracteres) vive en PASARELAS_CLAVE del .env, nunca en la base ni en
// el repositorio. Para crear una: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
// Formato guardado: "v1:<iv base64>:<tag base64>:<datos base64>" (iv de 12 bytes al azar por cada cifrado).

const crypto = require('crypto');

function clave() {
  const hex = String(process.env.PASARELAS_CLAVE || '').trim();
  return /^[0-9a-fA-F]{64}$/.test(hex) ? Buffer.from(hex, 'hex') : null;
}

/** ¿Hay una clave válida configurada? */
function disponible() {
  return clave() !== null;
}

/** Cifra un objeto (JSON). Lanza error si falta la clave. */
function cifrar(objeto) {
  const k = clave();
  if (!k) throw new Error('Falta PASARELAS_CLAVE (64 caracteres hexadecimales) en el .env.');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', k, iv);
  const datos = Buffer.concat([cipher.update(JSON.stringify(objeto), 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64'), cipher.getAuthTag().toString('base64'), datos.toString('base64')].join(':');
}

/** Descifra lo que produjo cifrar(). Lanza error si la clave no corresponde o el texto fue alterado. */
function descifrar(texto) {
  const k = clave();
  if (!k) throw new Error('Falta PASARELAS_CLAVE (64 caracteres hexadecimales) en el .env.');
  const [version, iv, tag, datos] = String(texto || '').split(':');
  if (version !== 'v1' || !iv || !tag || !datos) throw new Error('Credenciales cifradas con un formato desconocido.');
  const decipher = crypto.createDecipheriv('aes-256-gcm', k, Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  const plano = Buffer.concat([decipher.update(Buffer.from(datos, 'base64')), decipher.final()]);
  return JSON.parse(plano.toString('utf8'));
}

/** Últimos 4 caracteres para mostrar: "••••1B1C". */
function enmascarar(valor) {
  const t = String(valor || '');
  return t ? `••••${t.slice(-4)}` : '';
}

module.exports = { disponible, cifrar, descifrar, enmascarar };
