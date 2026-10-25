const { pool } = require('../config/db');

async function hacerAdmin(correo) {
  const { rowCount } = await pool.query(
    `UPDATE usuario
        SET id_rol_aplicacion = (SELECT id FROM rol_aplicacion WHERE lower(nombre) = 'administrador')
      WHERE lower(correo) = lower($1)`,
    [correo]
  );
  console.log(rowCount > 0
    ? `✅ ${correo} ahora es Administrador (vuelve a cargar la página para ver el módulo).`
    : `❌ No hay una cuenta registrada con ${correo}. Regístrate primero en /registro.`);
  await pool.end();
}

if (!process.argv[2]) {
  console.error('Indica el correo: node scripts/hacer-admin.js correo@ejemplo.com');
  process.exit(1);
}
hacerAdmin(process.argv[2]).catch((err) => {
  console.error('❌', err.message);
  process.exit(1);
});
