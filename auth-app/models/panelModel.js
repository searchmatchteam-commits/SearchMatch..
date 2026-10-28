// models/panelModel.js
// Acceso al panel de administración (AP-001) y gestión de administradores (AP-011).
// Tablas: usuario (columnas admin_*), admin_sesion y admin_intento (sql/nuevas_tablas.sql SA-6).
//  - La sesión del panel es aparte de la de Supabase: la cookie guarda un token al azar y aquí solo su SHA-256.
//  - Los intentos fallidos se cuentan por correo (exista o no la cuenta).
//  - El "Administrador principal" es el rol superadministrador (uno solo: índice ux_un_solo_superadmin).

const crypto = require('crypto');
const { pool } = require('../config/db');
const { ACCESO } = require('../config/panel');
const { construirSQL } = require('../config/listados');
const actividad = require('./actividadModel');

const ROLES_PANEL = ['administrador', 'superadministrador'];

function hash(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

async function enTransaccion(fn) {
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    const resultado = await fn(cliente);
    await cliente.query('COMMIT');
    return resultado;
  } catch (err) {
    await cliente.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    cliente.release();
  }
}

// ---------- Sesiones del panel ----------

/** Abre una sesión del panel. @returns {Promise<string>} token para la cookie. */
async function abrirSesion(idUsuario) {
  const token = crypto.randomBytes(32).toString('hex');
  await pool.query('INSERT INTO admin_sesion (token_hash, id_usuario) VALUES ($1, $2)', [hash(token), idUsuario]);
  return token;
}

/**
 * Comprueba la sesión y, si sigue vigente, renueva su última actividad.
 * @returns {Promise<'vigente'|'vencida'|'invalida'>} vencida = pasó el tiempo de inactividad (queda cerrada).
 */
async function tocarSesion(token, idUsuario) {
  if (!token || !idUsuario) return 'invalida';
  const { rowCount } = await pool.query(
    `UPDATE admin_sesion SET ultima_actividad = now()
      WHERE token_hash = $1 AND id_usuario = $2 AND cerrada_en IS NULL
        AND ultima_actividad > now() - make_interval(mins => $3)`,
    [hash(token), idUsuario, ACCESO.inactividadMin]
  );
  if (rowCount > 0) return 'vigente';
  const vencida = await pool.query(
    `UPDATE admin_sesion SET cerrada_en = now(), motivo_cierre = 'inactividad'
      WHERE token_hash = $1 AND id_usuario = $2 AND cerrada_en IS NULL`,
    [hash(token), idUsuario]
  );
  return vencida.rowCount > 0 ? 'vencida' : 'invalida';
}

async function cerrarSesion(token, motivo = 'salida') {
  if (!token) return;
  await pool.query(
    'UPDATE admin_sesion SET cerrada_en = now(), motivo_cierre = $2 WHERE token_hash = $1 AND cerrada_en IS NULL',
    [hash(token), motivo]
  );
}

/** Cierra todas las sesiones abiertas de una cuenta (revocación, traspaso). */
async function cerrarSesionesDe(cliente, idUsuario, motivo) {
  await cliente.query(
    'UPDATE admin_sesion SET cerrada_en = now(), motivo_cierre = $2 WHERE id_usuario = $1 AND cerrada_en IS NULL',
    [idUsuario, motivo]
  );
}

// ---------- Intentos fallidos (bloqueo de 15 minutos) ----------

function normalizarCorreo(correo) {
  return String(correo || '').trim().toLowerCase().slice(0, 150);
}

/** ¿El correo está bloqueado ahora? */
async function bloqueado(correo) {
  const { rows } = await pool.query(
    'SELECT 1 FROM admin_intento WHERE correo = $1 AND bloqueado_hasta > now()',
    [normalizarCorreo(correo)]
  );
  return rows.length > 0;
}

/**
 * Suma un intento fallido. Al llegar al máximo, bloquea el correo y reinicia la cuenta.
 * Es una sola sentencia (INSERT ... ON CONFLICT): dos intentos simultáneos no se pisan.
 * @returns {Promise<boolean>} true si este intento dejó el correo bloqueado.
 */
async function registrarFallo(correo) {
  const { rows } = await pool.query(
    `INSERT INTO admin_intento (correo, fallidos, actualizado_en) VALUES ($1, 1, now())
     ON CONFLICT (correo) DO UPDATE
        SET fallidos = CASE WHEN admin_intento.fallidos + 1 >= $2 THEN 0 ELSE admin_intento.fallidos + 1 END,
            bloqueado_hasta = CASE WHEN admin_intento.fallidos + 1 >= $2 THEN now() + make_interval(mins => $3)
                                   ELSE admin_intento.bloqueado_hasta END,
            actualizado_en = now()
     RETURNING fallidos = 0 AND bloqueado_hasta > now() AS recien_bloqueado`,
    [normalizarCorreo(correo), ACCESO.maxFallidos, ACCESO.bloqueoMin]
  );
  return rows[0].recien_bloqueado;
}

async function reiniciarFallos(correo) {
  await pool.query('UPDATE admin_intento SET fallidos = 0, bloqueado_hasta = NULL WHERE correo = $1', [normalizarCorreo(correo)]);
}

// ---------- Cuentas del panel ----------

const SELECT_ADMIN = `
  SELECT u.id, u.auth_id, u.correo, u.activo, lower(r.nombre) AS rol,
         coalesce(nullif(u.admin_nombre, ''), trim(concat_ws(' ', j.nombre_apodo, j.apellido)), u.correo) AS nombre,
         u.admin_seleccionado_en, u.admin_revocado_en,
         (SELECT max(s.ultima_actividad) FROM admin_sesion s WHERE s.id_usuario = u.id) AS ultimo_acceso,
         sel.correo AS seleccionado_por
    FROM usuario u
    JOIN rol_aplicacion r ON r.id = u.id_rol_aplicacion
    LEFT JOIN jugador j ON j.id_usuario = u.id
    LEFT JOIN usuario sel ON sel.id = u.admin_seleccionado_por`;

function aAdmin(f) {
  const estado = !f.activo ? 'inactiva' : f.admin_revocado_en ? 'revocado' : 'activo';
  return {
    id: f.id,
    authId: f.auth_id,
    correo: f.correo,
    nombre: f.nombre,
    esPrincipal: f.rol === 'superadministrador',
    rolTexto: f.rol === 'superadministrador' ? 'Administrador principal' : 'Administrador',
    estado,
    estadoTexto: { activo: 'Activo', revocado: 'Revocado', inactiva: 'Cuenta desactivada' }[estado],
    seleccionadoEn: f.admin_seleccionado_en,
    seleccionadoPor: f.seleccionado_por,
    revocadoEn: f.admin_revocado_en,
    ultimoAcceso: f.ultimo_acceso,
  };
}

/** Cuenta del panel por su id de Supabase Auth (null si no es una cuenta del panel). */
async function cuentaPorAuth(authId) {
  const { rows } = await pool.query(`${SELECT_ADMIN} WHERE u.auth_id = $1 AND lower(r.nombre) = ANY($2::text[])`, [authId, ROLES_PANEL]);
  return rows[0] ? aAdmin(rows[0]) : null;
}

async function obtener(idUsuario) {
  const { rows } = await pool.query(`${SELECT_ADMIN} WHERE u.id = $1 AND lower(r.nombre) = ANY($2::text[])`, [idUsuario, ROLES_PANEL]);
  return rows[0] ? aAdmin(rows[0]) : null;
}

/** Id de "usuario" del Administrador principal (para avisarle). */
async function idPrincipal() {
  const { rows } = await pool.query(
    `SELECT u.id FROM usuario u JOIN rol_aplicacion r ON r.id = u.id_rol_aplicacion WHERE lower(r.nombre) = 'superadministrador' LIMIT 1`
  );
  return rows[0] ? rows[0].id : null;
}

// Listado de administradores (AP-011 / AP-003)
const LISTADO = {
  buscar: ['u.correo', "coalesce(u.admin_nombre, '')"],
  filtros: {
    estado: {
      etiqueta: 'Estado',
      tipo: 'opcion',
      opciones: {
        activo: { texto: 'Activo', sql: 'u.activo AND u.admin_revocado_en IS NULL' },
        revocado: { texto: 'Revocado', sql: 'u.admin_revocado_en IS NOT NULL' },
      },
    },
    desde: { etiqueta: 'Seleccionado desde', tipo: 'fecha', sql: "(u.admin_seleccionado_en AT TIME ZONE 'America/Santiago')::date >= ?::date" },
    hasta: { etiqueta: 'Seleccionado hasta', tipo: 'fecha', sql: "(u.admin_seleccionado_en AT TIME ZONE 'America/Santiago')::date <= ?::date" },
  },
  orden: {
    nombre: "lower(coalesce(nullif(u.admin_nombre, ''), u.correo))",
    correo: 'lower(u.correo)',
    estado: '(u.admin_revocado_en IS NOT NULL)',
    acceso: '(SELECT max(s.ultima_actividad) FROM admin_sesion s WHERE s.id_usuario = u.id)',
    seleccion: 'u.admin_seleccionado_en',
  },
  ordenDefecto: 'seleccion',
  dirDefecto: 'desc',
  desempate: 'u.id',
};

async function listar(estado, { todo = false } = {}) {
  const s = construirSQL(estado, LISTADO, [ROLES_PANEL]);
  const { rows } = await pool.query(
    `${SELECT_ADMIN.replace('SELECT u.id,', 'SELECT count(*) OVER()::int AS total, u.id,')}
      WHERE lower(r.nombre) = ANY($1::text[]) AND ${s.where}
      ORDER BY ${s.orderBy}
      ${todo ? '' : s.limite}`,
    todo ? s.params : [...s.params, ...s.paramsPagina]
  );
  return { filas: rows.map(aAdmin), total: rows[0] ? rows[0].total : 0 };
}

/** ¿Existe ya una cuenta (de jugador o del panel) con ese correo? */
async function correoEnUso(correo) {
  const { rows } = await pool.query(
    'SELECT 1 FROM usuario WHERE lower(correo) = lower($1) OR lower(correo_secundario) = lower($1) LIMIT 1',
    [correo]
  );
  return rows.length > 0;
}

/**
 * AP-011 · Crea la fila de una cuenta de administrador recién creada en Supabase Auth.
 * @param {{id:number, nombre:string}} principal - Quien la selecciona (para el registro).
 * @returns {Promise<'creado'|'correo-en-uso'>}
 */
async function crearAdministrador(principal, { authId, nombre, correo }) {
  return enTransaccion(async (cliente) => {
    const rol = await cliente.query(`SELECT id FROM rol_aplicacion WHERE lower(nombre) = 'administrador'`);
    const { rows } = await cliente.query(
      `INSERT INTO usuario (auth_id, correo, id_rol_aplicacion, activo, admin_nombre, admin_seleccionado_en, admin_seleccionado_por)
       SELECT $1, $2::varchar, $3, TRUE, $4::varchar, now(), $5
        WHERE NOT EXISTS (SELECT 1 FROM usuario WHERE lower(correo) = lower($2::varchar) OR lower(correo_secundario) = lower($2::varchar))
       RETURNING id`,
      [authId, correo, rol.rows[0].id, nombre, principal.id]
    );
    if (!rows[0]) return 'correo-en-uso';
    await actividad.registrar(cliente, {
      admin: principal, seccion: 'administradores', accion: 'Crear administrador',
      elementoTipo: 'usuario', elementoId: rows[0].id, elemento: `${nombre} <${correo}>`,
      nuevo: { nombre, correo, rol: 'Administrador', estado: 'Activo' },
    });
    return 'creado';
  });
}

/**
 * AP-011 · Revoca o reactiva el acceso de un administrador (nunca del principal ni de uno mismo).
 * Al revocar se cierran todas sus sesiones del panel.
 * @returns {Promise<'revocado'|'reactivado'|'inexistente'|'principal'|'propia'|'sin-cambio'>}
 */
async function cambiarAcceso(principal, idUsuario, revocar, motivo) {
  return enTransaccion(async (cliente) => {
    const { rows } = await cliente.query(
      `SELECT u.id, u.correo, u.admin_revocado_en, lower(r.nombre) AS rol, coalesce(u.admin_nombre, u.correo) AS nombre
         FROM usuario u JOIN rol_aplicacion r ON r.id = u.id_rol_aplicacion
        WHERE u.id = $1 AND lower(r.nombre) = ANY($2::text[])
        FOR UPDATE OF u`,
      [idUsuario, ROLES_PANEL]
    );
    const admin = rows[0];
    if (!admin) return 'inexistente';
    if (admin.id === principal.id) return 'propia';
    if (admin.rol === 'superadministrador') return 'principal';
    if (Boolean(admin.admin_revocado_en) === revocar) return 'sin-cambio';
    await cliente.query(
      `UPDATE usuario SET admin_revocado_en = ${revocar ? 'now()' : 'NULL'} WHERE id = $1`,
      [idUsuario]
    );
    if (revocar) await cerrarSesionesDe(cliente, idUsuario, 'revocado');
    await actividad.registrar(cliente, {
      admin: principal, seccion: 'administradores', accion: revocar ? 'Revocar acceso' : 'Reactivar acceso',
      elementoTipo: 'usuario', elementoId: idUsuario, elemento: `${admin.nombre} <${admin.correo}>`, motivo,
      anterior: { estado: revocar ? 'Activo' : 'Revocado' }, nuevo: { estado: revocar ? 'Revocado' : 'Activo' },
    });
    return revocar ? 'revocado' : 'reactivado';
  });
}

/**
 * AP-011 · Traspasa el rol de Administrador principal a otro administrador activo.
 * El índice ux_un_solo_superadmin exige bajar primero al actual y después subir al nuevo.
 * @returns {Promise<'traspasado'|'inexistente'|'no-disponible'|'propia'>}
 */
async function traspasarPrincipal(principal, idNuevo, motivo) {
  return enTransaccion(async (cliente) => {
    if (idNuevo === principal.id) return 'propia';
    const { rows } = await cliente.query(
      `SELECT u.id, u.correo, u.activo, u.admin_revocado_en, lower(r.nombre) AS rol, coalesce(u.admin_nombre, u.correo) AS nombre
         FROM usuario u JOIN rol_aplicacion r ON r.id = u.id_rol_aplicacion
        WHERE u.id = ANY($1::int[])
        FOR UPDATE OF u`,
      [[principal.id, idNuevo]]
    );
    const actual = rows.find((f) => f.id === principal.id);
    const nuevo = rows.find((f) => f.id === idNuevo);
    if (!actual || actual.rol !== 'superadministrador') return 'inexistente';
    if (!nuevo || nuevo.rol !== 'administrador') return 'inexistente';
    if (!nuevo.activo || nuevo.admin_revocado_en) return 'no-disponible';
    const roles = await cliente.query(`SELECT id, lower(nombre) AS nombre FROM rol_aplicacion WHERE lower(nombre) = ANY($1::text[])`, [ROLES_PANEL]);
    const idRol = Object.fromEntries(roles.rows.map((f) => [f.nombre, f.id]));
    await cliente.query('UPDATE usuario SET id_rol_aplicacion = $1 WHERE id = $2', [idRol.administrador, actual.id]);
    await cliente.query('UPDATE usuario SET id_rol_aplicacion = $1 WHERE id = $2', [idRol.superadministrador, nuevo.id]);
    await actividad.registrar(cliente, {
      admin: principal, seccion: 'administradores', accion: 'Traspasar rol principal',
      elementoTipo: 'usuario', elementoId: nuevo.id, elemento: `${nuevo.nombre} <${nuevo.correo}>`, motivo,
      anterior: { principal: actual.correo }, nuevo: { principal: nuevo.correo },
    });
    return 'traspasado';
  });
}

module.exports = {
  ROLES_PANEL, LISTADO, abrirSesion, tocarSesion, cerrarSesion, cerrarSesionesDe, bloqueado, registrarFallo, reiniciarFallos,
  cuentaPorAuth, obtener, idPrincipal, listar, correoEnUso, crearAdministrador, cambiarAcceso, traspasarPrincipal, enTransaccion,
};
