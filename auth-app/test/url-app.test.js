const test = require('node:test');
const assert = require('node:assert/strict');
const { urlApp, origenPropio } = require('../config/urlApp');

const VARIABLES = ['APP_URL', 'PORT', 'VERCEL', 'VERCEL_URL', 'VERCEL_BRANCH_URL', 'VERCEL_PROJECT_PRODUCTION_URL'];

/** Corre fn con solo estas variables de entorno (las demás de la lista quedan borradas). */
function con(entorno, fn) {
  const antes = Object.fromEntries(VARIABLES.map((v) => [v, process.env[v]]));
  VARIABLES.forEach((v) => delete process.env[v]);
  Object.assign(process.env, entorno);
  try { return fn(); } finally {
    VARIABLES.forEach((v) => (antes[v] === undefined ? delete process.env[v] : (process.env[v] = antes[v])));
  }
}
const peticion = (host, protocol = 'http') => ({ protocol, get: (h) => (h === 'host' ? host : undefined) });

test('sin APP_URL: localhost en local y el dominio de producción en Vercel (nunca localhost)', () => {
  con({}, () => assert.equal(urlApp(), 'http://localhost:3000'));
  con({ VERCEL: '1', VERCEL_URL: 'searchmatch-abc123.vercel.app', VERCEL_PROJECT_PRODUCTION_URL: 'searchmatch.vercel.app' },
    () => assert.equal(urlApp(), 'https://searchmatch.vercel.app'));
  con({ APP_URL: 'https://searchmatch.cl/' }, () => assert.equal(urlApp(), 'https://searchmatch.cl'));
});

test('Google vuelve al mismo host propio (producción o despliegue de Vercel) y siempre por https en Vercel', () => {
  con({ VERCEL: '1', VERCEL_URL: 'searchmatch-abc123.vercel.app', VERCEL_PROJECT_PRODUCTION_URL: 'searchmatch.vercel.app' }, () => {
    assert.equal(origenPropio(peticion('searchmatch.vercel.app')), 'https://searchmatch.vercel.app');
    assert.equal(origenPropio(peticion('searchmatch-abc123.vercel.app')), 'https://searchmatch-abc123.vercel.app');
    assert.equal(origenPropio(peticion('sitio-ajeno.com')), null, 'un host ajeno no recibe el retorno de Google');
  });
});

test('en local, 127.0.0.1 no es propio (se reinicia desde localhost para conservar la cookie PKCE)', () => {
  con({}, () => {
    assert.equal(origenPropio(peticion('localhost:3000')), 'http://localhost:3000');
    assert.equal(origenPropio(peticion('127.0.0.1:3000')), null);
  });
});
