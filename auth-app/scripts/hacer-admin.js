const { pool } = require('../config/db');
const { supabaseAdmin } = require('../config/supabase');

// Cuentas del panel (AP-011). Lo normal es crearlas desde /admin/administradores; este script es para la instalación.
// node scripts/hacer-admin.js correo@ejemplo.com --crear "Nombre Apellido"  → crea la cuenta del panel y envía la invitación
// node scripts/hacer-admin.js correo@ejemplo.com                            → convierte una cuenta existente en Administrador
// node scripts/hacer-admin.js correo@ejemplo.com --super [--reemplazar]     → Administrador principal (traspasa con --reemplazar)
// Si todavía no hay Administrador principal, la primera cuenta del panel queda como principal (AP-011 c1).
async function crearRol(cliente, rol) {
  await cliente.query(
    `INSERT INTO rol_aplicacion (nombre)
     SELECT $1::varchar WHERE NOT EXISTS (SELECT 1 FROM rol_aplicacion WHERE lower(nombre) = $1)`,
    [rol]
  );
  const { rows } = await cliente.query('SELECT id FROM rol_aplicacion WHERE lower(nombre) = $1', [rol]);
  return rows[0].id;
}

/** Crea el usuario en Supabase Auth con una invitación para definir la contraseña. */
async function crearEnAuth(correo, nombre) {
  if (!supabaseAdmin) throw new Error('Falta SUPABASE_SERVICE_ROLE_KEY en .env para crear cuentas.');
  const appUrl = process.env.APP_URL || `http://localhost:${process.env.PORT || 3000}`;
  const { data, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(correo, {
    redirectTo: `${appUrl}/recuperar/nueva`, data: { nombre, cuenta_panel: true },
  });
  if (error) throw new Error(`Supabase no pudo crear la cuenta: ${error.message}`);
  return data.user.id;
}

async function hacerAdmin(correo, { superAdmin, reemplazar, nombre }) {
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    const idAdmin = await crearRol(cliente, 'administrador');
    const idSuper = await crearRol(cliente, 'superadministrador');

    if (nombre) {
      const usado = await cliente.query('SELECT 1 FROM usuario WHERE lower(correo) = lower($1) OR lower(correo_secundario) = lower($1)', [correo]);
      if (usado.rowCount > 0) {
        await cliente.query('ROLLBACK');
        return console.log(`❌ ${correo} ya pertenece a otra cuenta.`);
      }
      const authId = await crearEnAuth(correo, nombre);
      await cliente.query(
        `INSERT INTO usuario (auth_id, correo, id_rol_aplicacion, activo, admin_nombre, admin_seleccionado_en)
         VALUES ($1, $2, $3, TRUE, $4, now())`,
        [authId, correo, idAdmin, nombre]
      );
      console.log(`📧 Invitación enviada a ${correo} para definir su contraseña.`);
    }

    const cuenta = await cliente.query('SELECT id FROM usuario WHERE lower(correo) = lower($1)', [correo]);
    if (cuenta.rowCount === 0) {
      await cliente.query('ROLLBACK');
      return console.log(`❌ No hay una cuenta con ${correo}. Usa --crear "Nombre" para crearla.`);
    }
    const hayPrincipal = (await cliente.query('SELECT id, correo FROM usuario WHERE id_rol_aplicacion = $1 AND id <> $2', [idSuper, cuenta.rows[0].id]));
    const seraPrincipal = superAdmin || hayPrincipal.rowCount === 0;

    if (seraPrincipal && hayPrincipal.rowCount > 0) {
      if (!reemplazar) {
        await cliente.query('ROLLBACK');
        return console.log(`❌ Ya existe un Administrador principal (${hayPrincipal.rows[0].correo}). `
          + 'Usa --reemplazar para traspasarle el rol (el anterior quedará como Administrador).');
      }
      await cliente.query('UPDATE usuario SET id_rol_aplicacion = $1 WHERE id = $2', [idAdmin, hayPrincipal.rows[0].id]);
      console.log(`ℹ️  ${hayPrincipal.rows[0].correo} pasa a ser Administrador.`);
    }

    await cliente.query(
      `UPDATE usuario SET id_rol_aplicacion = $1, admin_revocado_en = NULL, admin_seleccionado_en = coalesce(admin_seleccionado_en, now())
        WHERE id = $2`,
      [seraPrincipal ? idSuper : idAdmin, cuenta.rows[0].id]
    );
    await cliente.query('COMMIT');
    console.log(seraPrincipal
      ? `✅ ${correo} es el Administrador principal: ingresa en /admin/login.`
      : `✅ ${correo} es Administrador: ingresa en /admin/login.`);
  } catch (err) {
    await cliente.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    cliente.release();
  }
}

const args = process.argv.slice(2);
const correo = args.find((arg) => arg.includes('@'));
const iCrear = args.indexOf('--crear');
const nombre = iCrear >= 0 ? args[iCrear + 1] : null;
if (!correo || (iCrear >= 0 && !nombre)) {
  console.error('Uso: node scripts/hacer-admin.js correo@ejemplo.com [--crear "Nombre"] [--super [--reemplazar]]');
  process.exit(1);
}
hacerAdmin(correo, { superAdmin: args.includes('--super'), reemplazar: args.includes('--reemplazar'), nombre })
  .catch((err) => {
    console.error('❌', err.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
