const { pool } = require('../config/db');

// node scripts/hacer-admin.js correo@ejemplo.com                    → Administrador
// node scripts/hacer-admin.js correo@ejemplo.com --super            → el (único) Superadministrador
// node scripts/hacer-admin.js correo@ejemplo.com --super --reemplazar → traspasa el rol: el anterior queda como Administrador
async function crearRol(cliente, rol) {
  await cliente.query(
    `INSERT INTO rol_aplicacion (nombre)
     SELECT $1::varchar WHERE NOT EXISTS (SELECT 1 FROM rol_aplicacion WHERE lower(nombre) = $1)`,
    [rol]
  );
  const { rows } = await cliente.query('SELECT id FROM rol_aplicacion WHERE lower(nombre) = $1', [rol]);
  return rows[0].id;
}

async function hacerAdmin(correo, { superAdmin, reemplazar }) {
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    const idAdmin = await crearRol(cliente, 'administrador');
    const idRol = superAdmin ? await crearRol(cliente, 'superadministrador') : idAdmin;

    const cuenta = await cliente.query('SELECT id FROM usuario WHERE lower(correo) = lower($1)', [correo]);
    if (cuenta.rowCount === 0) {
      await cliente.query('ROLLBACK');
      return console.log(`❌ No hay una cuenta registrada con ${correo}. Regístrate primero en /registro.`);
    }

    if (superAdmin) {
      // Solo puede haber uno (el índice ux_un_solo_superadmin también lo garantiza en la base).
      await cliente.query(
        `CREATE UNIQUE INDEX IF NOT EXISTS ux_un_solo_superadmin ON usuario ((true)) WHERE id_rol_aplicacion = ${Number(idRol)}`
      );
      const actual = await cliente.query(
        'SELECT id, correo FROM usuario WHERE id_rol_aplicacion = $1 AND id <> $2', [idRol, cuenta.rows[0].id]
      );
      if (actual.rowCount > 0) {
        if (!reemplazar) {
          await cliente.query('ROLLBACK');
          return console.log(`❌ Ya existe un superadministrador (${actual.rows[0].correo}). ` +
            'Usa --reemplazar para traspasarle el rol (el anterior quedará como Administrador).');
        }
        await cliente.query('UPDATE usuario SET id_rol_aplicacion = $1 WHERE id = $2', [idAdmin, actual.rows[0].id]);
        console.log(`ℹ️  ${actual.rows[0].correo} pasa a ser Administrador.`);
      }
    }

    await cliente.query('UPDATE usuario SET id_rol_aplicacion = $1 WHERE id = $2', [idRol, cuenta.rows[0].id]);
    await cliente.query('COMMIT');
    console.log(superAdmin
      ? `✅ ${correo} ahora es el Superadministrador: al iniciar sesión entrará a /admin/super.`
      : `✅ ${correo} ahora es Administrador (vuelve a cargar la página para ver el módulo).`);
  } catch (err) {
    await cliente.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    cliente.release();
  }
}

const correo = process.argv.slice(2).find((arg) => !arg.startsWith('--'));
if (!correo) {
  console.error('Indica el correo: node scripts/hacer-admin.js correo@ejemplo.com [--super [--reemplazar]]');
  process.exit(1);
}
hacerAdmin(correo, { superAdmin: process.argv.includes('--super'), reemplazar: process.argv.includes('--reemplazar') })
  .catch((err) => {
    console.error('❌', err.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
