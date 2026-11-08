// R7 · Permisos por rol leídos de los routers (sin base de datos): ninguna ruta nueva queda sin protección.
const test = require('node:test');
const assert = require('node:assert/strict');

const { requireAuth } = require('../middlewares/authMiddleware');
const { requireAdmin, requirePrincipal } = require('../middlewares/rolMiddleware');

/** [{metodo, ruta, handles, protegidaPorRouter}] de un router, en orden. */
function rutas(router, middlewareDeRouter) {
  let protegida = false;
  const lista = [];
  router.stack.forEach((capa) => {
    if (!capa.route) {
      if (capa.handle === middlewareDeRouter) protegida = true;
      return;
    }
    Object.keys(capa.route.methods).forEach((metodo) => {
      lista.push({
        clave: `${metodo.toUpperCase()} ${capa.route.path}`,
        handles: capa.route.stack.map((c) => c.handle),
        protegidaPorRouter: protegida,
      });
    });
  });
  return lista;
}

test('R7: todo /admin exige sesión del panel, salvo el login y la salida', () => {
  const sinSesion = rutas(require('../routes/adminRoutes'), requireAdmin).filter((r) => !r.protegidaPorRouter);
  assert.deepEqual(sinSesion.map((r) => r.clave).sort(), ['GET /login', 'POST /login', 'POST /logout']);
});

test('R7: la gestión de administradores y lo de /admin/super es solo del Administrador principal', () => {
  rutas(require('../routes/adminRoutes'), requireAdmin)
    .filter((r) => /^\w+ \/(administradores|super\/)/.test(r.clave))
    .forEach((r) => assert.ok(r.handles.includes(requirePrincipal), `${r.clave} sin requirePrincipal`));
});

test('AP-025 / R1: la moderación de comentarios vive en /admin (donde viaja la cookie del panel)', () => {
  const admin = rutas(require('../routes/adminRoutes'), requireAdmin).map((r) => r.clave);
  ['GET /comentarios', 'POST /comentarios/:id/ocultar', 'POST /comentarios/:id/mostrar'].forEach((c) => assert.ok(admin.includes(c), c));
  const ficha = rutas(require('../routes/equipoFichaRoutes'), requireAuth).map((r) => r.clave);
  assert.equal(ficha.some((c) => c.includes('/comentarios/:id/ocultar')), false, 'la ruta vieja fuera de /admin ya no existe');
});

// Rutas de jugador que se pueden abrir sin sesión (cualquier otra debe llevar requireAuth).
const PUBLICAS = {
  indexRoutes: ['GET /', 'GET /registro-equipo'],
  authRoutes: [
    'GET /registro', 'POST /registro', 'GET /auth/confirmar', 'POST /verificacion/reenviar', 'GET /login', 'POST /login',
    'GET /auth/google', 'GET /auth/callback', 'POST /logout',
  ],
  cuentaRoutes: ['GET /terminos', 'GET /privacidad', 'GET /recuperar', 'POST /recuperar', 'GET /recuperar/nueva', 'POST /recuperar/nueva'],
  // Responde 401 en JSON dentro del controlador (controllers/agendaController.eventos).
  partidoRoutes: ['GET /api/calendario/eventos'],
};

test('R7: las rutas de jugador exigen sesión salvo la lista de públicas', () => {
  ['indexRoutes', 'authRoutes', 'cuentaRoutes', 'canchasRoutes', 'desafioRoutes', 'equipoFichaRoutes', 'partidoRoutes',
    'torneoRoutes', 'notificacionRoutes'].forEach((nombre) => {
    const publicas = PUBLICAS[nombre] || [];
    rutas(require(`../routes/${nombre}`), requireAuth).forEach((r) => {
      const conSesion = r.protegidaPorRouter || r.handles.includes(requireAuth);
      if (publicas.includes(r.clave)) return;
      assert.ok(conSesion, `${nombre}: ${r.clave} no exige sesión`);
    });
  });
});
