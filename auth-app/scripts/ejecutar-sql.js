const fs = require('fs');
const path = require('path');
const { pool } = require('../config/db');

async function ejecutar(archivo) {
  const sql = fs.readFileSync(path.resolve(archivo), 'utf8');
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    await cliente.query(sql);
    await cliente.query('COMMIT');
    console.log(`✅ ${archivo} ejecutado correctamente.`);
  } catch (err) {
    await cliente.query('ROLLBACK').catch(() => {});
    console.error(`❌ ${archivo} falló y se deshizo completo:`, err.message);
    process.exitCode = 1;
  } finally {
    cliente.release();
    await pool.end();
  }
}

if (!process.argv[2]) {
  console.error('Indica el archivo: node scripts/ejecutar-sql.js sql/nuevas_tablas.sql');
  process.exit(1);
}
ejecutar(process.argv[2]);
