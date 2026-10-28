// Partículas originales de /perfil. Una instancia por documento, independiente de la carta.
document.addEventListener('DOMContentLoaded', () => {
  const fondo = document.querySelector('[data-searchmatch-background]');
  if (!fondo || fondo.dataset.inicializado) return;
  fondo.dataset.inicializado = 'true';

  const raiz = document.documentElement;
  const movimiento = window.matchMedia('(prefers-reduced-motion: reduce)');
  const conMouse = window.matchMedia('(hover: hover) and (pointer: fine)');
  const lienzo = fondo.querySelector('canvas');
  const ctx = lienzo.getContext('2d');
  const eventos = new AbortController();
  const { signal } = eventos;
  const FORMAS = ['punto', 'punto', 'punto', 'triangulo', 'rombo', 'cuadro'];
  const DESPLAZAMIENTO_MAX = 38;
  const cursor = { x: 0, y: 0 };
  const suave = { x: 0, y: 0 };
  let ancho = 0;
  let alto = 0;
  let particulas = [];
  let tiempo = 0;
  let anterior = null;
  let animacion = 0;
  let esperaResize = 0;
  let necesitaResize = true;
  let fuera = false;

  function crearParticula() {
    const z = Math.random();
    return {
      x: Math.random() * ancho,
      y: Math.random() * alto,
      z,
      tam: 0.6 + z * 2.6,
      vx: (Math.random() - 0.5) * 0.12,
      vy: -0.05 - Math.random() * 0.18 * (0.4 + z),
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
    necesitaResize = false;
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

  function cuadro(ahora) {
    // Velocidad original a 60 Hz, también en pantallas de 90/120/144 Hz.
    // Al reanudar no se acumula el tiempo que la pestaña estuvo oculta.
    const paso = anterior === null ? 1 : Math.min(3, Math.max(0, (ahora - anterior) / (1000 / 60)));
    anterior = ahora;
    tiempo += paso;
    const suavizado = 1 - Math.pow(0.95, paso);
    suave.x += (cursor.x - suave.x) * suavizado;
    suave.y += (cursor.y - suave.y) * suavizado;
    ctx.clearRect(0, 0, ancho, alto);
    ctx.lineWidth = 1;

    particulas.forEach((p) => {
      p.x += p.vx * paso;
      p.y += p.vy * paso;
      p.giro += p.vgiro * paso;
      if (p.y < -20) { p.y = alto + 20; p.x = Math.random() * ancho; }
      if (p.x < -20) p.x = ancho + 20;
      if (p.x > ancho + 20) p.x = -20;

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

  function actualizarEstado() {
    const pausado = fuera || document.hidden || movimiento.matches || raiz.classList.contains('modo-liviano');
    fondo.classList.toggle('sm-fondo--pausado', pausado);
    if (pausado || !ctx) {
      cancelAnimationFrame(animacion);
      animacion = 0;
      anterior = null;
      return;
    }
    if (necesitaResize) redimensionar();
    if (!animacion) animacion = requestAnimationFrame(cuadro);
  }

  window.addEventListener('resize', () => {
    clearTimeout(esperaResize);
    esperaResize = setTimeout(() => {
      necesitaResize = true;
      actualizarEstado();
    }, 150);
  }, { signal });

  window.addEventListener('pointermove', (evento) => {
    if (!animacion || !conMouse.matches || evento.pointerType !== 'mouse' || !ancho || !alto) return;
    cursor.x = (evento.clientX / ancho) * 2 - 1;
    cursor.y = (evento.clientY / alto) * 2 - 1;
  }, { passive: true, signal });

  conMouse.addEventListener('change', () => { cursor.x = 0; cursor.y = 0; }, { signal });
  movimiento.addEventListener('change', actualizarEstado, { signal });
  document.addEventListener('visibilitychange', actualizarEstado, { signal });

  // cyber.js puede activar modo-liviano después de detectar la GPU.
  const observador = new MutationObserver(actualizarEstado);
  function observarModo() {
    observador.observe(raiz, { attributes: true, attributeFilter: ['class'] });
  }
  observarModo();

  window.addEventListener('pagehide', (evento) => {
    fuera = true;
    actualizarEstado();
    clearTimeout(esperaResize);
    observador.disconnect();
    // BFCache conserva este documento: pageshow reanuda la misma instancia.
    if (!evento.persisted) eventos.abort();
  }, { signal });

  window.addEventListener('pageshow', () => {
    fuera = false;
    necesitaResize = ancho !== window.innerWidth || alto !== window.innerHeight || necesitaResize;
    observarModo();
    actualizarEstado();
  }, { signal });

  actualizarEstado();
});
