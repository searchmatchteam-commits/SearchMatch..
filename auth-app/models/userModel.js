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

// Inicio con Google (OAuth, PKCE): el cliente de @supabase/ssr guarda el code verifier en una
// cookie y devuelve la URL de Google; /auth/callback cambia el código por la sesión.
function urlInicioConGoogle(supabase, urlRedireccion) {
  return supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: urlRedireccion, skipBrowserRedirect: true },
  });
}

function canjearCodigoOAuth(supabase, code) {
  return supabase.auth.exchangeCodeForSession(code);
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
    SELECT u.id, u.correo, u.telefono, j.id AS id_jugador, j.nombre_apodo AS nombre, j.apellido, j.fecha_nacimiento,
           u.activo, -- CORRECCIÓN: regla 7 (cuenta inactiva no entra)
           (SELECT r.nombre FROM rol_aplicacion r WHERE r.id = u.id_rol_aplicacion) AS rol, -- NUEVO: AR-004
           u.terminos_version, u.privacidad_version, -- NUEVO: AR-011
           u.admin_revocado_en, u.admin_nombre, -- AP-001 / AP-011: cuentas del panel
           (SELECT count(*)::int FROM notificacion n WHERE n.id_usuario = u.id AND NOT n.leida) AS sin_leer -- NT-002
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

    const jugador = await cliente.query(
      `INSERT INTO jugador (nombre_apodo, apellido, fecha_nacimiento, id_usuario)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [nombre, apellido, fechaNacimiento, idUsuario]
    );

    await cliente.query('COMMIT');
    return { id: idUsuario, idJugador: jugador.rows[0].id };
  } catch (err) {
    await cliente.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    cliente.release();
  }
}

// Fecha de nacimiento de quien se registró con Google (llega sin ella): se pide en /aceptar-terminos.
async function guardarFechaNacimiento(authId, fechaNacimiento) {
  await pool.query(
    `UPDATE jugador j SET fecha_nacimiento = $2
       FROM usuario u
      WHERE j.id_usuario = u.id AND u.auth_id = $1`,
    [authId, fechaNacimiento]
  );
}

// /completar-perfil: datos que Google no entrega (fecha, altura, peso y posición principal).
async function completarPerfil(authId, { fechaNacimiento, altura, peso, posicionDb }) {
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    const jugador = await cliente.query(
      `UPDATE jugador j SET fecha_nacimiento = $2, altura = $3, peso = $4
         FROM usuario u
        WHERE j.id_usuario = u.id AND u.auth_id = $1
        RETURNING j.id`,
      [authId, fechaNacimiento, altura, peso]
    );
    if (jugador.rowCount === 0) throw new Error('El usuario no tiene perfil de jugador.');
    const idJugador = jugador.rows[0].id;

    await cliente.query('DELETE FROM jugador_posicion WHERE id_jugador = $1', [idJugador]);
    await cliente.query(
      `INSERT INTO jugador_posicion (id_jugador, id_posicion)
       SELECT $1, id FROM posicion WHERE lower(nombre) = ANY($2) ORDER BY id LIMIT 1`,
      [idJugador, posicionDb.map((n) => n.toLowerCase())]
    );

    await cliente.query('COMMIT');
  } catch (err) {
    await cliente.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    cliente.release();
  }
}

module.exports = {
  guardarFechaNacimiento,
  completarPerfil,
  registrarEnAuth,
  iniciarSesionEnAuth,
  urlInicioConGoogle,
  canjearCodigoOAuth,
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
