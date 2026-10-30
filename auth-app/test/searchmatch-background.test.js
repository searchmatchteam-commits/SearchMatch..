const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ejs = require('ejs');

const raiz = path.join(__dirname, '..');
const codigo = fs.readFileSync(path.join(raiz, 'public/js/searchmatch-background.js'), 'utf8');

// Reloj y eventos controlados: comprueba el ciclo de vida sin navegador ni servicios externos.
function escenario({ reducido = false, liviano = false, sinCanvas = false, almacen = null } = {}) {
  const clases = new Set(liviano ? ['modo-liviano'] : []);
  const pausas = new Set();
  const raf = new Map();
  const timers = new Map();
  const posiciones = [];
  let secuencia = 0;
  let observador;
  let dibujadas = 0;
  const ctx = {
    setTransform() {}, clearRect() { dibujadas = 0; }, beginPath() {},
    arc() {}, fill() { dibujadas++; }, moveTo() {}, lineTo() {}, rect() {},
    closePath() {}, stroke() { dibujadas++; }, save() {}, restore() {}, rotate() {},
    translate(x, y) { posiciones.push([x, y]); },
  };
  const canvas = { getContext: () => sinCanvas ? null : ctx };
  const fondo = {
    dataset: {}, querySelector: () => canvas,
    classList: { toggle: (clase, activo) => activo ? pausas.add(clase) : pausas.delete(clase) },
  };
  const documento = Object.assign(new EventTarget(), {
    hidden: false,
    documentElement: { classList: { contains: (clase) => clases.has(clase) } },
    querySelector: () => fondo,
  });
  const movimiento = Object.assign(new EventTarget(), { matches: reducido });
  const mouse = Object.assign(new EventTarget(), { matches: true });
  const ventana = Object.assign(new EventTarget(), {
    innerWidth: 1440, innerHeight: 900, devicePixelRatio: 3,
    matchMedia: (consulta) => consulta.includes('reduced') ? movimiento : mouse,
  });
  const contexto = vm.createContext({
    document: documento, window: ventana, AbortController,
    ...(almacen ? { sessionStorage: almacen } : {}),
    Math: Object.assign(Object.create(Math), { random: () => 0.25 }),
    requestAnimationFrame: (fn) => { const id = ++secuencia; raf.set(id, fn); return id; },
    cancelAnimationFrame: (id) => raf.delete(id),
    setTimeout: (fn) => { const id = ++secuencia; timers.set(id, fn); return id; },
    clearTimeout: (id) => timers.delete(id),
    MutationObserver: class {
      constructor(fn) { this.fn = fn; observador = this; }
      observe() { this.activo = true; }
      disconnect() { this.activo = false; }
    },
  });
  vm.runInContext(codigo, contexto);
  documento.dispatchEvent(new Event('DOMContentLoaded'));

  return {
    raf, timers, canvas, posiciones, ventana, documento, pausas,
    get dibujadas() { return dibujadas; },
    cargarOtraVez() {
      vm.runInContext(codigo, contexto);
      documento.dispatchEvent(new Event('DOMContentLoaded'));
    },
    cuadro(t) {
      const pendientes = [...raf.values()];
      raf.clear();
      pendientes.forEach((fn) => fn(t));
    },
    ocultar(valor) { documento.hidden = valor; documento.dispatchEvent(new Event('visibilitychange')); },
    reducir(valor) { movimiento.matches = valor; movimiento.dispatchEvent(new Event('change')); },
    modoLiviano(valor) {
      if (valor) clases.add('modo-liviano'); else clases.delete('modo-liviano');
      if (observador.activo) observador.fn();
    },
    salir(persisted) { ventana.dispatchEvent(Object.assign(new Event('pagehide'), { persisted })); },
    volver() { ventana.dispatchEvent(new Event('pageshow')); },
    ejecutarTimers() { const lista = [...timers.values()]; timers.clear(); lista.forEach((fn) => fn()); },
  };
}

test('el fondo mantiene un solo bucle incluso al inicializar o reanudar repetidamente', () => {
  const e = escenario();
  e.cargarOtraVez();
  e.volver();
  e.ocultar(false);
  assert.equal(e.raf.size, 1);
  e.cuadro(0);
  assert.equal(e.raf.size, 1);
  assert.equal(e.dibujadas, Math.round(1440 * 900 / 14000));
  assert.equal(e.canvas.width, 2880, 'DPR limitado a 2');
});

test('pestaña oculta pausa Canvas y CSS y vuelve sin acumular tiempo', () => {
  const e = escenario();
  e.cuadro(0);
  const primera = e.posiciones[0];
  e.ocultar(true);
  assert.equal(e.raf.size, 0);
  assert.ok(e.pausas.has('sm-fondo--pausado'));
  e.ocultar(false);
  e.cuadro(60000);
  const siguiente = e.posiciones[e.posiciones.length / 2];
  assert.ok(Math.abs(siguiente[1] - primera[1]) < 1, 'no salta tras 60 segundos oculta');
  assert.equal(e.pausas.size, 0);
});

test('movimiento reducido funciona al cargar y al cambiar la preferencia en vivo', () => {
  const e = escenario({ reducido: true });
  assert.equal(e.raf.size, 0);
  assert.equal(e.canvas.width, undefined, 'no se reserva un canvas de pantalla completa');
  e.reducir(false);
  assert.equal(e.raf.size, 1);
  e.reducir(true);
  assert.equal(e.raf.size, 0);
});

test('modo liviano inicial o detectado después detiene y reanuda el fondo', () => {
  const e = escenario({ liviano: true });
  assert.equal(e.raf.size, 0);
  e.modoLiviano(false);
  assert.equal(e.raf.size, 1);
  e.modoLiviano(true);
  assert.equal(e.raf.size, 0);
});

test('sin Canvas 2D no hay bucle ni error y la malla CSS puede seguir activa', () => {
  const e = escenario({ sinCanvas: true });
  e.ventana.dispatchEvent(new Event('resize'));
  e.ejecutarTimers();
  e.ocultar(true);
  e.ocultar(false);
  assert.equal(e.raf.size, 0);
  assert.equal(e.pausas.size, 0);
});

test('resize agrupa eventos y ajusta tamaño y densidad a móvil y escritorio', () => {
  const e = escenario();
  e.ventana.innerWidth = 360;
  e.ventana.innerHeight = 800;
  e.ventana.dispatchEvent(new Event('resize'));
  e.ventana.dispatchEvent(new Event('resize'));
  assert.equal(e.timers.size, 1);
  e.ejecutarTimers();
  e.cuadro(0);
  assert.equal(e.canvas.width, 720);
  assert.equal(e.dibujadas, Math.round(360 * 800 / 14000));
  e.ventana.innerWidth = 3840;
  e.ventana.innerHeight = 2160;
  e.ventana.dispatchEvent(new Event('resize'));
  e.ejecutarTimers();
  e.cuadro(16);
  assert.equal(e.dibujadas, 110);
});

test('BFCache pausa y restaura una instancia; la salida definitiva limpia eventos y timers', () => {
  const e = escenario();
  e.ventana.dispatchEvent(new Event('resize'));
  e.salir(true);
  assert.equal(e.raf.size, 0);
  assert.equal(e.timers.size, 0);
  e.volver();
  assert.equal(e.raf.size, 1);
  e.modoLiviano(true);
  assert.equal(e.raf.size, 0, 'se reconecta el observador');
  e.modoLiviano(false);
  e.salir(false);
  e.volver();
  e.reducir(false);
  e.ocultar(false);
  e.ventana.dispatchEvent(new Event('resize'));
  assert.equal(e.raf.size, 0);
  assert.equal(e.timers.size, 0);
});

test('la página siguiente retoma las partículas donde iban y no se reinicia', () => {
  const datos = new Map();
  const almacen = { getItem: (k) => datos.get(k) ?? null, setItem: (k, v) => datos.set(k, v) };
  const a = escenario({ almacen });
  for (let i = 0; i < 30; i++) a.cuadro(i * 16);
  a.salir(false);

  const b = escenario({ almacen });
  b.cuadro(0);
  const ultimo = a.posiciones.slice(-a.dibujadas)[0];
  const siguiente = b.posiciones[0];
  assert.ok(Math.abs(siguiente[1] - ultimo[1]) < 1, 'continúa desde la última posición');
  assert.ok(ultimo[1] !== 225, 'la primera página sí avanzó');

  // Otra medida de ventana no reutiliza el estado guardado
  datos.set('sm-fondo-estado', datos.get('sm-fondo-estado').replace('"ancho":1440', '"ancho":800'));
  const c = escenario({ almacen });
  c.cuadro(0);
  assert.equal(c.dibujadas, Math.round(1440 * 900 / 14000));
  assert.ok(Math.abs(c.posiciones[0][1] - ultimo[1]) > 1, 'parte de nuevo');
});

test('las partículas recorren la misma distancia a 60 y 120 Hz', () => {
  function recorrer(hz) {
    const e = escenario();
    for (let i = 0; i <= hz; i++) e.cuadro(i * 1000 / hz);
    return e.posiciones[e.posiciones.length - e.dibujadas];
  }
  const a = recorrer(60);
  const b = recorrer(120);
  assert.ok(Math.abs(a[0] - b[0]) < 0.00001);
  assert.ok(Math.abs(a[1] - b[1]) < 0.00001);
});

test('todas las plantillas EJS compilan y sus includes locales existen', () => {
  function revisar(directorio) {
    for (const entrada of fs.readdirSync(directorio, { withFileTypes: true })) {
      const archivo = path.join(directorio, entrada.name);
      if (entrada.isDirectory()) { revisar(archivo); continue; }
      if (!archivo.endsWith('.ejs')) continue;
      const texto = fs.readFileSync(archivo, 'utf8');
      ejs.compile(texto, { filename: archivo });
      for (const [, parcial] of texto.matchAll(/<%-\s*include\(['"]([^'"]+)['"]/g)) {
        assert.ok(fs.existsSync(path.resolve(directorio, parcial + '.ejs')), `${archivo}: ${parcial}`);
      }
    }
  }
  revisar(path.join(raiz, 'views'));
});

test('el layout renderiza exactamente un fondo y un script en todas sus variantes', async () => {
  for (const pagina of ['landing', 'dashboard', 'equipo', 'perfil', 'auth', 'rol', 'wizard', 'matchmaking', undefined]) {
    const datos = { titulo: 'Prueba', usuario: null, versionAssets: 'test', pagina, perfilPro: pagina === 'perfil', matchmaking: pagina === 'matchmaking' };
    const html = await ejs.renderFile(path.join(raiz, 'views/partials/header.ejs'), datos)
      + await ejs.renderFile(path.join(raiz, 'views/partials/footer.ejs'), datos);
    assert.equal((html.match(/data-searchmatch-background/g) || []).length, 1, pagina);
    assert.equal((html.match(/src="\/js\/searchmatch-background.js/g) || []).length, 1, pagina);
    assert.doesNotMatch(html, /class="(?:pp-fondo|cyber-fondo|tl-fondo|mm__fondo)/);
  }
});
