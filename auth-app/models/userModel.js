// models/userModel.js
// Acceso a datos de la tabla "usuarios".
// Este es el ÚNICO archivo (junto con config/db.js) que consulta la base de datos.
// Todas las consultas son parametrizadas ($1, $2...) para evitar inyección SQL.

const { pool } = require('../config/db');

/**
 * Busca un usuario por su email.
 * @param {string} email - Email a buscar.
 * @returns {Promise<object|undefined>} El usuario encontrado o undefined.
 */
async function findByEmail(email) {
  const consulta = 'SELECT id, nombre, email, password_hash, created_at FROM usuarios WHERE email = $1';
  const resultado = await pool.query(consulta, [email]);
  // Devolvemos la primera fila (o undefined si no existe).
  return resultado.rows[0];
}

/**
 * Crea un usuario nuevo en la base de datos.
 * @param {{nombre: string, email: string, password_hash: string}} datos
 * @returns {Promise<object>} El usuario recién creado (sin el hash).
 */
async function create({ nombre, email, password_hash }) {
  const consulta = `
    INSERT INTO usuarios (nombre, email, password_hash)
    VALUES ($1, $2, $3)
    RETURNING id, nombre, email, created_at
  `;
  const resultado = await pool.query(consulta, [nombre, email, password_hash]);
  return resultado.rows[0];
}

/**
 * Busca un usuario por id (útil para refrescar datos de la sesión).
 * @param {number} id
 * @returns {Promise<object|undefined>}
 */
async function findById(id) {
  const consulta = 'SELECT id, nombre, email, created_at FROM usuarios WHERE id = $1';
  const resultado = await pool.query(consulta, [id]);
  return resultado.rows[0];
}

module.exports = { findByEmail, create, findById };
