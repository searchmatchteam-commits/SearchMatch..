// AP-025 · Listado de comentarios del panel: filtros con listas blancas y SQL parametrizado.
const test = require('node:test');
const assert = require('node:assert/strict');

const { leerListado, construirSQL } = require('../config/listados');
const { LISTADO } = require('../models/comentarioModel');

test('AP-025: filtra por estado, equipo, autor y fechas; ignora valores inválidos', () => {
  const estado = leerListado({
    estado: 'oculto', equipo: '7', autor: 'x', desde: '2026-01-01', hasta: '2026-13-01', orden: 'autor', texto: 'hola',
  }, LISTADO);
  assert.deepEqual(estado.filtros, { estado: 'oculto', equipo: 7, desde: '2026-01-01' });
  assert.equal(estado.orden, 'autor');
  const s = construirSQL(estado, LISTADO);
  assert.match(s.where, /c\.oculto\)/);
  assert.match(s.where, /c\.id_equipo = \$2/);
  assert.match(s.where, />= \$3::date/);
  assert.deepEqual(s.params, ['hola', 7, '2026-01-01']);
  assert.equal(s.where.includes('hola'), false, 'el texto va como parámetro');
});

test('AP-025: un estado desconocido no se pega en el SQL', () => {
  const estado = leerListado({ estado: "oculto' OR 1=1 --" }, LISTADO);
  assert.deepEqual(estado.filtros, {});
  assert.equal(construirSQL(estado, LISTADO).where, 'TRUE');
});
