const test = require('node:test');
const assert = require('node:assert/strict');
const sharp = require('sharp');
const { comprimirImagen, comprimirOConservar } = require('../config/imagenes');

/** Imagen de prueba con ruido (como una foto real, que no se comprime casi nada en PNG). */
async function imagen(ancho, alto, { alfa = 255, formato = 'png' } = {}) {
  // Degradado con grano aleatorio (semilla fija): se parece a una foto real.
  const pixeles = Buffer.alloc(ancho * alto * 4);
  let semilla = 42;
  const ruido = () => ((semilla = (semilla * 1103515245 + 12345) % 2147483648) % 24) - 12;
  for (let y = 0; y < alto; y += 1) {
    for (let x = 0; x < ancho; x += 1) {
      const i = (y * ancho + x) * 4;
      pixeles[i] = Math.max(0, Math.min(255, (x * 255) / ancho + ruido()));
      pixeles[i + 1] = Math.max(0, Math.min(255, (y * 255) / alto + ruido()));
      pixeles[i + 2] = Math.max(0, Math.min(255, 128 + ruido()));
      pixeles[i + 3] = alfa;
    }
  }
  return sharp(pixeles, { raw: { width: ancho, height: alto, channels: 4 } })[formato]().toBuffer();
}

test('una foto PNG grande queda en JPEG, reducida al lado máximo y más liviana', async () => {
  const original = await imagen(2400, 1200);
  const r = await comprimirImagen(original, { ladoMaximo: 1600 });
  assert.equal(r.tipo, 'image/jpeg');
  const meta = await sharp(r.datos).metadata();
  assert.equal(meta.format, 'jpeg');
  assert.deepEqual([meta.width, meta.height], [1600, 800]);
  assert.ok(r.datos.length < original.length / 2, `${r.datos.length} vs ${original.length}`);
});

test('una imagen chica no se agranda', async () => {
  const r = await comprimirImagen(await imagen(300, 200), { ladoMaximo: 800 });
  const meta = await sharp(r.datos).metadata();
  assert.deepEqual([meta.width, meta.height], [300, 200]);
});

test('un logo con transparencia se conserva en PNG; uno opaco pasa a JPEG', async () => {
  const transparente = await comprimirImagen(await imagen(256, 256, { alfa: 0 }), { ladoMaximo: 512, conservarTransparencia: true });
  assert.equal(transparente.tipo, 'image/png');
  assert.equal((await sharp(transparente.datos).metadata()).hasAlpha, true);

  const opaco = await comprimirImagen(await imagen(256, 256), { ladoMaximo: 512, conservarTransparencia: true });
  assert.equal(opaco.tipo, 'image/jpeg');
});

test('las fotos con transparencia se aplanan sobre blanco (no quedan negras)', async () => {
  const r = await comprimirImagen(await imagen(50, 50, { alfa: 0 }));
  assert.equal(r.tipo, 'image/jpeg');
  const { dominant } = await sharp(r.datos).stats();
  assert.ok(dominant.r > 240 && dominant.g > 240 && dominant.b > 240);
});

test('lo que no es una imagen devuelve null y comprimirOConservar lo deja igual', async () => {
  const basura = Buffer.from('esto no es una imagen');
  assert.equal(await comprimirImagen(basura), null);
  assert.deepEqual(await comprimirOConservar(basura, 'image/png'), { datos: basura, tipo: 'image/png' });
});
