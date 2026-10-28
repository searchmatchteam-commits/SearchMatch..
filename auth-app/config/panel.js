// config/panel.js
// Panel de administración (AP-000): reglas de acceso y secciones del menú lateral.

const ACCESO = {
  inactividadMin: 30, // AP-001: sin actividad por más de esto, la sesión del panel se cierra
  maxFallidos: 5, // AP-001: intentos fallidos seguidos antes de bloquear
  bloqueoMin: 15, // AP-001: duración del bloqueo
};

const COOKIE_PANEL = 'sm_admin';

const MOTIVO = { min: 5, max: 500 };

// Menú lateral (AP-002), en este orden. soloPrincipal: solo la ve el Administrador principal (AP-011).
// fase: si la sección aún no existe, su página dice en qué fase llega.
const SECCIONES = [
  { clave: 'resumen', texto: 'Resumen', href: '/admin' },
  { clave: 'usuarios', texto: 'Usuarios', href: '/admin/cuentas' },
  { clave: 'administradores', texto: 'Administradores', href: '/admin/administradores', soloPrincipal: true },
  { clave: 'equipos', texto: 'Equipos', href: '/admin/equipos' },
  { clave: 'recintos', texto: 'Recintos y canchas', href: '/admin/recintos' },
  { clave: 'desafios', texto: 'Desafíos', href: '/admin/desafios', fase: 5 },
  { clave: 'partidos', texto: 'Partidos', href: '/admin/partidos', fase: 5 },
  { clave: 'reservas', texto: 'Reservas', href: '/admin/reservas', fase: 5 },
  { clave: 'valoraciones', texto: 'Valoraciones', href: '/admin/valoraciones', fase: 5 },
  { clave: 'comentarios', texto: 'Comentarios', href: '/admin/comentarios', fase: 5 },
  { clave: 'anuncios', texto: 'Anuncios', href: '/admin/anuncios', fase: 5 },
  { clave: 'torneos', texto: 'Torneos', href: '/admin/torneos' },
  { clave: 'apelaciones', texto: 'Apelaciones', href: '/admin/apelaciones', fase: 4 },
  { clave: 'pagos', texto: 'Pagos', href: '/admin/pagos', fase: 4 },
  { clave: 'configuracion', texto: 'Configuración', href: '/admin/catalogos' },
  { clave: 'actividad', texto: 'Registro de actividad', href: '/admin/actividad' },
  { clave: 'estadisticas', texto: 'Estadísticas', href: '/admin/estadisticas', fase: 5 },
];

/** Secciones que ve una cuenta del panel. */
function seccionesPara(esPrincipal) {
  return SECCIONES.filter((s) => !s.soloPrincipal || esPrincipal);
}

module.exports = { ACCESO, COOKIE_PANEL, MOTIVO, SECCIONES, seccionesPara };
