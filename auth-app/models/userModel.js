const { pool } = require('../config/db');
const { supabaseAdmin } = require('../config/supabase');

const ROL_POR_DEFECTO = 'jugador';

function registrarEnAuth(supabase, { correo, password, nombre, apellido, telefono, urlRedireccion }) {
  return supabase.auth.signUp({
    email: correo,
    password,
    options: {
      data: { nombre, apellido, telefono },
      emailRedirectTo: urlRedireccion,
    },
  });
}

function iniciarSesionEnAuth(supabase, { correo, password }) {
  return supabase.auth.signInWithPassword({ email: correo, password });
}

function obtenerUsuarioActual(supabase) {
  return supabase.auth.getUser();
}

function confirmarCorreoEnAuth(supabase, { code, tokenHash, type }) {
  if (tokenHash && type) {
    return supabase.auth.verifyOtp({ token_hash: tokenHash, type });
  }
  return supabase.auth.exchangeCodeForSession(code);
}

// AR-007: nuevo enlace de verificación del registro (Supabase no revela si el correo existe).
function reenviarVerificacionEnAuth(supabase, correo, urlRedireccion) {
  return supabase.auth.resend({ type: 'signup', email: correo, options: { emailRedirectTo: urlRedireccion } });
}

function guardarRolInicio(supabase, rol) {
  return supabase.auth.updateUser({ data: { rol_inicio: rol } });
}

function cerrarSesionEnAuth(supabase) {
  return supabase.auth.signOut({ scope: 'local' });
}

async function eliminarDeAuth(authId) {
  if (!supabaseAdmin) return false;
  const { error } = await supabaseAdmin.auth.admin.deleteUser(authId);
  return !error;
}

async function findByEmail(correo) {
  const consulta = 'SELECT id, correo, auth_id FROM usuario WHERE lower(correo) = lower($1)';
  const resultado = await pool.query(consulta, [correo]);
  return resultado.rows[0];
}

async function findByAuthId(authId) {
  const consulta = `
    SELECT u.id, u.correo, u.telefono, j.nombre_apodo AS nombre, j.apellido, j.fecha_nacimiento,
           u.activo, -- CORRECCIÓN: regla 7 (cuenta inactiva no entra)
           (SELECT r.nombre FROM rol_aplicacion r WHERE r.id = u.id_rol_aplicacion) AS rol, -- NUEVO: AR-004
           u.terminos_version, u.privacidad_version, -- NUEVO: AR-011
           u.admin_revocado_en, u.admin_nombre -- AP-001 / AP-011: cuentas del panel
    FROM usuario u
    LEFT JOIN jugador j ON j.id_usuario = u.id
    WHERE u.auth_id = $1
  `;
  const resultado = await pool.query(consulta, [authId]);
  return resultado.rows[0];
}

async function create({ authId, nombre, apellido, correo, correoSecundario = null, telefono, fechaNacimiento }) {
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');

    const rol = await cliente.query(
      'SELECT id FROM rol_aplicacion WHERE lower(nombre) = lower($1) LIMIT 1',
      [ROL_POR_DEFECTO]
    );
    if (rol.rowCount === 0) {
      throw new Error(`No existe el rol '${ROL_POR_DEFECTO}' en la tabla rol_aplicacion.`);
    }

    const usuario = await cliente.query(
      `INSERT INTO usuario (auth_id, correo, correo_secundario, telefono, id_rol_aplicacion)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [authId, correo, correoSecundario, telefono, rol.rows[0].id]
    );
    const idUsuario = usuario.rows[0].id;

    await cliente.query(
      `INSERT INTO jugador (nombre_apodo, apellido, fecha_nacimiento, id_usuario)
       VALUES ($1, $2, $3, $4)`,
      [nombre, apellido, fechaNacimiento, idUsuario]
    );

    await cliente.query('COMMIT');
    return { id: idUsuario };
  } catch (err) {
    await cliente.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    cliente.release();
  }
}

module.exports = {
  registrarEnAuth,
  iniciarSesionEnAuth,
  obtenerUsuarioActual,
  confirmarCorreoEnAuth,
  reenviarVerificacionEnAuth,
  guardarRolInicio,
  cerrarSesionEnAuth,
  eliminarDeAuth,
  findByEmail,
  findByAuthId,
  create,
};
