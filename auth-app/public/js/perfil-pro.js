// public/js/perfil-pro.js
// Escena "cyber-gamer" de /perfil (estilos en public/css/perfil-pro.css):
//  1) Partículas geométricas del fondo (canvas): flotan como polvo estelar y se corren con el cursor
//     según su profundidad (las cercanas se mueven más).
//  2) Caída de la carta: la animación CSS parte del centro superior de la pantalla (--desde-x).
//  3) Conteo de 0 al valor final de la media y las estadísticas, cuando la carta aterriza.
//  4) Radar: se inclina un poco hacia el cursor.
// El tilt y el foil de la carta los mueve main.js ([data-tilt]); aquí no se tocan.
// Con movimiento reducido no hay partículas animadas, ni conteo, ni caída (el CSS también la apaga).

document.addEventListener('DOMContentLoaded', () => {
  const sinMovimiento = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const liviano = document.documentElement.classList.contains('modo-liviano');
  const conMouse = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const ATERRIZAJE_MS = 780; // momento de la caída (52% de 1.5s) en que la carta toca el suelo

  /* ---------- PE-001: estado de carga de la carta ---------- */
  // El skeleton se quita cuando están listas las fuentes y la foto (cargada o con error).
  // Tope de 8 s para que nunca quede pegado si algo no responde.
  const heroe = document.querySelector('[data-heroe-carta]');
  if (heroe) {
    const foto = heroe.querySelector('.carta-jugador__foto img[src]');
    const fotoLista = !foto || foto.complete
      ? Promise.resolve()
      : new Promise((listo) => {
        foto.addEventListener('load', listo, { once: true });
        foto.addEventListener('error', listo, { once: true });
      });
    const fuentesListas = document.fonts ? document.fonts.ready : Promise.resolve();
    const tope = new Promise((listo) => setTimeout(listo, 8000));
    Promise.race([Promise.all([fotoLista, fuentesListas]), tope]).then(() => {
      heroe.removeAttribute('aria-busy');
      const texto = heroe.querySelector('[data-carta-cargando-texto]');
      if (texto) texto.textContent = '';
    });
  }

  /* ---------- 2) Caída desde el centro superior ---------- */
  const caida = document.querySelector('[data-caida]');
  if (caida && !sinMovimiento) {
    const rect = caida.getBoundingClientRect();
    const desdeX = window.innerWidth / 2 - (rect.left + rect.width / 2);
    caida.style.setProperty('--desde-x', `${Math.round(desdeX)}px`);
  }

  /* ---------- 3) Conteo de los números ---------- */
  // La media y las stats de la carta, más los valores del radar y la media del panel
  const numeros = [
    ...document.querySelectorAll('.perfil--pro [data-carta-media], .perfil--pro .carta-jugador__stats dd, .perfil--pro [data-contar]'),
  ].filter((el) => /^\d+$/.test(el.textContent.trim()));

  if (!sinMovimiento && numeros.length > 0) {
    const DURACION = 650;
    const finales = numeros.map((el) => Number(el.textContent.trim()));
    numeros.forEach((el) => { el.textContent = '0'; });

    setTimeout(() => {
      // El conteo parte en el primer cuadro y usa solo el reloj de requestAnimationFrame: mezclado con
      // performance.now(), el tiempo del cuadro podía ser anterior al inicio y mostraba números negativos.
      let inicio = null;
      function paso(ahora) {
        if (inicio === null) inicio = ahora;
        const t = Math.min(1, Math.max(0, (ahora - inicio) / DURACION));
        const avance = 1 - Math.pow(1 - t, 3); // frena al final
        numeros.forEach((el, i) => { el.textContent = String(Math.round(finales[i] * avance)); });
        if (t < 1) requestAnimationFrame(paso);
      }
      requestAnimationFrame(paso);
    }, ATERRIZAJE_MS);
  }

  /* ---------- 4) Radar que mira al cursor ---------- */
  const radar = document.querySelector('[data-radar]');
  if (radar && conMouse && !sinMovimiento) {
    const panel = radar.closest('.pp-panel');
    panel.addEventListener('pointermove', (evento) => {
      const r = panel.getBoundingClientRect();
      const x = (evento.clientX - r.left) / r.width - 0.5;
      const y = (evento.clientY - r.top) / r.height - 0.5;
      radar.style.setProperty('--radar-ry', `${(x * 16).toFixed(2)}deg`);
      radar.style.setProperty('--radar-rx', `${(22 - y * 12).toFixed(2)}deg`);
    });
    panel.addEventListener('pointerleave', () => {
      radar.style.removeProperty('--radar-ry');
      radar.style.removeProperty('--radar-rx');
    });
  }

  /* ---------- 1) Partículas ---------- */
  const lienzo = document.querySelector('[data-particulas]');
  if (!lienzo || liviano || sinMovimiento) return;

  const ctx = lienzo.getContext('2d');
  const FORMAS = ['punto', 'punto', 'punto', 'triangulo', 'rombo', 'cuadro'];
  const DESPLAZAMIENTO_MAX = 38; // px que se corre la partícula más cercana con el cursor
  let ancho = 0;
  let alto = 0;
  let particulas = [];
  // Cursor normalizado (-1..1) y su versión suavizada (la que se dibuja)
  const cursor = { x: 0, y: 0 };
  const suave = { x: 0, y: 0 };

  function crearParticula() {
    const z = Math.random(); // 0 = lejos, 1 = cerca
    return {
      x: Math.random() * ancho,
      y: Math.random() * alto,
      z,
      tam: 0.6 + z * 2.6,
      vx: (Math.random() - 0.5) * 0.12,
      vy: -0.05 - Math.random() * 0.18 * (0.4 + z), // suben despacio, como polvo en un haz de luz
      giro: Math.random() * Math.PI * 2,
      vgiro: (Math.random() - 0.5) * 0.01,
      forma: FORMAS[Math.floor(Math.random() * FORMAS.length)],
      fase: Math.random() * Math.PI * 2,
      verde: Math.random() < 0.7,
    };
  }

  function redimensionar() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    ancho = window.innerWidth;
    alto = window.innerHeight;
    lienzo.width = Math.round(ancho * dpr);
    lienzo.height = Math.round(alto * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const cantidad = Math.round(Math.min(110, (ancho * alto) / 14000));
    particulas = Array.from({ length: cantidad }, crearParticula);
  }

  function dibujarForma(p) {
    const s = p.tam;
    ctx.beginPath();
    if (p.forma === 'punto') {
      ctx.arc(0, 0, s * 0.8, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    if (p.forma === 'triangulo') {
      ctx.moveTo(0, -s * 1.6);
      ctx.lineTo(s * 1.4, s * 1.1);
      ctx.lineTo(-s * 1.4, s * 1.1);
    } else if (p.forma === 'rombo') {
      ctx.moveTo(0, -s * 1.7);
      ctx.lineTo(s * 1.1, 0);
      ctx.lineTo(0, s * 1.7);
      ctx.lineTo(-s * 1.1, 0);
    } else {
      ctx.rect(-s, -s, s * 2, s * 2);
    }
    ctx.closePath();
    ctx.stroke();
  }

  let tiempo = 0;
  function cuadro() {
    tiempo += 1;
    suave.x += (cursor.x - suave.x) * 0.05;
    suave.y += (cursor.y - suave.y) * 0.05;
    ctx.clearRect(0, 0, ancho, alto);
    ctx.lineWidth = 1;

    particulas.forEach((p) => {
      p.x += p.vx;
      p.y += p.vy;
      p.giro += p.vgiro;
      if (p.y < -20) { p.y = alto + 20; p.x = Math.random() * ancho; }
      if (p.x < -20) p.x = ancho + 20;
      if (p.x > ancho + 20) p.x = -20;

      // Paralaje: hacia el lado contrario del cursor, más cuanto más cerca está la partícula
      const dx = -suave.x * DESPLAZAMIENTO_MAX * p.z;
      const dy = -suave.y * DESPLAZAMIENTO_MAX * p.z;
      const titileo = 0.55 + 0.45 * Math.sin(tiempo * 0.02 + p.fase);
      const alfa = (0.12 + p.z * 0.5) * titileo;
      const color = p.verde ? `rgba(57, 255, 20, ${alfa})` : `rgba(220, 230, 222, ${alfa * 0.8})`;

      ctx.save();
      ctx.translate(p.x + dx, p.y + dy);
      ctx.rotate(p.giro);
      ctx.fillStyle = color;
      ctx.strokeStyle = color;
      if (p.z > 0.8) {
        ctx.shadowColor = 'rgba(57, 255, 20, 0.8)';
        ctx.shadowBlur = 8;
      }
      dibujarForma(p);
      ctx.restore();
    });

    animacion = requestAnimationFrame(cuadro);
  }

  let animacion = 0;
  redimensionar();
  animacion = requestAnimationFrame(cuadro);

  window.addEventListener('resize', () => {
    clearTimeout(redimensionar.espera);
    redimensionar.espera = setTimeout(redimensionar, 150);
  });

  if (conMouse) {
    window.addEventListener('pointermove', (evento) => {
      cursor.x = (evento.clientX / ancho) * 2 - 1;
      cursor.y = (evento.clientY / alto) * 2 - 1;
    }, { passive: true });
  }

  // Pestaña oculta: no se dibuja
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) cancelAnimationFrame(animacion);
    else animacion = requestAnimationFrame(cuadro);
  });
});
