// R2 · Protección CSRF: firma del token, middleware y que ningún formulario POST quede sin token.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

process.env.SESSION_SECRET = 'x'.repeat(40);
const csrf = require('../middlewares/csrf');

const VALOR = 'a'.repeat(43);

function peticion({ method = 'POST', ruta = '/algo', cookie = VALOR, cuerpo = {}, cabecera = null, query = {}, tipo = 'application/x-www-form-urlencoded', acepta = 'html' } = {}) {
  return {
    method,
    path: ruta,
    cookies: cookie ? { [csrf.COOKIE_CSRF]: cookie } : {},
    body: cuerpo,
    query,
    get: (h) => (h.toLowerCase() === csrf.CABECERA_CSRF ? cabecera : undefined),
    is: (t) => tipo === t,
    accepts: () => acepta,
  };
}

function respuesta() {
  const r = { locals: {}, estado: 200, cookies: {} };
  r.status = (s) => { r.estado = s; return r; };
  r.render = (vista, datos) => { r.vista = vista; r.datos = datos; return r; };
  r.json = (datos) => { r.datos = datos; return r; };
  r.cookie = (n, v) => { r.cookies[n] = v; return r; };
  return r;
}

function correr(req) {
  const res = respuesta();
  let paso = false;
  csrf.verificarCsrf(req, res, () => { paso = true; });
  return { paso, res };
}

test('R2: el token es el HMAC de la cookie y se compara en tiempo constante', () => {
  const token = csrf.firmar(VALOR);
  assert.ok(csrf.tokenValido(token, VALOR));
  assert.equal(csrf.tokenValido(token, 'b'.repeat(43)), false);
  assert.equal(csrf.tokenValido(VALOR, VALOR), false, 'mandar la cookie tal cual no sirve');
  assert.equal(csrf.tokenValido('', VALOR), false);
  assert.equal(csrf.tokenValido(token, undefined), false);
});

test('R2: prepararCsrf crea la cookie si falta y deja el token en res.locals', () => {
  const req = { cookies: {} };
  const res = respuesta();
  csrf.prepararCsrf(req, res, () => {});
  const valor = res.cookies[csrf.COOKIE_CSRF];
  assert.match(valor, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(res.locals.csrfToken, csrf.firmar(valor));
  // Con cookie válida no la cambia
  const res2 = respuesta();
  csrf.prepararCsrf({ cookies: { [csrf.COOKIE_CSRF]: valor } }, res2, () => {});
  assert.equal(res2.cookies[csrf.COOKIE_CSRF], undefined);
  assert.equal(res2.locals.csrfToken, res.locals.csrfToken);
});

test('R2: GET pasa; POST sin token o con token ajeno se rechaza con 403', () => {
  assert.ok(correr(peticion({ method: 'GET' })).paso);
  const sin = correr(peticion());
  assert.equal(sin.paso, false);
  assert.equal(sin.res.estado, 403);
  assert.equal(sin.res.vista, 'error');
  assert.equal(correr(peticion({ cuerpo: { _csrf: csrf.firmar('c'.repeat(43)) } })).paso, false);
  assert.equal(correr(peticion({ cookie: null, cuerpo: { _csrf: csrf.firmar(VALOR) } })).paso, false);
  const json = correr(peticion({ acepta: 'json' }));
  assert.equal(json.res.estado, 403);
  assert.equal(json.res.datos.ok, false);
});

test('R2: acepta el token en el cuerpo, en la cabecera (fetch) o en ?_csrf= solo si es multipart', () => {
  const token = csrf.firmar(VALOR);
  assert.ok(correr(peticion({ cuerpo: { _csrf: token } })).paso);
  assert.ok(correr(peticion({ cabecera: token, cuerpo: undefined, tipo: 'image/jpeg' })).paso);
  assert.ok(correr(peticion({ query: { _csrf: token }, cuerpo: {}, tipo: 'multipart/form-data' })).paso);
  assert.equal(correr(peticion({ query: { _csrf: token } })).paso, false, 'en la URL solo vale para multipart');
});

test('R2: los webhooks de pago quedan fuera de la validación', () => {
  assert.ok(csrf.excluida('/pagos/webhook/mercadopago'));
  assert.equal(csrf.excluida('/pagos/mercadopago'), false);
  assert.ok(correr(peticion({ ruta: '/pagos/webhook/paypal', cookie: null })).paso);
});

test('R2: todo <form method="POST"> de las vistas lleva el token CSRF', () => {
  const raiz = path.join(__dirname, '..', 'views');
  const archivos = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const p = path.join(dir, d.name);
    return d.isDirectory() ? archivos(p) : p.endsWith('.ejs') ? [p] : [];
  });
  const faltan = [];
  archivos(raiz).forEach((archivo) => {
    const texto = fs.readFileSync(archivo, 'utf8');
    // Etiqueta <form ...> completa, saltando los <% %> (pueden traer ">")
    const re = /<form\b((?:<%[\s\S]*?%>|[^>])*)>/gi;
    let m;
    while ((m = re.exec(texto))) {
      if (!/method\s*=\s*["']post["']/i.test(m[1])) continue;
      const conCampo = /^\s*(<%#[\s\S]*?%>\s*)?<input type="hidden" name="_csrf" value="<%= locals\.csrfToken %>" \/>/.test(texto.slice(re.lastIndex));
      const enUrl = /\?_csrf=<%= locals\.csrfToken %>/.test(m[1]);
      if (!conCampo && !enUrl) faltan.push(`${path.relative(raiz, archivo)}: ${m[0].slice(0, 80)}`);
    }
  });
  assert.deepEqual(faltan, []);
});
