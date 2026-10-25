const THREE_CDN = 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
let THREE;

const LIVIANO = document.documentElement.classList.contains('modo-liviano');
const INTERVALO_CUADRO = LIVIANO ? 1000 / 30 - 2 : 1000 / 60 - 2;

let NEON;

function buildTruncatedIcosahedron(radius) {
  const t = (1 + Math.sqrt(5)) / 2;

  const rawVerts = [
    [-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0],
    [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t],
    [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]
  ].map((v) => new THREE.Vector3(v[0], v[1], v[2]).normalize());

  const faces = [
    [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
    [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
    [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
    [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]
  ];

  const cache = new Map();
  function truncPoint(near, far) {
    const key = `${near}>${far}`;
    if (!cache.has(key)) {
      cache.set(key, rawVerts[near].clone().lerp(rawVerts[far], 1 / 3).normalize().multiplyScalar(radius));
    }
    return cache.get(key);
  }

  const hexagons = faces.map(([a, b, c]) => [
    truncPoint(a, b), truncPoint(b, a),
    truncPoint(b, c), truncPoint(c, b),
    truncPoint(c, a), truncPoint(a, c)
  ]);

  const vecinos = new Map();
  faces.forEach((f) => {
    f.forEach((v) => {
      if (!vecinos.has(v)) vecinos.set(v, new Set());
      f.forEach((o) => { if (o !== v) vecinos.get(v).add(o); });
    });
  });

  const pentagons = [];
  for (let v = 0; v < 12; v++) {
    const pos = rawVerts[v];
    const ref = Math.abs(pos.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
    const ejeX = new THREE.Vector3().crossVectors(ref, pos).normalize();
    const ejeY = new THREE.Vector3().crossVectors(pos, ejeX).normalize();

    const ordenados = Array.from(vecinos.get(v))
      .map((n) => {
        const rel = rawVerts[n].clone().sub(pos.clone().multiplyScalar(rawVerts[n].dot(pos)));
        return { n, angulo: Math.atan2(rel.dot(ejeY), rel.dot(ejeX)) };
      })
      .sort((p, q) => p.angulo - q.angulo)
      .map((o) => o.n);

    pentagons.push(ordenados.map((n) => truncPoint(v, n)));
  }

  return { pentagons, hexagons };
}

function buildPanelGeometry(points, radius, gap, bulge, detalle = 6) {
  const n = points.length;
  const centro = points.reduce((s, p) => s.add(p), new THREE.Vector3()).normalize();

  const apotema = centro.distanceTo(points[0].clone().add(points[1]).multiplyScalar(0.5));
  const esquinas = points.map((p) => p.clone().lerp(centro, gap / apotema).normalize());

  const positions = [];
  const indices = [];
  const vistos = new Map();

  function vertice(wc, a, wa, b, wb) {
    const dir = centro.clone().multiplyScalar(wc).addScaledVector(a, wa).addScaledVector(b, wb).normalize();
    const key = `${Math.round(dir.x * 1e5)},${Math.round(dir.y * 1e5)},${Math.round(dir.z * 1e5)}`;
    if (vistos.has(key)) return vistos.get(key);
    const r = radius * (1 + bulge * (1 - Math.pow(1 - wc, 3)));
    positions.push(dir.x * r, dir.y * r, dir.z * r);
    const idx = positions.length / 3 - 1;
    vistos.set(key, idx);
    return idx;
  }

  for (let k = 0; k < n; k++) {
    let a = esquinas[k];
    let b = esquinas[(k + 1) % n];
    const normal = new THREE.Vector3().crossVectors(a.clone().sub(centro), b.clone().sub(centro));
    if (normal.dot(centro) < 0) [a, b] = [b, a];

    const grid = [];
    for (let i = 0; i <= detalle; i++) {
      grid[i] = [];
      for (let j = 0; j <= detalle - i; j++) {
        grid[i][j] = vertice(1 - (i + j) / detalle, a, i / detalle, b, j / detalle);
      }
    }
    for (let i = 0; i < detalle; i++) {
      for (let j = 0; j < detalle - i; j++) {
        indices.push(grid[i][j], grid[i + 1][j], grid[i][j + 1]);
        if (i + j < detalle - 1) indices.push(grid[i + 1][j], grid[i + 1][j + 1], grid[i][j + 1]);
      }
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

function makeGlowSprite(size = 128) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255, 255, 255, 1)');
  g.addColorStop(0.25, 'rgba(255, 255, 255, 0.8)');
  g.addColorStop(0.6, 'rgba(255, 255, 255, 0.12)');
  g.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(canvas);
}

function makeRingTexture(size = 256) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const c = size / 2;
  const g = ctx.createRadialGradient(c, c, 0, c, c, c);
  g.addColorStop(0.78, 'rgba(255, 255, 255, 0)');
  g.addColorStop(0.93, 'rgba(255, 255, 255, 1)');
  g.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(canvas);
}

function crearEntorno(renderer) {
  const env = new THREE.Scene();
  env.background = new THREE.Color(0x030403);

  function foco(color, fuerza, ancho, alto, x, y, z) {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(ancho, alto),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(fuerza), side: THREE.DoubleSide })
    );
    m.position.set(x, y, z);
    m.lookAt(0, 0, 0);
    env.add(m);
  }
  foco(0xffffff, 5, 6, 2.5, 0, 6, 1);
  foco(0xeaffe0, 2.5, 2.5, 3.5, 5, 1.5, 4);
  foco(NEON, 4, 1, 7, -6, 0, -1);
  foco(NEON, 2.5, 7, 0.8, 0, -5, -2);

  const pmrem = new THREE.PMREMGenerator(renderer);
  const textura = pmrem.fromScene(env, 0.035).texture;
  pmrem.dispose();
  return textura;
}

function crearOrbita(radio, rotX, rotY, velocidad, fase, glow) {
  const grupo = new THREE.Group();
  grupo.rotation.set(rotX, rotY, 0);

  const puntos = [];
  for (let i = 0; i < 160; i++) {
    const a = (i / 160) * Math.PI * 2;
    puntos.push(new THREE.Vector3(Math.cos(a) * radio, Math.sin(a) * radio, 0));
  }
  grupo.add(new THREE.LineLoop(
    new THREE.BufferGeometry().setFromPoints(puntos),
    new THREE.LineBasicMaterial({ color: NEON, transparent: true, opacity: 0.18, depthWrite: false, blending: THREE.AdditiveBlending })
  ));

  const cabeza = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glow, color: 0xd8ffcc, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false
  }));
  cabeza.scale.setScalar(0.32);
  grupo.add(cabeza);

  const LARGO = 30;
  const pos = new Float32Array(LARGO * 3);
  const col = new Float32Array(LARGO * 3);
  const estelaGeo = new THREE.BufferGeometry();
  estelaGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  estelaGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  grupo.add(new THREE.Points(estelaGeo, new THREE.PointsMaterial({
    size: 0.14, map: glow, vertexColors: true, transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending, toneMapped: false
  })));

  let angulo = fase;
  return {
    grupo,
    actualizar(dt, energia) {
      angulo += dt * velocidad * (1 + energia * 2.5);
      cabeza.position.set(Math.cos(angulo) * radio, Math.sin(angulo) * radio, 0);
      for (let k = 0; k < LARGO; k++) {
        const a = angulo - Math.sign(velocidad) * k * 0.035;
        pos.set([Math.cos(a) * radio, Math.sin(a) * radio, 0], k * 3);
        const f = Math.pow(1 - k / LARGO, 1.6) * (0.6 + energia * 0.6);
        col.set([NEON.r * f, NEON.g * f, NEON.b * f], k * 3);
      }
      estelaGeo.attributes.position.needsUpdate = true;
      estelaGeo.attributes.color.needsUpdate = true;
    }
  };
}

function initBall(stage, container) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      antialias: !LIVIANO && (window.devicePixelRatio || 1) < 1.5, alpha: true, powerPreference: 'high-performance'
    });
  } catch (e) {
    stage.classList.add('sin-3d');
    return;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, LIVIANO ? 1 : 1.5));
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  container.appendChild(renderer.domElement);

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const scene = new THREE.Scene();
  scene.environment = crearEntorno(renderer);

  const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 100);
  camera.position.set(0, 0, 10.5);

  const R = 1.7;
  const glow = makeGlowSprite();

  const pelota = new THREE.Group();
  const giro = new THREE.Group();
  pelota.add(giro);
  scene.add(pelota);

  const nucleoMat = new THREE.MeshBasicMaterial({ color: NEON.clone(), toneMapped: false });
  const nucleo = new THREE.Mesh(new THREE.SphereGeometry(R * 0.985, LIVIANO ? 32 : 64, LIVIANO ? 24 : 48), nucleoMat);
  giro.add(nucleo);

  const Material = LIVIANO ? THREE.MeshStandardMaterial : THREE.MeshPhysicalMaterial;
  const barniz = (rugosidad) => (LIVIANO ? {} : { clearcoat: 1, clearcoatRoughness: rugosidad });
  const hexMat = new Material({ color: 0x283028, metalness: 0.25, roughness: 0.38, ...barniz(0.12) });
  const pentMat = new Material({
    color: 0x060806, metalness: 0.4, roughness: 0.3, ...barniz(0.06),
    emissive: NEON, emissiveIntensity: 0.06
  });
  const detallePanel = LIVIANO ? 3 : 6;
  const { pentagons, hexagons } = buildTruncatedIcosahedron(1);
  hexagons.forEach((pts) => giro.add(new THREE.Mesh(buildPanelGeometry(pts, R, 0.017, 0.035, detallePanel), hexMat)));
  pentagons.forEach((pts) => giro.add(new THREE.Mesh(buildPanelGeometry(pts, R, 0.017, 0.035, detallePanel), pentMat)));

  const haloMat = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: NEON.clone() }, uIntensidad: { value: 0.6 } },
    vertexShader: `
      varying vec3 vNormal;
      varying vec3 vVista;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vNormal = normalize(normalMatrix * normal);
        vVista = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform vec3 uColor;
      uniform float uIntensidad;
      varying vec3 vNormal;
      varying vec3 vVista;
      void main() {
        float f = pow(max(-dot(vNormal, vVista), 0.0), 2.2);
        gl_FragColor = vec4(uColor, f * uIntensidad);
      }`,
    side: THREE.BackSide,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });
  pelota.add(new THREE.Mesh(new THREE.SphereGeometry(R * 1.3, LIVIANO ? 32 : 64, LIVIANO ? 24 : 48), haloMat));

  const keyLight = new THREE.DirectionalLight(0xffffff, 1.1);
  keyLight.position.set(3, 4, 5);
  scene.add(keyLight);
  const focoArriba = new THREE.SpotLight(0xf2fff0, 3.4, 0, Math.PI / 7, 0.65, 0);
  focoArriba.position.set(0, 7.5, 2);
  focoArriba.target = pelota;
  scene.add(focoArriba);
  const rim1 = new THREE.DirectionalLight(NEON, 2.4);
  rim1.position.set(-5, 1, -4);
  scene.add(rim1);
  const rim2 = new THREE.DirectionalLight(NEON, 1.2);
  rim2.position.set(4, -3, -3);
  scene.add(rim2);
  const luzCursor = new THREE.PointLight(0xe8ffe0, 0, 9);
  luzCursor.position.set(0, 0, 3);
  scene.add(luzCursor);

  const orbitas = [
    crearOrbita(R * 1.5, 1.2, 0.35, 0.8, 0, glow),
    crearOrbita(R * 1.38, -1.05, -0.6, -0.55, Math.PI, glow)
  ];
  orbitas.forEach((o) => {
    o.actualizar(0, 0);
    pelota.add(o.grupo);
  });

  const POLVO = LIVIANO ? 60 : 140;
  const polvoPos = new Float32Array(POLVO * 3);
  for (let i = 0; i < POLVO; i++) {
    const r = R * (1.12 + Math.random() * 0.4);
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    polvoPos.set([
      r * Math.sin(phi) * Math.cos(theta),
      r * Math.sin(phi) * Math.sin(theta),
      r * Math.cos(phi)
    ], i * 3);
  }
  const polvoGeo = new THREE.BufferGeometry();
  polvoGeo.setAttribute('position', new THREE.BufferAttribute(polvoPos, 3));
  const polvoMat = new THREE.PointsMaterial({
    size: 0.06, map: glow, color: 0x9cff85, transparent: true, opacity: 0.6,
    depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false
  });
  const polvo = new THREE.Points(polvoGeo, polvoMat);
  pelota.add(polvo);

  const CHISPAS = 160;
  const chispaPos = new Float32Array(CHISPAS * 3);
  const chispaCol = new Float32Array(CHISPAS * 3);
  const chispaVel = Array.from({ length: CHISPAS }, () => new THREE.Vector3());
  const chispaVida = new Float32Array(CHISPAS);
  const chispaGeo = new THREE.BufferGeometry();
  chispaGeo.setAttribute('position', new THREE.BufferAttribute(chispaPos, 3));
  chispaGeo.setAttribute('color', new THREE.BufferAttribute(chispaCol, 3));
  scene.add(new THREE.Points(chispaGeo, new THREE.PointsMaterial({
    size: 0.13, map: glow, vertexColors: true, transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending, toneMapped: false
  })));
  let siguienteChispa = 0;

  function emitirChispas(origen, normal, cantidad) {
    for (let c = 0; c < cantidad; c++) {
      const i = siguienteChispa;
      siguienteChispa = (siguienteChispa + 1) % CHISPAS;
      chispaPos.set([origen.x, origen.y, origen.z], i * 3);
      chispaVel[i].set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5)
        .multiplyScalar(1.6).add(normal).normalize()
        .multiplyScalar(2.5 + Math.random() * 4);
      chispaVida[i] = 0.6 + Math.random() * 0.4;
    }
  }

  function actualizarChispas(dt) {
    for (let i = 0; i < CHISPAS; i++) {
      if (chispaVida[i] <= 0) {
        chispaCol.set([0, 0, 0], i * 3);
        continue;
      }
      chispaVida[i] -= dt * 1.3;
      const v = chispaVel[i];
      v.multiplyScalar(Math.pow(0.06, dt));
      v.y -= 2 * dt;
      chispaPos[i * 3] += v.x * dt;
      chispaPos[i * 3 + 1] += v.y * dt;
      chispaPos[i * 3 + 2] += v.z * dt;
      const vida = Math.max(chispaVida[i], 0);
      const blanco = vida * vida;
      chispaCol.set([
        (NEON.r + (1 - NEON.r) * blanco) * vida * 1.5,
        vida * 1.5,
        (NEON.b + (1 - NEON.b) * blanco) * vida * 1.5
      ], i * 3);
    }
    chispaGeo.attributes.position.needsUpdate = true;
    chispaGeo.attributes.color.needsUpdate = true;
  }

  const anilloTex = makeRingTexture();
  const ondas = [0, 0.09].map((retraso) => {
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.MeshBasicMaterial({
        map: anilloTex, color: NEON, transparent: true, opacity: 0, depthWrite: false,
        blending: THREE.AdditiveBlending, toneMapped: false
      })
    );
    mesh.visible = false;
    scene.add(mesh);
    return { mesh, retraso };
  });

  function resize() {
    const w = container.clientWidth;
    const h = container.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(container);
  resize();

  const BASE = reduceMotion ? 0 : 0.0045;
  const base = new THREE.Vector3(0.0008, BASE, 0);
  const omega = base.clone();
  const eje = new THREE.Vector3();
  const q = new THREE.Quaternion();
  const tmp = new THREE.Vector3();
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();

  let tiempo = 0;
  let energia = 0;
  let flash = 0;
  let hover = 0;
  let hoverObjetivo = 0;
  let luzObjetivo = 0;
  let ultimoRemate = -10;

  let arrastrando = false;
  let ultimoX = 0;
  let ultimoY = 0;
  let ultimoMovimiento = 0;
  let recorrido = 0;
  let inicioToque = 0;

  function girar(vector) {
    const angulo = vector.length();
    if (angulo < 1e-6) return;
    q.setFromAxisAngle(eje.copy(vector).divideScalar(angulo), angulo);
    giro.quaternion.premultiply(q);
  }

  function actualizarCursor(e) {
    const rect = container.getBoundingClientRect();
    ndc.set(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -(((e.clientY - rect.top) / rect.height) * 2 - 1)
    );
  }

  function tocaPelota() {
    raycaster.setFromCamera(ndc, camera);
    return raycaster.intersectObject(nucleo)[0] || null;
  }

  const hud = stage.querySelector('.ball-hud');
  const hudVel = stage.querySelector('.ball-hud-vel');
  const hudRecord = stage.querySelector('.ball-hud-record');
  const hudTitulo = stage.querySelector('.ball-hud-titulo');
  let record = 0;
  let velMostrada = 0;
  let velObjetivo = 0;
  let hudTimer = null;

  function mostrarVelocidad(kmh) {
    if (!hud) return;
    const nuevoRecord = record > 0 && kmh > record;
    record = Math.max(record, kmh);
    velMostrada = 0;
    velObjetivo = kmh;
    hudRecord.textContent = record;
    hudTitulo.textContent = nuevoRecord ? '¡Nuevo récord!' : 'Remate';
    hud.classList.toggle('record', nuevoRecord);
    hud.classList.add('visible');
    hud.classList.remove('golpe');
    void hud.offsetWidth;
    hud.classList.add('golpe');
    clearTimeout(hudTimer);
    hudTimer = setTimeout(() => hud.classList.remove('visible'), 4000);
  }

  function rematar(hit) {
    const centro = pelota.getWorldPosition(new THREE.Vector3());
    const normal = hit.point.clone().sub(centro).normalize();
    const brazo = Math.min(1, Math.hypot(normal.x, normal.y));
    eje.set(-normal.y, normal.x, 0);
    if (eje.lengthSq() < 0.01) eje.set(Math.random() - 0.5, 1, 0);
    omega.addScaledVector(eje.normalize(), 0.12 + brazo * 0.26);

    emitirChispas(hit.point, normal, 80);
    ondas.forEach((o) => { o.inicio = tiempo; });
    flash = 1;
    ultimoRemate = tiempo;
    stage.classList.add('ball-usada');
    mostrarVelocidad(Math.round(85 + (1 - brazo) * 45 + Math.random() * 15));
  }

  container.addEventListener('pointerdown', (e) => {
    actualizarCursor(e);
    arrastrando = true;
    ultimoX = e.clientX;
    ultimoY = e.clientY;
    ultimoMovimiento = performance.now();
    inicioToque = ultimoMovimiento;
    recorrido = 0;
    omega.set(0, 0, 0);
    container.setPointerCapture(e.pointerId);
  });

  container.addEventListener('pointermove', (e) => {
    actualizarCursor(e);
    if (e.pointerType === 'mouse') hoverObjetivo = tocaPelota() ? 1 : 0;
    if (!arrastrando) return;
    const dx = e.clientX - ultimoX;
    const dy = e.clientY - ultimoY;
    recorrido += Math.abs(dx) + Math.abs(dy);
    omega.set(dy * 0.006, dx * 0.006, 0);
    girar(omega);
    ultimoX = e.clientX;
    ultimoY = e.clientY;
    ultimoMovimiento = performance.now();
    if (recorrido > 20) stage.classList.add('ball-usada');
  });

  container.addEventListener('pointerup', (e) => {
    if (!arrastrando) return;
    arrastrando = false;
    const ahora = performance.now();
    if (ahora - ultimoMovimiento > 80) omega.set(0, 0, 0);
    if (recorrido < 8 && ahora - inicioToque < 400) {
      actualizarCursor(e);
      const hit = tocaPelota();
      if (hit) rematar(hit);
    }
  });
  container.addEventListener('pointercancel', () => { arrastrando = false; });
  container.addEventListener('pointerleave', () => { hoverObjetivo = 0; });

  const inclinacion = new THREE.Vector2();
  window.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    const rect = container.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const y = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
    inclinacion.set(THREE.MathUtils.clamp(x, -1.5, 1.5), THREE.MathUtils.clamp(y, -1.5, 1.5));
    luzCursor.position.set(x * 2.6, y * 2.6, 3);
    luzObjetivo = Math.max(0, 1 - Math.hypot(x, y) / 1.8);
  });

  const reloj = new THREE.Clock();
  let enPantalla = true;
  let corriendo = false;
  let desplazando = false;
  let ultimoCuadro = 0;
  let sombraAnterior = '';
  let energiaAnterior = '';

  function animate() {
    if (!enPantalla || document.hidden || desplazando) {
      corriendo = false;
      return;
    }
    requestAnimationFrame(animate);

    const ahora = performance.now();
    if (ahora - ultimoCuadro < INTERVALO_CUADRO) return;
    ultimoCuadro = ahora;

    const dt = Math.min(reloj.getDelta(), 0.05);
    const f = dt * 60;
    tiempo += dt;

    if (!arrastrando) {
      omega.lerp(base, 1 - Math.pow(0.978, f));
      girar(tmp.copy(omega).multiplyScalar(f));
    }

    hover += (hoverObjetivo - hover) * (1 - Math.pow(0.85, f));
    flash *= Math.pow(0.9, f);
    const velocidad = Math.max(0, omega.length() - BASE);
    const energiaObjetivo = Math.min(1, Math.min(1, velocidad / 0.14) * 0.85 + hover * 0.3);
    energia += (energiaObjetivo - energia) * (1 - Math.pow(0.9, f));

    nucleoMat.color.copy(NEON).multiplyScalar(0.5 + energia * 0.9 + flash * 1.5);
    pentMat.emissiveIntensity = 0.06 + energia * 0.45 + flash * 1.2;
    haloMat.uniforms.uIntensidad.value = 0.55 + energia * 0.55 + flash * 0.9;
    luzCursor.intensity += (luzObjetivo * 28 - luzCursor.intensity) * (1 - Math.pow(0.9, f));

    pelota.rotation.y += (inclinacion.x * 0.28 - pelota.rotation.y) * (1 - Math.pow(0.94, f));
    pelota.rotation.x += (-inclinacion.y * 0.28 - pelota.rotation.x) * (1 - Math.pow(0.94, f));

    const k = tiempo - ultimoRemate;
    const flotar = reduceMotion ? 0 : Math.sin(tiempo * 1.1) * 0.07;
    let escala = 1;
    let fondo = 0;
    if (k < 1.5 && !reduceMotion) {
      escala = 1 + 0.08 * Math.sin(k * 30) * Math.exp(-k * 6);
      fondo = -0.6 * Math.sin(Math.min(k * 8, Math.PI)) * Math.exp(-k * 3);
    }
    pelota.position.set(0, flotar, fondo);
    pelota.scale.set(escala, 2 - escala, escala);

    if (!reduceMotion) {
      polvo.rotation.y -= 0.0012 * f * (1 + energia * 5);
      polvo.rotation.x += 0.0006 * f;
      polvoMat.opacity = 0.45 + Math.sin(tiempo * 1.4) * 0.15 + energia * 0.3;
      orbitas.forEach((o) => o.actualizar(dt, energia));
    }
    actualizarChispas(dt);

    ondas.forEach((o) => {
      const t = o.inicio === undefined ? -1 : tiempo - o.inicio - o.retraso;
      if (t < 0 || t > 0.7) {
        o.mesh.visible = false;
        return;
      }
      const p = t / 0.7;
      o.mesh.visible = true;
      o.mesh.position.copy(pelota.position);
      o.mesh.scale.setScalar(R * (1.02 + (1 - Math.pow(1 - p, 3)) * 0.5));
      o.mesh.material.opacity = Math.pow(1 - p, 2) * 1.4;
    });

    if (hudVel && velMostrada < velObjetivo) {
      velMostrada = Math.min(velObjetivo, velMostrada + dt * 320);
      hudVel.textContent = Math.round(velMostrada);
    }

    const sombra = (1 - flotar * 1.6 + fondo * 0.25).toFixed(3);
    const energiaCss = Math.min(1, energia + flash * 0.6).toFixed(2);
    if (sombra !== sombraAnterior) stage.style.setProperty('--sombra', sombraAnterior = sombra);
    if (energiaCss !== energiaAnterior) stage.style.setProperty('--energia', energiaAnterior = energiaCss);

    renderer.render(scene, camera);
  }

  function arrancar() {
    if (corriendo || !enPantalla || document.hidden || desplazando) return;
    corriendo = true;
    reloj.getDelta();
    requestAnimationFrame(animate);
  }
  new IntersectionObserver(([entrada]) => {
    enPantalla = entrada.isIntersecting;
    arrancar();
  }).observe(container);
  document.addEventListener('visibilitychange', arrancar);

  let finScroll;
  window.addEventListener('scroll', () => {
    desplazando = true;
    clearTimeout(finScroll);
    finScroll = setTimeout(() => {
      desplazando = false;
      arrancar();
    }, 150);
  }, { passive: true });

  arrancar();
}

const canvasBall = document.getElementById('ball-canvas');
if (canvasBall) {
  const stage = canvasBall.closest('.ball-stage');
  try {
    THREE = await import(THREE_CDN);
    NEON = new THREE.Color(getComputedStyle(stage).getPropertyValue('--verde').trim() || '#39ff14');
    await new Promise((listo) => {
      if ('requestIdleCallback' in window) requestIdleCallback(listo, { timeout: 800 });
      else setTimeout(listo, 200);
    });
    initBall(stage, canvasBall);
    stage.classList.add('ball-lista');
  } catch (e) {
    console.warn('Balón 3D no disponible, se usa el respaldo:', e);
    stage.classList.add('sin-3d');
  }
}
