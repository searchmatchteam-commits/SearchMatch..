const test = require('node:test');
const assert = require('node:assert/strict');
const { leerListado, construirSQL, vistaListado, aCSV } = require('../config/listados');

const DEF = {
  buscar: ['a.elemento', 'a.motivo'],
  filtros: {
    estado: { etiqueta: 'Estado', tipo: 'opcion', opciones: { activo: { texto: 'Activo', sql: 'u.activo' }, inactivo: { texto: 'Inactivo', sql: 'NOT u.activo' } } },
    admin: { etiqueta: 'Administrador', tipo: 'id', sql: 'a.id_admin = ?' },
    desde: { etiqueta: 'Desde', tipo: 'fecha', sql: 'a.fecha >= ?::date' },
  },
  orden: { fecha: 'a.fecha', admin: 'a.admin_nombre' },
  ordenDefecto: 'fecha',
  dirDefecto: 'desc',
  desempate: 'a.id',
};

test('lee la URL con listas blancas e ignora lo desconocido', () => {
  const e = leerListado({ texto: ' hola ', estado: 'otro', admin: '7', desde: '2026-02-30', orden: 'DROP', dir: 'x', por: '33', pagina: '-1' }, DEF);
  assert.deepEqual(e, { texto: 'hola', filtros: { admin: 7 }, orden: 'fecha', dir: 'desc', pagina: 1, por: 25 });
});

test('combina búsqueda y filtros con AND y numera los parámetros después de los base', () => {
  const e = leerListado({ texto: 'x', estado: 'activo', admin: '3', desde: '2026-01-01', orden: 'admin', dir: 'asc', por: '50', pagina: '2' }, DEF);
  const s = construirSQL(e, DEF, ['base']);
  assert.equal(s.where, "((a.elemento)::text ILIKE '%' || $2 || '%' OR (a.motivo)::text ILIKE '%' || $2 || '%') AND (u.activo) AND (a.id_admin = $3) AND (a.fecha >= $4::date)");
  assert.deepEqual(s.params, ['base', 'x', 3, '2026-01-01']);
  assert.equal(s.orderBy, 'a.admin_nombre ASC NULLS LAST, a.id ASC');
  assert.equal(s.limite, 'LIMIT $5 OFFSET $6');
  assert.deepEqual(s.paramsPagina, [50, 50]);
});

test('sin filtros el WHERE es TRUE', () => {
  assert.equal(construirSQL(leerListado({}, DEF), DEF).where, 'TRUE');
});

test('la vista arma etiquetas quitables, orden alternado, paginación y CSV con los mismos filtros', () => {
  const e = leerListado({ estado: 'activo', orden: 'admin', dir: 'asc', pagina: '2' }, DEF);
  const v = vistaListado('/admin/x', e, DEF, 60);
  assert.equal(v.paginas, 3);
  assert.equal(v.desde, 26);
  assert.equal(v.hasta, 50);
  assert.deepEqual(v.etiquetas, [{ texto: 'Estado: Activo', url: '/admin/x?orden=admin&dir=asc' }]);
  assert.equal(v.urlOrden('admin'), '/admin/x?estado=activo&orden=admin');
  assert.equal(v.urlOrden('fecha'), '/admin/x?estado=activo&dir=asc');
  assert.equal(v.urlPagina(3), '/admin/x?estado=activo&orden=admin&dir=asc&pagina=3');
  assert.equal(v.csv, '/admin/x?estado=activo&orden=admin&dir=asc&formato=csv');
  assert.equal(v.limpiar, '/admin/x?orden=admin&dir=asc');
  assert.equal(v.ariaSort('admin'), 'ascending');
});

test('CSV con BOM, punto y coma, comillas y sin fórmulas', () => {
  const csv = aCSV([{ titulo: 'A', valor: (f) => f.a }, { titulo: 'B', valor: (f) => f.b }], [{ a: 'x;y', b: '=1+1' }, { a: 'di "hola"', b: null }]);
  assert.equal(csv, '﻿A;B\r\n"x;y";\'=1+1\r\n"di ""hola""";\r\n');
});

test('CSV escribe las fechas en hora de Chile', () => {
  const csv = aCSV([{ titulo: 'F', valor: (f) => f.f }], [{ f: new Date('2026-10-28T12:13:45Z') }]);
  assert.equal(csv, '﻿F\r\n2026-10-28 09:13:45\r\n');
});
