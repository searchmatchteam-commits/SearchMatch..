const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const ejs = require('ejs');
const {
  PESOS, ESTADISTICAS, ESTADISTICAS_PORTERO, calcularMedia, cartasDe, statsDeFila, STAT_INICIAL,
} = require('../config/perfilJugador');
const { validarPerfilJugador, validarEdicionPerfil } = require('../middlewares/validators');

const vistas = path.join(__dirname, '../views');
const stats = (valores) => ({ ...Object.fromEntries([...ESTADISTICAS, ...ESTADISTICAS_PORTERO].map(({ clave }) => [clave, 50])), ...valores });

test('los pesos de cada posición suman 1 y sus estadísticas clave pesan más que un promedio simple', () => {
  Object.entries(PESOS).forEach(([posicion, pesos]) => {
    assert.equal(Math.round(Object.values(pesos).reduce((a, b) => a + b, 0) * 1000), 1000, posicion);
    assert.ok(Math.max(...Object.values(pesos)) > 1 / 6, posicion);
  });
  assert.deepEqual(Object.keys(PESOS.arquero).sort(), ESTADISTICAS_PORTERO.map((s) => s.clave).sort(), 'el portero usa sus propias stats');
});

test('la media depende de la posición: un buen tirador vale más de delantero que de defensa', () => {
  const tirador = stats({ tiro: 90, ritmo: 85, regate: 80, defensa: 30, fisico: 50, pase: 60 });
  assert.equal(calcularMedia(tirador), 66, 'sin posición: promedio simple de campo');
  assert.ok(calcularMedia(tirador, 'delantero') > calcularMedia(tirador), 'sus stats clave suben la media');
  assert.ok(calcularMedia(tirador, 'defensa') < calcularMedia(tirador), 'en defensa pesa su mala defensa');
  const arquero = stats({ reflejos: 90, estirada: 88, colocacion: 80, manejo: 80, saque: 40, velocidad: 40 });
  assert.equal(calcularMedia(arquero, 'arquero'), 81);
});

test('cartas: la principal según la primera posición; portero alternativo (o principal con campo) da una segunda', () => {
  const s = stats({});
  assert.equal(cartasDe(['delantero'], s).length, 1);
  assert.equal(cartasDe(['delantero', 'mediocampista'], s).length, 1, 'solo posiciones de campo: una carta');

  const [principal, portero] = cartasDe(['delantero', 'arquero'], s);
  assert.equal(principal.posicion.sigla, 'DEL');
  assert.equal(principal.principal, true);
  assert.deepEqual(principal.estadisticas.map((e) => e.sigla), ['RIT', 'TIR', 'PAS', 'REG', 'DEF', 'FIS']);
  assert.equal(portero.posicion.sigla, 'POR');
  assert.deepEqual(portero.estadisticas.map((e) => e.sigla), ['EST', 'MAN', 'SAQ', 'REF', 'VEL', 'COL']);
  assert.ok(portero.estadisticas.find((e) => e.clave === 'reflejos').destacada);
  assert.ok(!portero.estadisticas.find((e) => e.clave === 'saque').destacada);

  const [p1, p2] = cartasDe(['arquero', 'defensa', 'delantero'], s);
  assert.equal(p1.posicion.sigla, 'POR');
  assert.equal(p2.posicion.sigla, 'DEF', 'portero de principal: la segunda es su primera de campo');
});

test('stats de una fila: sin las de campo no hay carta; las de portero sin editar valen el inicial', () => {
  const fila = Object.fromEntries(ESTADISTICAS.map(({ columna }) => [columna, 70]));
  const s = statsDeFila({ ...fila, stat_reflejos: 88, stat_estirada: null });
  assert.equal(s.ritmo, 70);
  assert.equal(s.reflejos, 88);
  assert.equal(s.estirada, STAT_INICIAL);
  assert.equal(statsDeFila({ ...fila, stat_tiro: null }), null);
});

test('registro: la principal va primero aunque no sea la primera del catálogo, y no se repite como alternativa', () => {
  const base = { apodo: 'Pibe', fecha_nacimiento: '1995-05-05', altura: '175', peso: '70', rol: 'jugador' };
  const req = { body: { ...base, posicion_principal: 'delantero', posicion_alternativa: ['arquero', 'delantero', 'defensa'] } };
  validarPerfilJugador(req, {}, () => {});
  assert.deepEqual(req.datosFormulario.posiciones, ['delantero', 'arquero', 'defensa']);
  assert.deepEqual(req.erroresPerfil.errores, []);

  const sinPrincipal = { body: { ...base, posicion_alternativa: 'defensa' } };
  validarPerfilJugador(sinPrincipal, {}, () => {});
  assert.match(sinPrincipal.erroresPerfil.errores.join(), /posición principal/);

  const invalida = { body: { ...base, posicion_principal: 'defensa', posicion_alternativa: 'libero' } };
  validarPerfilJugador(invalida, {}, () => {});
  assert.match(invalida.erroresPerfil.errores.join(), /alternativa no es válida/);
});

test('editor: valida las 12 estadísticas (campo y portero)', () => {
  const body = { nombre: 'Juan', apellido: 'Pérez', apodo: 'Pibe', fecha_nacimiento: '1995-05-05', altura: '175', peso: '70',
    posicion_principal: 'arquero', ...Object.fromEntries([...ESTADISTICAS, ...ESTADISTICAS_PORTERO].map(({ clave }) => [`stat_${clave}`, '60'])) };
  const ok = { body };
  validarEdicionPerfil(ok, {}, () => {});
  assert.deepEqual(ok.erroresPerfil.errores, []);
  assert.equal(ok.datosFormulario.stats.reflejos, 60);

  const mala = { body: { ...body, stat_reflejos: '120' } };
  validarEdicionPerfil(mala, {}, () => {});
  assert.match(mala.erroresPerfil.errores.join(), /Reflejos/);
});

test('vistas: selector de posiciones y carta alternativa', async () => {
  const { POSICIONES } = require('../config/perfilJugador');
  const html = await ejs.renderFile(path.join(vistas, 'partials/sm-posiciones.ejs'), { posiciones: ['delantero', 'arquero'], catalogo: POSICIONES });
  assert.match(html, /name="posicion_principal" value="delantero"[^>]*checked/);
  assert.match(html, /name="posicion_alternativa" value="arquero"[^>]*checked/);
  assert.match(html, /name="posicion_alternativa" value="delantero"[^>]*disabled/, 'la principal no se marca como alternativa');

  const [, portero] = cartasDe(['delantero', 'arquero'], stats({}));
  const alt = await ejs.renderFile(path.join(vistas, 'partials/carta-alternativa.ejs'), { jugador: { cartaAlternativa: { ...portero, nombre: 'Pibe', foto: null } } });
  assert.match(alt, /Carta alternativa · <strong>Portero<\/strong>/);
  assert.match(alt, /carta-jugador__stat--clave"><dt>REF/);
  assert.equal((await ejs.renderFile(path.join(vistas, 'partials/carta-alternativa.ejs'), { jugador: { cartaAlternativa: null } })).trim(), '');
});
