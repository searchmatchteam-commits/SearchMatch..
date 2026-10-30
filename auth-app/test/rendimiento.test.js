const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const ejs = require('ejs');
const { cacheBreve } = require('../config/cacheBreve');

const raiz = path.join(__dirname, '..');

test('cacheBreve consulta una vez, renueva en segundo plano y no guarda los errores', async (t) => {
  t.mock.timers.enable({ apis: ['Date'] });
  let llamadas = 0;
  let falla = true;
  const leer = cacheBreve(1000, async () => {
    llamadas += 1;
    if (falla) throw new Error('caída');
    return llamadas;
  });

  await assert.rejects(leer(), /caída/);
  falla = false;
  const [a, b] = await Promise.all([leer(), leer()]);
  assert.deepEqual([a, b], [2, 2], 'dos lecturas simultáneas comparten una consulta');
  assert.equal(await leer(), 2);
  assert.equal(llamadas, 2);

  t.mock.timers.tick(1000);
  assert.equal(await leer(), 2, 'vencido entrega lo guardado sin esperar');
  await new Promise(setImmediate);
  assert.equal(llamadas, 3);
  assert.equal(await leer(), 3);
});

test('la precarga del dock es solo para jugadores con sesión', async () => {
  const pie = (usuario) => ejs.renderFile(path.join(raiz, 'views/partials/footer.ejs'), { usuario, versionAssets: 'test' });
  assert.match(await pie({ esCuentaPanel: false }), /\.dock__item\[href\]:not\(\[aria-current\]\)/);
  assert.doesNotMatch(await pie({ esCuentaPanel: true }), /speculationrules/);
  assert.doesNotMatch(await pie(null), /dock__item/);
});
