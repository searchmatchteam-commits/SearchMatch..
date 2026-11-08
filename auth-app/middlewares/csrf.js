// middlewares/csrf.js
// R2 · Protección CSRF para todo POST (jugador y panel), con "doble envío firmado":
//  - prepararCsrf: la cookie sm_csrf guarda un valor al azar por sesión del navegador; el token es su HMAC con
//    SESSION_SECRET. Las vistas lo ponen en un campo oculto (_csrf) y en <meta name="csrf-token"> para los fetch.
//  - verificarCsrf: en POST/PUT/PATCH/DELETE exige el token en el cuerpo (_csrf), en la cabecera X-CSRF-Token
//    o, solo en formularios multipart (el cuerpo aún no se lee), en ?_csrf=. Un sitio ajeno no puede leer la
//    cookie ni calcular el HMAC, así que no puede armar un envío válido.
//  - RUTAS_SIN_CSRF: rutas que reciben POST de terceros sin token (webhooks de las pasarelas de pago).

const crypto = require('crypto');

const COOKIE_CSRF = 'sm_csrf';
const CAMPO_CSRF = '_csrf';
const CABECERA_CSRF = 'x-csrf-token';
const METODOS_SEGUROS = ['GET', 'HEAD', 'OPTIONS'];

// Webhooks de pago (fase 2): los llama la pasarela, sin cookie ni token; validan su propia firma.
const RUTAS_SIN_CSRF = [/^\/pagos\/webhook\//];

const OPCIONES_COOKIE = {
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
  path: '/',
};

let claveTemporal = null;

/** Clave del HMAC: SESSION_SECRET o, si falta, una al azar por proceso (los formularios abiertos fallan al reiniciar). */
function clave() {
  const secreto = String(process.env.SESSION_SECRET || '').trim();
  if (secreto.length >= 32) return secreto;
  if (!claveTemporal) {
    claveTemporal = crypto.randomBytes(32).toString('hex');
    console.warn('⚠️  SESSION_SECRET falta o tiene menos de 32 caracteres: los tokens CSRF se invalidan al reiniciar el servidor.');
  }
  return claveTemporal;
}

function valorValido(valor) {
  return typeof valor === 'string' && /^[A-Za-z0-9_-]{43}$/.test(valor);
}

/** Token para un valor de la cookie. */
function firmar(valor) {
  return crypto.createHmac('sha256', clave()).update(valor).digest('base64url');
}

/** ¿El token enviado corresponde a la cookie? (comparación en tiempo constante) */
function tokenValido(token, valorCookie) {
  if (!valorValido(valorCookie) || typeof token !== 'string' || token.length === 0) return false;
  const esperado = Buffer.from(firmar(valorCookie));
  const recibido = Buffer.from(token);
  return esperado.length === recibido.length && crypto.timingSafeEqual(esperado, recibido);
}

function excluida(ruta) {
  return RUTAS_SIN_CSRF.some((patron) => patron.test(ruta));
}

function prepararCsrf(req, res, next) {
  let valor = req.cookies[COOKIE_CSRF];
  if (!valorValido(valor)) {
    valor = crypto.randomBytes(32).toString('base64url');
    res.cookie(COOKIE_CSRF, valor, OPCIONES_COOKIE);
    req.cookies[COOKIE_CSRF] = valor;
  }
  res.locals.csrfToken = firmar(valor);
  return next();
}

function tokenEnviado(req) {
  const cabecera = req.get(CABECERA_CSRF);
  if (cabecera) return cabecera;
  if (req.body && typeof req.body[CAMPO_CSRF] === 'string') return req.body[CAMPO_CSRF];
  if (req.is('multipart/form-data') && typeof req.query[CAMPO_CSRF] === 'string') return req.query[CAMPO_CSRF];
  return null;
}

function verificarCsrf(req, res, next) {
  if (METODOS_SEGUROS.includes(req.method) || excluida(req.path)) return next();
  if (tokenValido(tokenEnviado(req), req.cookies[COOKIE_CSRF])) return next();
  const mensaje = 'La página expiró por seguridad. Recárgala e inténtalo de nuevo.';
  if (req.accepts(['html', 'json']) === 'json') return res.status(403).json({ ok: false, error: mensaje, mensaje });
  return res.status(403).render('error', { titulo: 'Error', codigo: 403, mensaje, usuario: res.locals.usuario || null });
}

module.exports = {
  COOKIE_CSRF, CAMPO_CSRF, CABECERA_CSRF, RUTAS_SIN_CSRF, prepararCsrf, verificarCsrf, firmar, tokenValido, excluida,
};
