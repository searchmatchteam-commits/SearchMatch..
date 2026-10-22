// models/cuentaModel.js
// Datos de la cuenta (tabla "usuario" y Supabase Auth) para la Fase 1:
//  - AR-011: guardar qué versión de términos y privacidad aceptó la cuenta.
//  - AR-008: encontrar la cuenta por su correo principal o secundario y enviar el enlace de recuperación.
//  - AR-009 / AR-012: comprobar la contraseña actual, cambiarla y editar correo y teléfono.
// Todas las consultas SQL son parametrizadas ($1, $2...).

const { pool } = require('../config/db');
const { crearClienteTemporal } = require('../config/supabase');

/* =====================================================================
   AR-011 · Aceptación de términos
   ===================================================================== */

/**
 * Guarda la versión aceptada de cada documento y la fecha (ahora).
 * @param {string} authId - UUID de auth.users.
 * @param {{terminos: string, privacidad: string}} versiones
 */
async function guardarAceptacion(authId, { terminos, privacidad }) {
  await pool.query(
    `UPDATE usuario
        SET terminos_version = $2, privacidad_version = $3, terminos_aceptados_en = now()
      WHERE auth_id = $1`,
    [authId, terminos, privacidad]
  );
}

/* =====================================================================
   AR-012 · Datos de la cuenta
   ===================================================================== */

/**
 * Datos de contacto de la cuenta (solo los ve su dueño, en /cuenta).
 * @returns {Promise<{correo, correoSecundario, telefono, terminosVersion, privacidadVersion, aceptadoEn}|null>}
 */
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

/**
 * ¿Otra cuenta (distinta de authId) ya usa este correo como principal o secundario?
 * @returns {Promise<boolean>}
 */
async function correoUsadoPorOtraCuenta(correo, authId) {
  const { rowCount } = await pool.query(
    `SELECT 1 FROM usuario
      WHERE (lower(correo) = lower($1) OR lower(correo_secundario) = lower($1))
        AND auth_id IS DISTINCT FROM $2`,
    [correo, authId]
  );
  return rowCount > 0;
}

/** Guarda el correo secundario (o null) y el teléfono de la cuenta. */
async function actualizarContacto(authId, { correoSecundario, telefono }) {
  await pool.query('UPDATE usuario SET correo_secundario = $2, telefono = $3 WHERE auth_id = $1', [
    authId,
    correoSecundario || null,
    telefono,
  ]);
}

/** Copia a "usuario" el correo principal que ya confirmó en Supabase Auth. */
async function sincronizarCorreo(authId, correo) {
  await pool.query('UPDATE usuario SET correo = $2 WHERE auth_id = $1', [authId, correo]);
}

/* =====================================================================
   AR-008 · Recuperar contraseña
   ===================================================================== */

/**
 * Correo principal de la cuenta ACTIVA que usa este correo como principal o secundario.
 * Supabase envía el enlace al correo principal (es el que conoce Auth).
 * @returns {Promise<string|null>}
 */
async function correoPrincipalParaRecuperar(correo) {
  const { rows } = await pool.query(
    `SELECT correo FROM usuario
      WHERE activo AND (lower(correo) = lower($1) OR lower(correo_secundario) = lower($1))
      LIMIT 1`,
    [correo]
  );
  return rows[0] ? rows[0].correo : null;
}

/**
 * Pide a Supabase que envíe el correo con el enlace para crear una contraseña nueva.
 * @param {object} supabase - Cliente de la petición (guarda en cookies el dato que valida el enlace).
 */
function enviarEnlaceRecuperacion(supabase, correo, urlRedireccion) {
  return supabase.auth.resetPasswordForEmail(correo, { redirectTo: urlRedireccion });
}

/**
 * Valida el enlace del correo y abre una sesión temporal para poner la contraseña nueva.
 *  - code: enlace por defecto de Supabase (mismo navegador).
 *  - tokenHash: plantilla con token_hash (cualquier navegador).
 */
function validarEnlaceRecuperacion(supabase, { code, tokenHash }) {
  if (tokenHash) return supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'recovery' });
  return supabase.auth.exchangeCodeForSession(code);
}

/* =====================================================================
   AR-009 / AR-012 · Contraseña
   ===================================================================== */

/**
 * ¿La contraseña es la actual de este correo? Usa un cliente temporal: no toca la sesión del navegador.
 * @returns {Promise<boolean>}
 */
async function passwordEsCorrecta(correo, password) {
  const cliente = crearClienteTemporal();
  const { error } = await cliente.auth.signInWithPassword({ email: correo, password });
  if (!error) await cliente.auth.signOut({ scope: 'local' }).catch(() => {});
  return !error;
}

/** Cambia la contraseña de la cuenta de la sesión (Supabase invalida la anterior). */
function cambiarPassword(supabase, password) {
  return supabase.auth.updateUser({ password });
}

/** Pide cambiar el correo principal: Supabase envía un enlace de confirmación al correo nuevo. */
function solicitarCambioCorreo(supabase, correo, urlRedireccion) {
  return supabase.auth.updateUser({ email: correo }, { emailRedirectTo: urlRedireccion });
}

module.exports = {
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
