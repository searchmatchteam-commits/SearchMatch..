// R9 · Corregir un resultado de un torneo finalizado: exige confirmación y motivo antes de tocar nada.
// Usa un cliente de base simulado (no se conecta a Supabase).
const test = require('node:test');
const assert = require('node:assert/strict');

const { pool } = require('../config/db');
const torneoModel = require('../models/torneoModel');

/** Cliente falso: responde el SELECT del torneo y guarda todas las consultas. */
function simularBase(torneo) {
  const consultas = [];
  const cliente = {
    query: async (sql) => {
      consultas.push(String(sql).trim());
      if (/^SELECT nombre, formato, estado, id_campeon FROM torneo/.test(String(sql).trim())) return { rows: torneo ? [torneo] : [] };
      return { rows: [], rowCount: 0 };
    },
    release: () => {},
  };
  return { consultas, conectar: async () => cliente };
}

async function registrar(torneo, correccion) {
  const base = simularBase(torneo);
  const original = pool.connect;
  pool.connect = base.conectar;
  try {
    const resultado = await torneoModel.registrarResultado({ id: 1, nombre: 'Admin' }, 10, 20, 2, 1, null, correccion);
    return { resultado, consultas: base.consultas };
  } finally {
    pool.connect = original;
  }
}

const FINALIZADO = { nombre: 'Copa', formato: 'liga', estado: 'finalizado', id_campeon: 5 };

test('R9: con el torneo finalizado, sin confirmar no se guarda nada', async () => {
  const { resultado, consultas } = await registrar(FINALIZADO, { confirmarFinalizado: false, motivo: 'Error de tipeo' });
  assert.equal(resultado, 'confirmar-finalizado');
  assert.equal(consultas.some((c) => /^UPDATE|^INSERT/.test(c)), false);
});

test('R9: con el torneo finalizado, confirmar sin motivo tampoco guarda', async () => {
  const { resultado, consultas } = await registrar(FINALIZADO, { confirmarFinalizado: true, motivo: null });
  assert.equal(resultado, 'motivo');
  assert.equal(consultas.some((c) => /^UPDATE|^INSERT/.test(c)), false);
});

test('R9: un torneo que no está en curso ni finalizado no acepta resultados', async () => {
  const { resultado } = await registrar({ ...FINALIZADO, estado: 'cerrado' }, {});
  assert.equal(resultado, 'cerrado');
});
