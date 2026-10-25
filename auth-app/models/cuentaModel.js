const { pool } = require('../config/db');
const { crearClienteTemporal } = require('../config/supabase');

async function guardarAceptacion(authId, { terminos, privacidad }) {
  await pool.query(
    `UPDATE usuario
        SET terminos_version = $2, privacidad_version = $3, terminos_aceptados_en = now()
      WHERE auth_id = $1`,
    [authId, terminos, privacidad]
  );
}

async function obtenerDatosCuenta(authId) {
  const { rows } = await pool.query(
    `SELECT correo, correo_secundario, telefono, terminos_version, privacidad_version, terminos_aceptados_en
       FROM usuario WHERE auth_id = $1`,
    [authId]
  );
  const fila = rows[0];
  if (!fila) return null;
  return {
    correo: fila.correo,
    correoSecundario: fila.correo_secundario || '',
    telefono: fila.telefono || '',
    terminosVersion: fila.terminos_version,
    privacidadVersion: fila.privacidad_version,
    aceptadoEn: fila.terminos_aceptados_en,
  };
}

async function correoUsadoPorOtraCuenta(correo, authId) {
  const { rowCount } = await pool.query(
    `SELECT 1 FROM usuario
      WHERE (lower(correo) = lower($1) OR lower(correo_secundario) = lower($1))
        AND auth_id IS DISTINCT FROM $2`,
    [correo, authId]
  );
  return rowCount > 0;
}

async function actualizarContacto(authId, { correoSecundario, telefono }) {
  await pool.query('UPDATE usuario SET correo_secundario = $2, telefono = $3 WHERE auth_id = $1', [
    authId,
    correoSecundario || null,
    telefono,
  ]);
}

async function sincronizarCorreo(authId, correo) {
  await pool.query('UPDATE usuario SET correo = $2 WHERE auth_id = $1', [authId, correo]);
}

async function correoPrincipalParaRecuperar(correo) {
  const { rows } = await pool.query(
    `SELECT correo FROM usuario
      WHERE activo AND (lower(correo) = lower($1) OR lower(correo_secundario) = lower($1))
      LIMIT 1`,
    [correo]
  );
  return rows[0] ? rows[0].correo : null;
}

function enviarEnlaceRecuperacion(supabase, correo, urlRedireccion) {
  return supabase.auth.resetPasswordForEmail(correo, { redirectTo: urlRedireccion });
}

function validarEnlaceRecuperacion(supabase, { code, tokenHash }) {
  if (tokenHash) return supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'recovery' });
  return supabase.auth.exchangeCodeForSession(code);
}

async function passwordEsCorrecta(correo, password) {
  const cliente = crearClienteTemporal();
  const { error } = await cliente.auth.signInWithPassword({ email: correo, password });
  if (!error) await cliente.auth.signOut({ scope: 'local' }).catch(() => {});
  return !error;
}

function cambiarPassword(supabase, password) {
  return supabase.auth.updateUser({ password });
}

function solicitarCambioCorreo(supabase, correo, urlRedireccion) {
  return supabase.auth.updateUser({ email: correo }, { emailRedirectTo: urlRedireccion });
}

async function equiposActivosComoCapitan(authId) {
  const { rows } = await pool.query(
    `SELECT e.id, e.nombre FROM equipo e JOIN usuario u ON u.id = e.id_usuario_creador WHERE u.auth_id = $1 AND e.activo ORDER BY e.nombre`,
    [authId]
  );
  return rows;
}

async function desactivarCuenta(authId) {
  await pool.query('UPDATE usuario SET activo = FALSE WHERE auth_id = $1', [authId]);
}

module.exports = {
  equiposActivosComoCapitan,
  desactivarCuenta,
  guardarAceptacion,
  obtenerDatosCuenta,
  correoUsadoPorOtraCuenta,
  actualizarContacto,
  sincronizarCorreo,
  correoPrincipalParaRecuperar,
  enviarEnlaceRecuperacion,
  validarEnlaceRecuperacion,
  passwordEsCorrecta,
  cambiarPassword,
  solicitarCambioCorreo,
};
