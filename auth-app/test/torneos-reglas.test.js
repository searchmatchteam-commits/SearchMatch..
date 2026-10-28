const test = require('node:test');
const assert = require('node:assert/strict');
const r = require('../config/torneos');

test('TO-001 c4: cupo mínimo ≥ 2 y máximo ≥ mínimo', () => {
  assert.deepEqual(r.erroresCupos({ formato: 'relampago', cupoMin: 2, cupoMax: 6 }), {});
  assert.ok(r.erroresCupos({ formato: 'relampago', cupoMin: 1, cupoMax: 6 }).cupo_min);
  assert.ok(r.erroresCupos({ formato: 'relampago', cupoMin: 8, cupoMax: 6 }).cupo_max);
  assert.ok(r.erroresCupos({ formato: 'liga', cupoMin: 4, cupoMax: 21 }).cupo_max);
  assert.ok(r.erroresCupos({ formato: 'liga', cupoMin: null, cupoMax: null }).cupo_min);
});

test('TO-001 c6: grupos exige cantidad de grupos y clasificados, y alcanza con el cupo mínimo', () => {
  const sin = r.erroresCupos({ formato: 'grupos', cupoMin: 8, cupoMax: 16 });
  assert.ok(sin.cantidad_grupos && sin.clasifican_por_grupo);
  assert.deepEqual(r.erroresCupos({ formato: 'grupos', cupoMin: 8, cupoMax: 16, cantidadGrupos: 2, clasificanPorGrupo: 2 }), {});
  assert.match(r.erroresCupos({ formato: 'grupos', cupoMin: 5, cupoMax: 16, cantidadGrupos: 2, clasificanPorGrupo: 2 }).cupo_min, /al menos 6/);
});

test('TO-001 c3: fecha límite no posterior al inicio y término no anterior', () => {
  assert.deepEqual(r.erroresFechas({ fechaInicio: '2026-12-10', fechaTermino: '2026-12-20', fechaLimite: '2026-12-10' }), {});
  const e = r.erroresFechas({ fechaInicio: '2026-12-10', fechaTermino: '2026-12-09', fechaLimite: '2026-12-11' });
  assert.ok(e.fecha_limite_inscripcion && e.fecha_termino);
});

test('TO-003: campos editables por estado', () => {
  assert.equal(r.camposEditables('borrador'), null);
  assert.deepEqual(r.camposEditables('abierto'), ['descripcion', 'reglamento', 'premios', 'cupo_max', 'fecha_limite_inscripcion']);
  assert.deepEqual(r.camposEditables('completo'), r.camposEditables('abierto'));
  assert.deepEqual(r.camposEditables('finalizado'), []);
  assert.deepEqual(r.camposEditables('cancelado'), []);
});

test('AP-027 c4: acciones válidas por estado', () => {
  assert.deepEqual(r.accionesTorneo('borrador'), ['ver', 'editar', 'publicar', 'eliminar']);
  assert.deepEqual(r.accionesTorneo('abierto'), ['ver', 'editar', 'cerrar']);
  assert.deepEqual(r.accionesTorneo('cerrado'), ['ver', 'editar', 'fixture']);
  assert.deepEqual(r.accionesTorneo('finalizado'), ['ver']);
});

test('TO-002: precio entero CLP, gratis con 0, rechaza negativos y decimales; USD y formato', () => {
  assert.equal(r.leerPrecio('12.000'), 12000);
  assert.equal(r.leerPrecio('15000'), 15000);
  assert.equal(r.leerPrecio('0'), 0);
  assert.equal(r.leerPrecio('-5'), null);
  assert.equal(r.leerPrecio('12000,5'), null);
  assert.equal(r.leerPrecio('12.5'), null);
  assert.equal(r.leerPrecio(''), null);
  assert.equal(r.formatoCLP(1234567), '$1.234.567');
  assert.equal(r.aUSD(15000, 950), 15.79);
  assert.equal(r.aUSD(15000, 0), null);
});

test('TO-004 c3 / TO-005 c4: fecha límite en hora de Chile (el día límite todavía se puede inscribir)', () => {
  // 28-10-2026 02:00 UTC = 27-10 23:00 en Chile (UTC-3): aún es el 27.
  assert.equal(r.hoyChile(new Date('2026-10-28T02:00:00Z')), '2026-10-27');
  assert.equal(r.inscripcionVencida('2026-10-27', '2026-10-27'), false);
  assert.equal(r.inscripcionVencida('2026-10-26', '2026-10-27'), true);
  assert.equal(r.inscripcionVencida(null, '2026-10-27'), false);
});

test('Cupos completos: abierto ↔ completo según los ocupados; otros estados no cambian', () => {
  assert.equal(r.estadoPorCupos('abierto', 8, 8), 'completo');
  assert.equal(r.estadoPorCupos('completo', 7, 8), 'abierto');
  assert.equal(r.estadoPorCupos('completo', 8, 10), 'abierto');
  assert.equal(r.estadoPorCupos('cerrado', 8, 8), 'cerrado');
  assert.equal(r.estadoPorCupos('borrador', 0, 8), 'borrador');
});

test('AP-027 c4: publicar solo en borrador y generar fixture solo con inscripciones cerradas', () => {
  ['abierto', 'completo', 'cerrado', 'en_curso', 'finalizado', 'cancelado'].forEach((e) => assert.ok(!r.accionesTorneo(e).includes('publicar')));
  ['borrador', 'abierto', 'completo', 'en_curso', 'finalizado', 'cancelado'].forEach((e) => assert.ok(!r.accionesTorneo(e).includes('fixture')));
});
