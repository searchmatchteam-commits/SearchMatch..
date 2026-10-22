// models/ubicacionModel.js
// Regiones y comunas (tablas "region" y "comunas", cargadas por sql/nuevas_tablas.sql).
// Las usan el asistente de equipo (regla 11), los recintos (AD-001) y los filtros de canchas (DE-004).
// Todas las consultas son parametrizadas.

const { pool } = require('../config/db');

/**
 * Todas las regiones, cada una con sus comunas ordenadas por nombre.
 * La vista las recibe completas y el navegador filtra las comunas de la región elegida.
 * @returns {Promise<Array<{id, nombre, comunas: Array<{id, nombre}>}>>}
 */
async function listarRegionesConComunas() {
  const { rows } = await pool.query(
    `SELECT r.id, r.nombre,
            coalesce(json_agg(json_build_object('id', c.id, 'nombre', c.nombre) ORDER BY c.nombre)
                     FILTER (WHERE c.id IS NOT NULL), '[]') AS comunas
       FROM region r
       LEFT JOIN comunas c ON c.id_region = r.id
      GROUP BY r.id, r.nombre
      ORDER BY r.id`
  );
  return rows;
}

/**
 * Una comuna con su región, o null si no existe (para validar lo que llega del formulario).
 * @param {number} idComuna
 * @returns {Promise<{id, nombre, idRegion}|null>}
 */
async function obtenerComuna(idComuna) {
  const { rows } = await pool.query('SELECT id, nombre, id_region FROM comunas WHERE id = $1', [idComuna]);
  return rows[0] ? { id: rows[0].id, nombre: rows[0].nombre, idRegion: rows[0].id_region } : null;
}

module.exports = { listarRegionesConComunas, obtenerComuna };
