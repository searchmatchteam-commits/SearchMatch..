// config/panel.js
// Panel de administración (AP-000): reglas de acceso y secciones del menú lateral.

const ACCESO = {
  inactividadMin: 30, // AP-001: sin actividad por más de esto, la sesión del panel se cierra
  maxFallidos: 5, // AP-001: intentos fallidos seguidos antes de bloquear
  bloqueoMin: 15, // AP-001: duración del bloqueo
};

const COOKIE_PANEL = 'sm_admin';

const MOTIVO = { min: 5, max: 500 };

// Menú lateral (AP-002), en este orden: solo las secciones que funcionan. soloPrincipal: solo la ve el
// Administrador principal (AP-011).
const SECCIONES = [
  { clave: 'resumen', texto: 'Resumen', href: '/admin' },
  { clave: 'usuarios', texto: 'Usuarios', href: '/admin/cuentas' },
  { clave: 'equipos', texto: 'Equipos', href: '/admin/equipos' },
  { clave: 'partidos', texto: 'Partidos', href: '/admin/partidos' },
  { clave: 'torneos', texto: 'Torneos', href: '/admin/torneos' },
  { clave: 'recintos', texto: 'Recintos y canchas', href: '/admin/recintos' },
  { clave: 'administradores', texto: 'Administradores', href: '/admin/administradores', soloPrincipal: true },
  { clave: 'configuracion', texto: 'Configuración', href: '/admin/catalogos' },
  { clave: 'actividad', texto: 'Registro de actividad', href: '/admin/actividad' },
];

/** Secciones que ve una cuenta del panel. */
function seccionesPara(esPrincipal) {
  return SECCIONES.filter((s) => !s.soloPrincipal || esPrincipal);
}

module.exports = { ACCESO, COOKIE_PANEL, MOTIVO, SECCIONES, seccionesPara };
