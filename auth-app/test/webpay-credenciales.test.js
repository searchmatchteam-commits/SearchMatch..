// Si las credenciales de Webpay no se pueden descifrar (falta PASARELAS_CLAVE en el servidor o no es la misma con
// la que se guardaron), pagar no debe terminar en un error 500: se avisa y no se cobra nada.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const stub = (ruta, exports) => {
  require.cache[require.resolve(path.join(__dirname, '..', ruta))] = { loaded: true, exports };
};

const llamadas = [];
const falla = async () => { throw new Error('Falta PASARELAS_CLAVE (64 caracteres hexadecimales) en el .env.'); };
stub('config/db.js', { pool: {} });
stub('models/equipoModel.js', {});
stub('models/pasarelaModel.js', { habilitadas: async () => ({ webpay: { entorno: 'pruebas' } }), credenciales: falla });
stub('models/torneoModel.js', {
  inscribir: async () => 'con-pago',
  reservarParaPago: async () => { llamadas.push('reservar'); return { resultado: 'reservado', idPago: 1, ordenCompra: 'x', monto: 1000 }; },
  pagoPorToken: async () => ({ id: 7, id_torneo: 13, estado: 'iniciado', entorno: 'pruebas' }),
  rechazarPago: async (id, motivo) => { llamadas.push(`rechazar:${id}:${motivo}`); },
});
const torneos = require('../controllers/torneoController');

function respuesta() {
  return { destino: null, redirect(url) { this.destino = url; return this; }, set() { return this; }, render() { return this; } };
}

test('Inscribir con pago: si las credenciales no se descifran, vuelve con aviso (sin 500 y sin reservar cupo)', async () => {
  llamadas.length = 0;
  const res = respuesta();
  let error = null;
  await torneos.inscribir(
    { params: { id: '13' }, body: { id_equipo: '4', acepto_reglas: 'si', medio_pago: 'webpay' }, usuario: { idAuth: 'a' } },
    res,
    (err) => { error = err; }
  );
  assert.equal(error, null);
  assert.match(res.destino, /\/torneos\/13\?aviso=sin-medio/);
  assert.deepEqual(llamadas, []);
});

test('Vuelta de Webpay: si las credenciales no se descifran, avisa el error (sin 500)', async () => {
  llamadas.length = 0;
  const res = respuesta();
  let error = null;
  await torneos.retornoWebpay({ query: {}, body: { token_ws: 'tok' } }, res, (err) => { error = err; });
  assert.equal(error, null);
  assert.match(res.destino, /\/torneos\/13\?aviso=pago-error/);
});
