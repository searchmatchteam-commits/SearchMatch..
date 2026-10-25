document.addEventListener('DOMContentLoaded', () => {
  const sinMovimiento = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const conMouse = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const raiz = document.documentElement;

  try {
    if (!sessionStorage.getItem('sm-gpu')) {
      const gl = document.createElement('canvas').getContext('webgl', { failIfMajorPerformanceCaveat: true });
      sessionStorage.setItem('sm-gpu', gl ? 'ok' : 'software');
      if (gl) gl.getExtension('WEBGL_lose_context')?.loseContext();
      if (!gl && localStorage.getItem('sm-liviano') !== 'no') raiz.classList.add('modo-liviano');
    }
  } catch (e) {  }

  let finScroll;
  window.addEventListener('scroll', () => {
    if (!raiz.classList.contains('desplazando')) raiz.classList.add('desplazando');
    clearTimeout(finScroll);
    finScroll = setTimeout(() => raiz.classList.remove('desplazando'), 150);
  }, { passive: true });

  if (sinMovimiento) return;

  document.querySelectorAll('[data-ripple]').forEach((el) => {
    const capa = document.createElement('span');
    capa.className = 'ripple-capa';
    capa.setAttribute('aria-hidden', 'true');
    el.appendChild(capa);

    el.addEventListener('pointerdown', (evento) => {
      const rect = el.getBoundingClientRect();
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

  const cursor = document.querySelector('.cursor-luz');
  if (!cursor || !conMouse || raiz.classList.contains('modo-liviano')) return;

  const SELECTOR_INTERACTIVO = 'a, button, input, label, [data-ripple], #ball-canvas';
  raiz.classList.add('cursor-luz-activo');

  const raton = { x: -100, y: -100 };
  const anillo = { x: -100, y: -100 };
  let animando = false;

  function cuadro() {
    anillo.x += (raton.x - anillo.x) * 0.22;
    anillo.y += (raton.y - anillo.y) * 0.22;
    cursor.style.transform = `translate3d(${anillo.x}px, ${anillo.y}px, 0)`;
    animando = Math.abs(raton.x - anillo.x) > 0.1 || Math.abs(raton.y - anillo.y) > 0.1;
    if (animando) requestAnimationFrame(cuadro);
  }

  window.addEventListener('pointermove', (evento) => {
    if (evento.pointerType !== 'mouse') return;
    if (raton.x < 0) {
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
    if (raiz.classList.contains('desplazando')) return;
    cursor.classList.toggle('cursor-luz--sobre', Boolean(evento.target.closest(SELECTOR_INTERACTIVO)));
  });
  raiz.addEventListener('pointerleave', () => cursor.classList.remove('cursor-luz--visible'));
});
