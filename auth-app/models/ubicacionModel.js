const { pool } = require('../config/db');

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

async function obtenerComuna(idComuna) {
  const { rows } = await pool.query('SELECT id, nombre, id_region FROM comunas WHERE id = $1', [idComuna]);
  return rows[0] ? { id: rows[0].id, nombre: rows[0].nombre, idRegion: rows[0].id_region } : null;
}

module.exports = { listarRegionesConComunas, obtenerComuna };
