// models/userModel.js
// Acceso a datos del usuario. Es la ÚNICA capa que habla con:
//  - Supabase Auth (registro, login, verificación de tokens, logout).
//  - Las tablas "usuario" y "jugador" de PostgreSQL (ver sql/seed.sql).
// Todas las consultas SQL son parametrizadas ($1, $2...) para evitar inyección SQL.

const { pool } = require('../config/db');
const { supabaseAdmin } = require('../config/supabase');

// Rol con el que se crea toda cuenta nueva (catálogo rol_aplicacion).
const ROL_POR_DEFECTO = 'jugador';

/* =====================================================================
   Supabase Auth
   Cada función recibe el cliente de la petición (req.supabase, creado con
   @supabase/ssr), que lee y escribe las cookies de sesión por su cuenta.
   Devuelven { data, error } tal como lo entrega supabase-js, para que el
   controlador decida qué mensaje mostrar.
   ===================================================================== */

/**
 * Crea la cuenta en Supabase Auth. Nombre, apellido y teléfono también
 * quedan en user_metadata como respaldo.
 */
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

/**
 * Devuelve el usuario de la sesión guardada en las cookies, verificado contra
 * Supabase. Si el access token expiró, lo renueva con el refresh token.
 */
function obtenerUsuarioActual(supabase) {
  return supabase.auth.getUser();
}

/**
 * Confirma el correo desde el enlace del email:
 *  - code: flujo PKCE (enlace por defecto de Supabase, mismo navegador).
 *  - tokenHash + type: plantilla de correo con token_hash (cualquier navegador).
 */
function confirmarCorreoEnAuth(supabase, { code, tokenHash, type }) {
  if (tokenHash && type) {
    return supabase.auth.verifyOtp({ token_hash: tokenHash, type });
  }
  return supabase.auth.exchangeCodeForSession(code);
}

/** Revoca la sesión en Supabase y borra las cookies de esta sesión. */
function cerrarSesionEnAuth(supabase) {
  return supabase.auth.signOut({ scope: 'local' });
}

/**
 * Borra una cuenta de Auth. Solo funciona si hay SUPABASE_SERVICE_ROLE_KEY;
 * se usa para no dejar cuentas "huérfanas" si falla el guardado del perfil.
 */
async function eliminarDeAuth(authId) {
  if (!supabaseAdmin) return false;
  const { error } = await supabaseAdmin.auth.admin.deleteUser(authId);
  return !error;
}

/* =====================================================================
   Tablas usuario / jugador
   ===================================================================== */

/**
 * Busca un perfil por correo.
 * @returns {Promise<object|undefined>}
 */
async function findByEmail(correo) {
  const consulta = 'SELECT id, correo, auth_id FROM usuario WHERE lower(correo) = lower($1)';
  const resultado = await pool.query(consulta, [correo]);
  return resultado.rows[0];
}

/**
 * Busca el perfil (usuario + jugador) vinculado a una cuenta de Supabase Auth.
 * @param {string} authId - UUID de auth.users.
 * @returns {Promise<object|undefined>}
 */
async function findByAuthId(authId) {
  const consulta = `
    SELECT u.id, u.correo, u.telefono, j.nombre_apodo AS nombre, j.apellido, j.fecha_nacimiento
    FROM usuario u
    LEFT JOIN jugador j ON j.id_usuario = u.id
    WHERE u.auth_id = $1
  `;
  const resultado = await pool.query(consulta, [authId]);
  return resultado.rows[0];
}

/**
 * Crea el perfil en "usuario" y "jugador" dentro de UNA transacción (DATABASE_URL):
 * si falla cualquier paso se hace ROLLBACK y no queda ninguna fila a medias.
 * @param {{authId: string, nombre: string, apellido: string, correo: string,
 *          telefono: string, fechaNacimiento: string}} datos
 *        fechaNacimiento en formato AAAA-MM-DD (ya validada).
 * @returns {Promise<{id: number}>} El id del registro en "usuario".
 */
async function create({ authId, nombre, apellido, correo, telefono, fechaNacimiento }) {
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');

    // 1) Rol "jugador" (sin importar mayúsculas: 'jugador' o 'Jugador').
    const rol = await cliente.query(
      'SELECT id FROM rol_aplicacion WHERE lower(nombre) = lower($1) LIMIT 1',
      [ROL_POR_DEFECTO]
    );
    if (rol.rowCount === 0) {
      throw new Error(`No existe el rol '${ROL_POR_DEFECTO}' en la tabla rol_aplicacion.`);
    }

    // 2) Fila en "usuario" vinculada a la cuenta de Supabase Auth.
    const usuario = await cliente.query(
      `INSERT INTO usuario (auth_id, correo, telefono, id_rol_aplicacion)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [authId, correo, telefono, rol.rows[0].id]
    );
    const idUsuario = usuario.rows[0].id;

    // 3) Fila en "jugador" con los datos personales.
    await cliente.query(
      `INSERT INTO jugador (nombre_apodo, apellido, fecha_nacimiento, id_usuario)
       VALUES ($1, $2, $3, $4)`,
      [nombre, apellido, fechaNacimiento, idUsuario]
    );

    await cliente.query('COMMIT');
    return { id: idUsuario };
  } catch (err) {
    // Si el ROLLBACK también falla (conexión caída), igual se propaga el error original.
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
  cerrarSesionEnAuth,
  eliminarDeAuth,
  findByEmail,
  findByAuthId,
  create,
};
