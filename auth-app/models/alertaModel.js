// models/alertaModel.js
// Alertas del panel (AP-002 contador junto a Resumen; AP-005 las amplía). Se calculan con el estado
// actual de los datos: cuando el problema se resuelve, la alerta desaparece sola.

const { pool } = require('../config/db');

// Cada alerta: clave → consulta que devuelve las filas pendientes (id, texto y enlace al elemento).
const CONSULTAS = {
  'equipo-sin-capitan': {
    titulo: 'Equipos activos sin capitán activo',
    sql: `SELECT e.id, 'El equipo "' || e.nombre || '" está activo pero su capitán tiene la cuenta desactivada.' AS texto,
                 '/admin/equipos?texto=' || e.id AS enlace
            FROM equipo e JOIN usuario u ON u.id = e.id_usuario_creador
           WHERE e.activo AND NOT u.activo`,
  },
};

/** Alertas pendientes, opcionalmente de un solo tipo. */
async function listar(tipo = null) {
  const claves = tipo && CONSULTAS[tipo] ? [tipo] : Object.keys(CONSULTAS);
  const grupos = await Promise.all(claves.map(async (clave) => {
    const { rows } = await pool.query(CONSULTAS[clave].sql);
    return rows.map((f) => ({ tipo: clave, tipoTexto: CONSULTAS[clave].titulo, ...f }));
  }));
  return grupos.flat();
}

async function contar() {
  const total = await Promise.all(Object.values(CONSULTAS).map(async ({ sql }) => {
    const { rows } = await pool.query(`SELECT count(*)::int AS n FROM (${sql}) x`);
    return rows[0].n;
  }));
  return total.reduce((a, b) => a + b, 0);
}

const TIPOS = Object.fromEntries(Object.entries(CONSULTAS).map(([k, v]) => [k, v.titulo]));

module.exports = { listar, contar, TIPOS };
