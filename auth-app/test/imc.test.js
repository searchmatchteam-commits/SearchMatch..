const test = require('node:test');
const assert = require('node:assert/strict');
const { calcularIMC } = require('../config/perfilJugador');

test('IMC: peso / altura² con un decimal y categoría de la OMS', () => {
  assert.deepEqual(calcularIMC(178, 72), { valor: 22.7, texto: '22,7', categoria: 'Normal', clave: 'normal' });
  assert.equal(calcularIMC(170, 50).clave, 'bajo');
  assert.equal(calcularIMC(165, 90).clave, 'obesidad');
  assert.equal(calcularIMC(170, 50).categoria, 'Bajo peso');
  assert.equal(calcularIMC(175, 80).categoria, 'Sobrepeso');
  assert.equal(calcularIMC(165, 90).categoria, 'Obesidad');
});

test('IMC: sin altura o sin peso no hay IMC', () => {
  assert.equal(calcularIMC(null, 70), null);
  assert.equal(calcularIMC(175, 0), null);
  assert.equal(calcularIMC('', ''), null);
});
