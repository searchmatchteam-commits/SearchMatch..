// models/actividadModel.js
// AP-032 · Registro de actividad del panel (tabla admin_actividad, sql/nuevas_tablas.sql SA-6).
// Solo inserción: la tabla tiene un trigger que rechaza UPDATE, DELETE y TRUNCATE.
// Toda acción de administración que cambia datos llama a registrar() con el MISMO cliente de su
// transacción: si la acción se deshace, la entrada también; si el registro falla, la acción no se guarda.

const { pool } = require('../config/db');
const { construirSQL, MAX_CSV } = require('../config/listados');

// Secciones del panel (clave guardada → texto). También son las del filtro.
const SECCIONES = {
  acceso: 'Acceso',
  administradores: 'Administradores',
  usuarios: 'Usuarios',
  equipos: 'Equipos',
  recintos: 'Recintos y canchas',
  desafios: 'Desafíos',
  partidos: 'Partidos',
  reservas: 'Reservas',
  valoraciones: 'Valoraciones',
  comentarios: 'Comentarios',
  anuncios: 'Anuncios',
  torneos: 'Torneos',
  apelaciones: 'Apelaciones',
  pagos: 'Pagos',
  configuracion: 'Configuración',
};

/**
 * Agrega una entrada al registro.
 * @param {import('pg').PoolClient|import('pg').Pool} cliente - El de la transacción de la acción.
 * @param {{admin:{id:number|null, nombre:string}|null, seccion:keyof SECCIONES, accion:string,
 *          elementoTipo?:string, elementoId?:string|number, elemento?:string, motivo?:string|null,
 *          anterior?:object|null, nuevo?:object|null}} entrada
 */
async function registrar(cliente, entrada) {
  const a = entrada.admin || { id: null, nombre: 'Sistema' };
  await cliente.query(
    `INSERT INTO admin_actividad (id_admin, admin_nombre, seccion, accion, elemento_tipo, elemento_id, elemento, motivo, valor_anterior, valor_nuevo)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb)`,
    [
      a.id, String(a.nombre || '').slice(0, 150), entrada.seccion, String(entrada.accion).slice(0, 60),
      entrada.elementoTipo || null, entrada.elementoId === undefined || entrada.elementoId === null ? null : String(entrada.elementoId),
      entrada.elemento ? String(entrada.elemento).slice(0, 200) : null, entrada.motivo ? String(entrada.motivo).slice(0, 500) : null,
      entrada.anterior ? JSON.stringify(entrada.anterior) : null, entrada.nuevo ? JSON.stringify(entrada.nuevo) : null,
    ]
  );
}

// Listado (AP-003): búsqueda, filtros por administrador, sección, acción y rango de fechas (hora de Chile).
const LISTADO = {
  buscar: ['a.elemento', 'a.motivo', 'a.admin_nombre', 'a.accion'],
  filtros: {
    admin: { etiqueta: 'Administrador', tipo: 'id', sql: 'a.id_admin = ?' },
    seccion: {
      etiqueta: 'Sección',
      tipo: 'opcion',
      // La clave viene de la lista fija; el SQL compara con un literal del propio código.
      opciones: Object.fromEntries(Object.entries(SECCIONES).map(([k, texto]) => [k, { texto, sql: `a.seccion = '${k}'` }])),
    },
    accion: { etiqueta: 'Acción', tipo: 'texto', sql: 'a.accion = ?' },
    desde: { etiqueta: 'Desde', tipo: 'fecha', sql: "(a.fecha AT TIME ZONE 'America/Santiago')::date >= ?::date" },
    hasta: { etiqueta: 'Hasta', tipo: 'fecha', sql: "(a.fecha AT TIME ZONE 'America/Santiago')::date <= ?::date" },
  },
  orden: { fecha: 'a.fecha', admin: 'a.admin_nombre', seccion: 'a.seccion', accion: 'a.accion', elemento: 'a.elemento' },
  ordenDefecto: 'fecha',
  dirDefecto: 'desc',
  desempate: 'a.id',
};

function aEntrada(f) {
  return {
    id: Number(f.id),
    fecha: f.fecha,
    idAdmin: f.id_admin,
    admin: f.admin_nombre || 'Sistema',
    seccion: f.seccion,
    seccionTexto: SECCIONES[f.seccion] || f.seccion,
    accion: f.accion,
    elementoTipo: f.elemento_tipo,
    elementoId: f.elemento_id,
    elemento: f.elemento || '',
    motivo: f.motivo || '',
    anterior: f.valor_anterior,
    nuevo: f.valor_nuevo,
    conCambios: Boolean(f.valor_anterior || f.valor_nuevo),
  };
}

/**
 * @param {object} estado - De leerListado(query, LISTADO).
 * @param {{todo?: boolean}} [opciones] - todo: sin paginar (CSV).
 * @returns {Promise<{filas:object[], total:number}>}
 */
async function listar(estado, { todo = false } = {}) {
  const s = construirSQL(estado, LISTADO);
  const { rows } = await pool.query(
    `SELECT a.*, count(*) OVER()::int AS total
       FROM admin_actividad a
      WHERE ${s.where}
      ORDER BY ${s.orderBy}
      ${todo ? `LIMIT ${MAX_CSV}` : s.limite}`,
    todo ? s.params : [...s.params, ...s.paramsPagina]
  );
  return { filas: rows.map(aEntrada), total: rows[0] ? rows[0].total : 0 };
}

async function obtener(id) {
  const { rows } = await pool.query('SELECT * FROM admin_actividad WHERE id = $1', [id]);
  return rows[0] ? aEntrada(rows[0]) : null;
}

/** Opciones de los filtros: administradores y acciones que aparecen en el registro. */
async function opcionesFiltros() {
  const [admins, acciones] = await Promise.all([
    pool.query(`SELECT DISTINCT ON (id_admin) id_admin, admin_nombre FROM admin_actividad WHERE id_admin IS NOT NULL ORDER BY id_admin, fecha DESC`),
    pool.query('SELECT DISTINCT accion FROM admin_actividad ORDER BY accion'),
  ]);
  return {
    admins: admins.rows.map((f) => ({ valor: String(f.id_admin), texto: f.admin_nombre })),
    acciones: acciones.rows.map((f) => ({ valor: f.accion, texto: f.accion })),
  };
}

module.exports = { SECCIONES, LISTADO, registrar, listar, obtener, opcionesFiltros };
