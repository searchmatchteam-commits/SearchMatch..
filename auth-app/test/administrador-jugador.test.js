const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const ejs = require('ejs');

const raiz = path.join(__dirname, '..');

// construirUsuario no se exporta: se prueba a través de cargarSesion con el modelo y Supabase simulados.
function cargarCon(perfil) {
  const userModel = require('../models/userModel');
  const originales = { findByAuthId: userModel.findByAuthId, obtenerUsuarioActual: userModel.obtenerUsuarioActual };
  userModel.findByAuthId = async () => perfil;
  userModel.obtenerUsuarioActual = async () => ({ data: { user: { id: 'auth-1', email: 'a@b.cl', user_metadata: { rol_inicio: 'jugador' } } }, error: null });
  const { cargarSesion } = require('../middlewares/authMiddleware');
  const req = { cookies: { 'sb-x-auth-token': 'base64-e30' }, path: '/dashboard' };
  const res = { locals: {}, cookie() {}, clearCookie() {}, set() {} };
  return new Promise((resolve, reject) => {
    cargarSesion(req, res, (err) => {
      Object.assign(userModel, originales);
      return err ? reject(err) : resolve(req.usuario);
    });
  });
}

const base = { id: 1, activo: true, terminos_version: '1.1', privacidad_version: '1.1', fecha_nacimiento: '1990-01-01', nombre: 'Ben' };

test('un jugador que es administrador sigue siendo jugador (no es cuenta del panel) y tiene acceso al panel', async () => {
  const u = await cargarCon({ ...base, id_jugador: 7, rol: 'Administrador' });
  assert.equal(u.esCuentaPanel, false);
  assert.equal(u.esAdmin, true);
  assert.equal(u.esSuperAdmin, false);
});

test('el principal (superadministrador) jugador ve la sección Administradores', async () => {
  const u = await cargarCon({ ...base, id_jugador: 7, rol: 'Superadministrador' });
  assert.equal(u.esCuentaPanel, false);
  assert.equal(u.esSuperAdmin, true);
  const { seccionesPara } = require('../config/panel');
  assert.ok(seccionesPara(u.esSuperAdmin).some((s) => s.texto === 'Administradores'));
  assert.ok(!seccionesPara(false).some((s) => s.texto === 'Administradores'));
});

test('una cuenta solo del panel (sin perfil de jugador) sigue siendo cuenta del panel; revocado no es admin', async () => {
  const panel = await cargarCon({ ...base, id_jugador: null, rol: 'Administrador', nombre: null, admin_nombre: 'Admin' });
  assert.equal(panel.esCuentaPanel, true);
  assert.equal(panel.esAdmin, true);
  const revocado = await cargarCon({ ...base, id_jugador: 7, rol: 'Administrador', admin_revocado_en: new Date() });
  assert.equal(revocado.esAdmin, false);
  assert.equal(revocado.esCuentaPanel, false, 'sigue usando la app como jugador');
});

test('la barra muestra el acceso al panel solo a los jugadores administradores', async () => {
  const cabecera = (usuario) => ejs.renderFile(path.join(raiz, 'views/partials/header.ejs'), { titulo: 't', usuario, versionAssets: 't', pagina: 'dashboard' });
  assert.match(await cabecera({ nombre: 'B', esAdmin: true, esCuentaPanel: false }), /Panel de administrador/);
  assert.doesNotMatch(await cabecera({ nombre: 'B', esAdmin: false, esCuentaPanel: false }), /Panel de administrador/);
});

test('el menú del panel solo tiene secciones con página propia (sin "próximamente")', () => {
  const { SECCIONES } = require('../config/panel');
  const router = require('../routes/adminRoutes');
  const rutasGet = router.stack.filter((c) => c.route && c.route.methods.get).map((c) => c.route.path);
  SECCIONES.forEach((s) => {
    const ruta = s.href.replace(/^\/admin/, '') || '/';
    assert.ok(rutasGet.includes(ruta), `${s.texto} (${s.href}) no tiene ruta`);
    assert.equal(s.fase, undefined, `${s.texto} sigue marcada como pendiente`);
  });
  assert.deepEqual(SECCIONES.map((s) => s.clave),
    ['resumen', 'usuarios', 'equipos', 'partidos', 'torneos', 'pagos', 'recintos', 'administradores', 'configuracion', 'actividad']);
});
