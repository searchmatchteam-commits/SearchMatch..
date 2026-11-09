const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const ejs = require('ejs');
const {
  leerColores, coloresParecidos, colorTexto, coloresDe, sugerirEquipaciones, validarEquipaciones,
} = require('../config/coloresEquipo');
const { validarEdicionEquipo } = require('../middlewares/validators');

const vistas = path.join(__dirname, '../views');
const equipo = (local, visita) => ({ camiseta_local: local, camiseta_visita: visita });

test('leerColores: acepta #rrggbb (en minúsculas) y exige camisetas de local y visita distintas', () => {
  const ok = leerColores({ color_primario: '#FF0000', color_secundario: '#ffffff', camiseta_local: '#ff0000', camiseta_visita: '#0000ff' });
  assert.deepEqual(ok.errores, []);
  assert.equal(ok.colores.color_primario, '#ff0000');

  const faltan = leerColores({ color_primario: 'rojo', camiseta_local: '#ff0000', camiseta_visita: '#0000ff' });
  assert.equal(faltan.errores.length, 2, 'color inválido y color ausente');

  const iguales = leerColores({ color_primario: '#ff0000', color_secundario: '#fff000', camiseta_local: '#ff0000', camiseta_visita: '#f00505' });
  assert.match(iguales.errores.join(), /distintos/);
});

test('el validador de equipos incluye los colores en los datos y sus errores', () => {
  const req = { body: { nombre_equipo: 'Los Titanes', correo_contacto: 'a@b.cl', nivel: Object.keys(require('../config/perfilJugador').NIVELES)[0], id_comuna: '5',
    color_primario: '#000000', color_secundario: '#ffffff', camiseta_local: '#000000', camiseta_visita: '#ffffff' } };
  validarEdicionEquipo(req, {}, () => {});
  assert.deepEqual(req.erroresEquipo.errores, []);
  assert.equal(req.datosFormulario.colores.camiseta_visita, '#ffffff');
});

test('colores parecidos y texto legible', () => {
  assert.equal(coloresParecidos('#ffffff', '#fafafa'), true, 'blanco y casi blanco chocan');
  assert.equal(coloresParecidos('#c00000', '#e00000'), true, 'rojo y rojo oscuro chocan');
  assert.equal(coloresParecidos('#ff0000', '#0000ff'), false);
  assert.equal(colorTexto('#ffffff'), '#111111');
  assert.equal(colorTexto('#000080'), '#ffffff');
});

test('equipación sugerida: el dueño de casa de local y el visitante con la camiseta que no choca', () => {
  const rojoBlanco = equipo('#d00000', '#ffffff');
  const rojoNegro = equipo('#e00000', '#111111');
  const s = sugerirEquipaciones(rojoNegro, rojoBlanco);
  assert.deepEqual(s, { desafiado: 'local', desafiante: 'visita', choque: false });

  const blancos = sugerirEquipaciones(equipo('#ffffff', '#fdfdfd'), equipo('#fefefe', '#fafafa'));
  assert.equal(blancos.choque, true, 'si todo se parece, se avisa');

  const sinColores = sugerirEquipaciones(equipo(null, null), rojoBlanco);
  assert.deepEqual(sinColores, { desafiado: 'local', desafiante: null, choque: false });
});

test('validarEquipaciones rechaza el mismo color si existe otra combinación, y deja pasar si no hay alternativa', () => {
  const a = equipo('#d00000', '#ffffff');
  const b = equipo('#e00000', '#111111');
  assert.match(validarEquipaciones({ camiseta_desafiante: 'local', camiseta_desafiado: 'local' }, b, a).error, /mismo color/);
  assert.equal(validarEquipaciones({ camiseta_desafiante: 'visita', camiseta_desafiado: 'local' }, b, a).error, null);
  assert.match(validarEquipaciones({ camiseta_desafiado: 'local' }, b, a).error, /Elige/);
  assert.match(validarEquipaciones({ camiseta_desafiante: 'otra', camiseta_desafiado: 'local' }, b, a).error, /Elige/);

  const blancos = [equipo('#ffffff', '#fdfdfd'), equipo('#fefefe', '#fafafa')];
  assert.equal(validarEquipaciones({ camiseta_desafiante: 'local', camiseta_desafiado: 'local' }, ...blancos).error, null);

  const sinColores = validarEquipaciones({}, equipo(null, null), equipo(null, null));
  assert.deepEqual(sinColores, { equipacion: { desafiante: null, desafiado: null }, error: null });
});

test('vistas: el formulario de colores y la inicial del escudo con los colores del equipo', async () => {
  const formulario = await ejs.renderFile(path.join(vistas, 'partials/sm-colores-equipo.ejs'), { colores: { color_primario: '#123456' } });
  assert.match(formulario, /name="color_primario" value="#123456"/);
  assert.match(formulario, /name="camiseta_visita" value="#ffffff"/, 'lo que falta parte con el predeterminado');
  const inyectado = await ejs.renderFile(path.join(vistas, 'partials/sm-colores-equipo.ejs'), { colores: { color_primario: '"><script>' } });
  assert.doesNotMatch(inyectado, /<script>/);

  const conColores = { nombre: 'titanes', colores: coloresDe({ color_primario: '#000080', color_secundario: '#ffcc00' }) };
  const escudo = await ejs.renderFile(path.join(vistas, 'partials/escudo-equipo.ejs'), { equipo: conColores });
  assert.match(escudo, /escudo-equipo__inicial" style="--c1:#000080;--c2:#ffcc00;--ct:#ffffff">T</);
  assert.equal((await ejs.renderFile(path.join(vistas, 'partials/escudo-equipo.ejs'), { equipo: { nombre: 'sin' } })).trim(), 'S');
  assert.equal(coloresDe({ color_primario: null }), null);
});

test('equipación elegida al desafiar: el rival no puede ir del mismo color y ve el aviso', async () => {
  const { soloCamiseta, MSG_COLOR_DEL_RIVAL, camisetasDe } = require('../config/coloresEquipo');
  const desafiante = soloCamiseta(equipo('#d00000', '#ffffff'), 'local'); // irá de rojo
  const rival = equipo('#e00000', '#111111'); // rojo o negro
  assert.deepEqual(camisetasDe(desafiante).map((c) => c.clave), ['local'], 'la otra camiseta del desafiante queda fuera');

  const mismoColor = validarEquipaciones({ camiseta_desafiante: 'local', camiseta_desafiado: 'local' }, desafiante, rival, { mensajeChoque: MSG_COLOR_DEL_RIVAL });
  assert.equal(mismoColor.error, 'El equipo rival irá de ese color, cámbiala.');
  assert.equal(validarEquipaciones({ camiseta_desafiante: 'local', camiseta_desafiado: 'visita' }, desafiante, rival).error, null);

  // Vista: la del desafiante sale fija y la alerta lleva el mensaje para el JS
  const { sugerirEquipaciones } = require('../config/coloresEquipo');
  const s = sugerirEquipaciones(desafiante, rival);
  const html = await ejs.renderFile(path.join(vistas, 'partidos/programar.ejs'), {
    titulo: 't', usuario: { nombre: 'u' }, versionAssets: 't', pagina: 'equipo', duracion: 60, error: null, erroresCampo: {},
    desafio: { id: 1, desafiante: 'Rojos', desafiado: 'Rivales' }, modalidades: [], canchas: [],
    datos: { camisetaDesafiante: s.desafiante, camisetaDesafiado: s.desafiado },
    equipacion: { desafiante: camisetasDe(desafiante), desafiado: camisetasDe(rival), choque: s.choque, desafianteFija: true, mensajeChoque: MSG_COLOR_DEL_RIVAL },
  });
  assert.match(html, /name="camiseta_desafiante" value="local" data-color="#d00000"\s+checked disabled/);
  assert.match(html, /name="camiseta_desafiado" value="visita"[^>]*checked/, 'se sugiere la que no choca');
  assert.match(html, /data-mensaje-choque="El equipo rival irá de ese color, cámbiala."/);
  assert.match(html, /data-alerta-choque hidden/);
});
