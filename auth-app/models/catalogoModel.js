// models/catalogoModel.js
// AD-014 · Catálogos de la plataforma: modalidades, posiciones y niveles.
// Permite agregar, editar y eliminar (solo si no están en uso; se indica dónde se usan).
// "Protegidos": los elementos que el código busca por su nombre o cantidad (config/equipo.js y
// config/perfilJugador.js). Se pueden editar sus otros datos, pero no renombrarlos ni eliminarlos,
// porque se romperían el asistente de equipo o el perfil de jugador.
// Los nombres de tabla salen de CATALOGOS (fijos en el código), nunca de lo que escribe el usuario.

const { pool } = require('../config/db');
const { MODALIDADES } = require('../config/equipo');
const { NIVELES, POSICIONES } = require('../config/perfilJugador');

const VALOR_REPETIDO = '23505';

const CATALOGOS = {
  modalidades: {
    tabla: 'modalidad',
    titulo: 'Modalidades',
    singular: 'modalidad',
    usos: [
      { tabla: 'equipo', columna: 'id_modalidad', etiqueta: 'equipos' },
      { tabla: 'equipo_modalidad', columna: 'id_modalidad', etiqueta: 'equipos que la juegan' }, // F8-2: varias por equipo
      { tabla: 'desafio', columna: 'id_modalidad', etiqueta: 'desafíos' },
      { tabla: 'cancha', columna: 'id_modalidad', etiqueta: 'canchas' },
      { tabla: 'partido', columna: 'id_modalidad', etiqueta: 'partidos' },
    ],
    // Protegidas: las de 5, 7 y 11 jugadores (el asistente de equipo las busca por cantidad).
    esProtegido: (fila) => Boolean(MODALIDADES[fila.cantidad_de_jugadores]),
  },
  posiciones: {
    tabla: 'posicion',
    titulo: 'Posiciones',
    singular: 'posición',
    usos: [{ tabla: 'jugador_posicion', columna: 'id_posicion', etiqueta: 'jugadores' }],
    esProtegido: (fila) => Object.values(POSICIONES).some((p) => p.db.some((n) => n.toLowerCase() === fila.nombre.toLowerCase())),
  },
  niveles: {
    tabla: 'nivel',
    titulo: 'Niveles',
    singular: 'nivel',
    usos: [
      { tabla: 'equipo', columna: 'id_nivel', etiqueta: 'equipos' },
      { tabla: 'jugador', columna: 'id_nivel', etiqueta: 'jugadores' },
    ],
    esProtegido: (fila) => Object.values(NIVELES).some((n) => n.toLowerCase() === fila.nombre.toLowerCase()),
  },
};

/** Dónde se usa un elemento: [{ etiqueta: 'equipos', total: 3 }] (solo los que tienen uso). */
async function usosDe(catalogo, id) {
  const usos = await Promise.all(catalogo.usos.map(async ({ tabla, columna, etiqueta }) => {
    const { rows } = await pool.query(`SELECT count(*)::int AS total FROM ${tabla} WHERE ${columna} = $1`, [id]);
    return { etiqueta, total: rows[0].total };
  }));
  return usos.filter((uso) => uso.total > 0);
}

/** Elementos de un catálogo con su uso y si está protegido. */
async function listar(tipo) {
  const catalogo = CATALOGOS[tipo];
  const { rows } = await pool.query(`SELECT * FROM ${catalogo.tabla} ORDER BY id`);
  return Promise.all(rows.map(async (fila) => ({
    ...fila,
    protegido: catalogo.esProtegido(fila),
    usos: await usosDe(catalogo, fila.id),
  })));
}

/** Niveles: ¿el rango [min, max] se cruza con el de otro nivel? (excluye al que se edita) */
async function rangoSuperpuesto(min, max, idExcluido = null) {
  const { rowCount } = await pool.query(
    'SELECT 1 FROM nivel WHERE puntaje_min <= $2 AND puntaje_max >= $1 AND ($3::int IS NULL OR id <> $3)',
    [min, max, idExcluido]
  );
  return rowCount > 0;
}

/** Ejecuta un INSERT/UPDATE y traduce el nombre repetido (índice único) a 'repetido'. */
async function guardar(sql, valores, resultadoOk) {
  try {
    await pool.query(sql, valores);
    return resultadoOk;
  } catch (err) {
    if (err.code === VALOR_REPETIDO) return 'repetido';
    throw err;
  }
}

/**
 * Agrega un elemento (datos ya validados por validadoresAdmin.validarCatalogo).
 * @returns {Promise<'creado'|'repetido'|'superpuesto'>}
 */
async function crear(tipo, datos) {
  if (tipo === 'modalidades') {
    return guardar('INSERT INTO modalidad (nombre, cantidad_de_jugadores) VALUES ($1, $2)', [datos.nombre, datos.jugadores], 'creado');
  }
  if (tipo === 'posiciones') {
    return guardar('INSERT INTO posicion (nombre) VALUES ($1)', [datos.nombre], 'creado');
  }
  if (await rangoSuperpuesto(datos.min, datos.max)) return 'superpuesto';
  return guardar('INSERT INTO nivel (nombre, puntaje_min, puntaje_max) VALUES ($1, $2, $3)', [datos.nombre, datos.min, datos.max], 'creado');
}

/**
 * Edita un elemento. En los protegidos no se puede cambiar el nombre (ni la cantidad en las modalidades base).
 * @returns {Promise<'editado'|'repetido'|'superpuesto'|'protegido'|'inexistente'>}
 */
async function editar(tipo, id, datos) {
  const catalogo = CATALOGOS[tipo];
  const { rows } = await pool.query(`SELECT * FROM ${catalogo.tabla} WHERE id = $1`, [id]);
  const actual = rows[0];
  if (!actual) return 'inexistente';
  if (catalogo.esProtegido(actual)) {
    const cambiaNombre = tipo !== 'modalidades' && datos.nombre.toLowerCase() !== actual.nombre.toLowerCase();
    const cambiaCantidad = tipo === 'modalidades' && datos.jugadores !== actual.cantidad_de_jugadores;
    if (cambiaNombre || cambiaCantidad) return 'protegido';
  }
  if (tipo === 'modalidades') {
    return guardar('UPDATE modalidad SET nombre = $2, cantidad_de_jugadores = $3 WHERE id = $1', [id, datos.nombre, datos.jugadores], 'editado');
  }
  if (tipo === 'posiciones') {
    return guardar('UPDATE posicion SET nombre = $2 WHERE id = $1', [id, datos.nombre], 'editado');
  }
  if (await rangoSuperpuesto(datos.min, datos.max, id)) return 'superpuesto';
  return guardar('UPDATE nivel SET nombre = $2, puntaje_min = $3, puntaje_max = $4 WHERE id = $1', [id, datos.nombre, datos.min, datos.max], 'editado');
}

/**
 * Elimina un elemento solo si no está en uso ni protegido.
 * @returns {Promise<{resultado: 'eliminado'|'en-uso'|'protegido'|'inexistente', usos: Array}>}
 */
async function eliminar(tipo, id) {
  const catalogo = CATALOGOS[tipo];
  const { rows } = await pool.query(`SELECT * FROM ${catalogo.tabla} WHERE id = $1`, [id]);
  if (!rows[0]) return { resultado: 'inexistente', usos: [] };
  if (catalogo.esProtegido(rows[0])) return { resultado: 'protegido', usos: [] };
  const usos = await usosDe(catalogo, id);
  if (usos.length > 0) return { resultado: 'en-uso', usos };
  await pool.query(`DELETE FROM ${catalogo.tabla} WHERE id = $1`, [id]);
  return { resultado: 'eliminado', usos: [] };
}

module.exports = { CATALOGOS, listar, crear, editar, eliminar };
