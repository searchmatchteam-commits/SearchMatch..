// public/js/cyber.js
// Micro-interacciones del sistema "cyber-sport" (dashboard, login y registro), en JS puro:
//  -) Modo liviano: detecta si el navegador no tiene aceleración gráfica (html.modo-liviano).
//  0) Scroll fluido: mientras la página se desplaza se pausan las animaciones de fondo.
//  1) Ripple: onda al hacer clic en los elementos con data-ripple (data-ripple="claro" = onda blanca).
//  2) Cursor de luz: círculo verde que sigue al mouse (solo escritorio y sin movimiento reducido).
// Las animaciones las hace el CSS (cyber.css) con transform/opacity.

document.addEventListener('DOMContentLoaded', () => {
  const sinMovimiento = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const conMouse = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const raiz = document.documentElement;

  /* ---------- Modo liviano: ¿el navegador dibuja sin GPU? ---------- */
  // failIfMajorPerformanceCaveat hace que WebGL falle si solo hay dibujo por software
  // (aceleración por hardware desactivada, drivers bloqueados...). Se mide una vez por pestaña
  // (sessionStorage: si el usuario activa la aceleración, la próxima pestaña ya lo nota) y el
  // header lo lee en las páginas siguientes antes de pintar.
  try {
    if (!sessionStorage.getItem('sm-gpu')) {
      const gl = document.createElement('canvas').getContext('webgl', { failIfMajorPerformanceCaveat: true });
      sessionStorage.setItem('sm-gpu', gl ? 'ok' : 'software');
      if (gl) gl.getExtension('WEBGL_lose_context')?.loseContext(); // liberar el contexto de prueba
      if (!gl && localStorage.getItem('sm-liviano') !== 'no') raiz.classList.add('modo-liviano');
    }
  } catch (e) { /* sin almacenamiento: no se recuerda, queda en modo normal */ }

  /* ---------- 0) Scroll: html.desplazando pausa las animaciones decorativas (cyber.css) ---------- */
  let finScroll;
  window.addEventListener('scroll', () => {
    if (!raiz.classList.contains('desplazando')) raiz.classList.add('desplazando');
    clearTimeout(finScroll);
    finScroll = setTimeout(() => raiz.classList.remove('desplazando'), 150);
  }, { passive: true });

  if (sinMovimiento) return;

  /* ---------- 1) Ripple ---------- */
  document.querySelectorAll('[data-ripple]').forEach((el) => {
    // Capa que recorta la onda al borde del botón (el botón puede tener glow por fuera)
    const capa = document.createElement('span');
    capa.className = 'ripple-capa';
    capa.setAttribute('aria-hidden', 'true');
    el.appendChild(capa);

    el.addEventListener('pointerdown', (evento) => {
      const rect = el.getBoundingClientRect();
      // Diámetro suficiente para cubrir el botón desde el punto del clic
      const tam = Math.hypot(Math.max(evento.clientX - rect.left, rect.right - evento.clientX),
        Math.max(evento.clientY - rect.top, rect.bottom - evento.clientY)) * 2;
      const onda = document.createElement('span');
      onda.className = 'ripple';
      onda.style.width = onda.style.height = `${tam}px`;
      onda.style.left = `${evento.clientX - rect.left - tam / 2}px`;
      onda.style.top = `${evento.clientY - rect.top - tam / 2}px`;
      capa.appendChild(onda);
      onda.addEventListener('animationend', () => onda.remove());
    });
  });

  /* ---------- 2) Cursor de luz ---------- */
  const cursor = document.querySelector('.cursor-luz');
  if (!cursor || !conMouse || raiz.classList.contains('modo-liviano')) return;

  const SELECTOR_INTERACTIVO = 'a, button, input, label, [data-ripple], #ball-canvas';
  raiz.classList.add('cursor-luz-activo');

  const raton = { x: -100, y: -100 };  // posición real del mouse
  const anillo = { x: -100, y: -100 }; // posición del anillo (la sigue con suavidad)
  let animando = false;

  function cuadro() {
    anillo.x += (raton.x - anillo.x) * 0.22;
    anillo.y += (raton.y - anillo.y) * 0.22;
    cursor.style.transform = `translate3d(${anillo.x}px, ${anillo.y}px, 0)`;
    // Se detiene cuando el anillo alcanzó al mouse (no gasta batería con el mouse quieto)
    animando = Math.abs(raton.x - anillo.x) > 0.1 || Math.abs(raton.y - anillo.y) > 0.1;
    if (animando) requestAnimationFrame(cuadro);
  }

  window.addEventListener('pointermove', (evento) => {
    if (evento.pointerType !== 'mouse') return;
    if (raton.x < 0) {
      // Primer movimiento: el anillo aparece donde está el mouse, sin cruzar la pantalla
      anillo.x = evento.clientX;
      anillo.y = evento.clientY;
    }
    raton.x = evento.clientX;
    raton.y = evento.clientY;
    cursor.classList.add('cursor-luz--visible');
    if (!animando) {
      animando = true;
      requestAnimationFrame(cuadro);
    }
  }, { passive: true });

  document.addEventListener('pointerover', (evento) => {
    // Durante el scroll los elementos pasan bajo el mouse sin que se mueva: no hay nada que resaltar
    if (raiz.classList.contains('desplazando')) return;
    cursor.classList.toggle('cursor-luz--sobre', Boolean(evento.target.closest(SELECTOR_INTERACTIVO)));
  });
  raiz.addEventListener('pointerleave', () => cursor.classList.remove('cursor-luz--visible'));
});
