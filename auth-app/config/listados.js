// config/listados.js
// AP-003 · Listados del panel: buscar, filtrar, ordenar, paginar y exportar a CSV con los mismos criterios.
// Funciones puras (no tocan la base): leen la URL con listas blancas y arman los trozos de SQL que el
// modelo pega en su consulta. Todo lo que viene del usuario va como parámetro ($1, $2...); lo único que
// se pega en el SQL son expresiones escritas en la definición de cada listado (código, no datos).
//
// Definición de un listado:
//   {
//     buscar: ['u.correo', "concat_ws(' ', j.nombre_apodo, j.apellido)"],   // columnas donde busca el texto
//     filtros: {
//       estado: { etiqueta: 'Estado', tipo: 'opcion', opciones: { activo: { texto: 'Activo', sql: 'u.activo' } } },
//       admin:  { etiqueta: 'Administrador', tipo: 'id', sql: 'a.id_admin = ?' },
//       desde:  { etiqueta: 'Desde', tipo: 'fecha', sql: "a.fecha >= ?::date" },
//       seccion:{ etiqueta: 'Sección', tipo: 'texto', sql: 'a.seccion = ?' },
//       monto_min: { etiqueta: 'Monto desde', tipo: 'entero', sql: 'p.monto >= ?' },
//     },
//     orden: { fecha: 'a.fecha', admin: 'a.admin_nombre' },                  // columna → expresión
//     ordenDefecto: 'fecha', dirDefecto: 'desc',
//   }
// En "sql", cada ? se cambia por el $n que corresponde.

const POR_PAGINA = [25, 50, 100];
const MAX_CSV = 50000;

const REGEX_FECHA = /^\d{4}-\d{2}-\d{2}$/;

function fechaValida(valor) {
  if (!REGEX_FECHA.test(valor)) return false;
  const fecha = new Date(`${valor}T00:00:00Z`);
  return !Number.isNaN(fecha.getTime()) && fecha.toISOString().slice(0, 10) === valor;
}

/** Valor limpio de un filtro según su tipo, o null si no sirve (se ignora, como si no estuviera). */
function valorFiltro(def, crudo) {
  const valor = String(crudo ?? '').trim();
  if (!valor) return null;
  switch (def.tipo) {
    case 'opcion': return Object.prototype.hasOwnProperty.call(def.opciones, valor) ? valor : null;
    case 'fecha': return fechaValida(valor) ? valor : null;
    case 'id': { const n = Number(valor); return Number.isInteger(n) && n > 0 ? n : null; }
    case 'entero': { const n = Number(valor.replace(/\./g, '')); return Number.isInteger(n) && n >= 0 ? n : null; }
    case 'texto': return valor.slice(0, 100);
    default: return null;
  }
}

/**
 * Lee el estado del listado desde req.query.
 * @returns {{texto:string, filtros:Object<string,*>, orden:string, dir:'asc'|'desc', pagina:number, por:number}}
 */
function leerListado(query, def) {
  const q = query || {};
  const filtros = {};
  Object.entries(def.filtros || {}).forEach(([clave, f]) => {
    const valor = valorFiltro(f, q[clave]);
    if (valor !== null) filtros[clave] = valor;
  });
  const orden = Object.prototype.hasOwnProperty.call(def.orden || {}, q.orden) ? q.orden : def.ordenDefecto;
  const dirDefecto = def.dirDefecto === 'asc' ? 'asc' : 'desc';
  const dir = q.dir === 'asc' || q.dir === 'desc' ? q.dir : dirDefecto;
  const por = POR_PAGINA.includes(Number(q.por)) ? Number(q.por) : POR_PAGINA[0];
  const pagina = Number.isInteger(Number(q.pagina)) && Number(q.pagina) > 0 ? Number(q.pagina) : 1;
  return { texto: String(q.texto || '').trim().slice(0, 100), filtros, orden, dir, pagina, por };
}

/**
 * Trozos de SQL para el WHERE, el ORDER BY y la paginación.
 * @param {object} estado - De leerListado.
 * @param {object} def
 * @param {any[]} [paramsBase] - Parámetros que la consulta ya usa antes ($1...); los nuevos van después.
 * @returns {{where:string, orderBy:string, params:any[], limite:string, paramsPagina:any[]}}
 *   limite: "LIMIT $x OFFSET $y" (sus valores en paramsPagina, que van después de params).
 */
function construirSQL(estado, def, paramsBase = []) {
  const params = [...paramsBase];
  const condiciones = [];
  const marcar = (sql, valor) => {
    params.push(valor);
    return sql.split('?').join(`$${params.length}`);
  };

  if (estado.texto && (def.buscar || []).length > 0) {
    params.push(estado.texto);
    const n = params.length;
    condiciones.push(`(${def.buscar.map((col) => `(${col})::text ILIKE '%' || $${n} || '%'`).join(' OR ')})`);
  }
  Object.entries(estado.filtros).forEach(([clave, valor]) => {
    const f = def.filtros[clave];
    if (f.tipo === 'opcion') condiciones.push(`(${f.opciones[valor].sql})`);
    else condiciones.push(`(${marcar(f.sql, valor)})`);
  });

  const columna = def.orden[estado.orden];
  // El id desempata para que la paginación sea estable.
  const desempate = def.desempate ? `, ${def.desempate} ${estado.dir.toUpperCase()}` : '';
  const orderBy = `${columna} ${estado.dir.toUpperCase()} NULLS LAST${desempate}`;
  const limite = `LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
  return {
    where: condiciones.length > 0 ? condiciones.join(' AND ') : 'TRUE',
    orderBy,
    params,
    limite,
    paramsPagina: [estado.por, (estado.pagina - 1) * estado.por],
  };
}

/** Pares [nombre, valor] del estado (para enlaces y campos ocultos). Sin los valores por defecto. */
function pares(estado, def, cambios = {}) {
  const e = { ...estado, ...cambios, filtros: { ...estado.filtros, ...(cambios.filtros || {}) } };
  const lista = [];
  if (e.texto) lista.push(['texto', e.texto]);
  Object.entries(e.filtros).forEach(([k, v]) => { if (v !== null && v !== undefined && v !== '') lista.push([k, String(v)]); });
  if (e.orden && e.orden !== def.ordenDefecto) lista.push(['orden', e.orden]);
  if (e.dir && e.dir !== (def.dirDefecto === 'asc' ? 'asc' : 'desc')) lista.push(['dir', e.dir]);
  if (e.por && e.por !== POR_PAGINA[0]) lista.push(['por', String(e.por)]);
  if (e.pagina && e.pagina > 1) lista.push(['pagina', String(e.pagina)]);
  return lista;
}

/** URL del listado con cambios (por ejemplo { pagina: 2 } o { filtros: { estado: null } }). */
function urlListado(base, estado, def, cambios = {}) {
  const qs = new URLSearchParams(pares(estado, def, cambios)).toString();
  return qs ? `${base}?${qs}` : base;
}

/**
 * Todo lo que necesita la vista: estado, enlaces de orden y paginación y etiquetas de los filtros activos.
 * @param {string} base - Ruta del listado, ej. '/admin/actividad'.
 * @param {number} total - Registros que cumplen los filtros.
 * @param {Object<string, Object<string,string>>} [textosValores] - Texto visible de valores (ej. id de admin → nombre).
 */
function vistaListado(base, estado, def, total, textosValores = {}) {
  const paginas = Math.max(1, Math.ceil(total / estado.por));
  const filtrosActivos = Object.keys(estado.filtros).length > 0 || Boolean(estado.texto);
  const etiquetas = [];
  if (estado.texto) etiquetas.push({ texto: `Búsqueda: "${estado.texto}"`, url: urlListado(base, estado, def, { texto: '', pagina: 1 }) });
  Object.entries(estado.filtros).forEach(([clave, valor]) => {
    const f = def.filtros[clave];
    const textoValor = f.tipo === 'opcion' ? f.opciones[valor].texto
      : (textosValores[clave] && textosValores[clave][valor]) || valor;
    etiquetas.push({ texto: `${f.etiqueta}: ${textoValor}`, url: urlListado(base, estado, def, { filtros: { [clave]: null }, pagina: 1 }) });
  });
  return {
    base,
    ...estado,
    total,
    paginas,
    desde: total === 0 ? 0 : (estado.pagina - 1) * estado.por + 1,
    hasta: Math.min(total, estado.pagina * estado.por),
    porPagina: POR_PAGINA,
    filtrosActivos,
    etiquetas,
    limpiar: urlListado(base, { ...estado, texto: '', filtros: {}, pagina: 1 }, def),
    // Exportar: los mismos filtros y orden, sin paginar (el modelo devuelve todo).
    csv: `${base}?${new URLSearchParams([...pares({ ...estado, pagina: 1 }, def), ['formato', 'csv']]).toString()}`,
    urlPagina: (n) => urlListado(base, estado, def, { pagina: n }),
    // Título de columna: ordena por ella; si ya ordenaba, alterna asc/desc.
    urlOrden: (clave) => urlListado(base, estado, def, {
      orden: clave, dir: estado.orden === clave ? (estado.dir === 'asc' ? 'desc' : 'asc') : 'asc', pagina: 1,
    }),
    ariaSort: (clave) => (estado.orden === clave ? (estado.dir === 'asc' ? 'ascending' : 'descending') : 'none'),
    // Campos ocultos para los formularios GET (Buscar, Filtros, Por página) sin perder el resto.
    ocultos: (excluir = []) => pares({ ...estado, pagina: 1 }, def).filter(([k]) => !excluir.includes(k)),
  };
}

/** Una celda CSV: entre comillas si trae separador, comillas o saltos; neutraliza fórmulas de planilla. */
function celdaCSV(valor) {
  if (valor === null || valor === undefined) return '';
  // Fechas en hora de Chile, "AAAA-MM-DD HH:MM:SS" (el formato sueco sirve justo para eso).
  let texto = valor instanceof Date ? valor.toLocaleString('sv-SE', { timeZone: 'America/Santiago' }) : String(valor);
  if (/^[=+\-@\t\r]/.test(texto)) texto = `'${texto}`;
  return /[",;\r\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
}

/**
 * Texto CSV (separador ";" y BOM, así Excel en español lo abre con tildes y columnas bien).
 * @param {{titulo:string, valor:(fila)=>any}[]} columnas
 * @param {object[]} filas
 */
function aCSV(columnas, filas) {
  const lineas = [columnas.map((c) => celdaCSV(c.titulo)).join(';')];
  filas.forEach((fila) => lineas.push(columnas.map((c) => celdaCSV(c.valor(fila))).join(';')));
  return `﻿${lineas.join('\r\n')}\r\n`;
}

/** Envía un CSV como descarga. nombre sin extensión; se le agrega la fecha. */
function enviarCSV(res, nombre, columnas, filas) {
  const fecha = new Date().toISOString().slice(0, 10);
  res.set({
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="${nombre}-${fecha}.csv"`,
    'Cache-Control': 'no-store',
  });
  return res.send(aCSV(columnas, filas));
}

module.exports = {
  POR_PAGINA, MAX_CSV, leerListado, construirSQL, urlListado, vistaListado, aCSV, celdaCSV, enviarCSV, fechaValida,
};
