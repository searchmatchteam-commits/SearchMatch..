// public/js/dashboard.js
// Interacciones del dashboard (todo en JS puro; las animaciones las hace el CSS con transform/opacity):
//  1) Avisos de "próximamente": "Buscar partido", accesos rápidos y los íconos del dock
//     todavía no tienen backend, así que muestran un aviso flotante con el texto de data-proximamente.
//  2) Ripple: onda al hacer clic en los elementos con data-ripple.
//  3) Cursor de luz: círculo verde que sigue al mouse (solo escritorio).
//  4) Parallax del hero: las capas con data-profundidad se desplazan según el mouse.
//  5) Carta holográfica: inclinación 3D y foil que se mueve con el cursor.
// La aparición al hacer scroll (.revelar) la maneja main.js con IntersectionObserver.

const DURACION_AVISO_MS = 3200;

document.addEventListener('DOMContentLoaded', () => {
  const sinMovimiento = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const conMouse = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  /* ---------- 1) Avisos de "próximamente" ---------- */
  const aviso = document.querySelector('[data-aviso]');
  if (aviso) {
    let temporizador;
    document.querySelectorAll('[data-proximamente]').forEach((boton) => {
      boton.addEventListener('click', () => {
        aviso.textContent = boton.dataset.proximamente;
        aviso.classList.add('panel-aviso--visible');
        clearTimeout(temporizador);
        temporizador = setTimeout(() => aviso.classList.remove('panel-aviso--visible'), DURACION_AVISO_MS);
      });
    });
  }

  /* ---------- 2) Ripple ---------- */
  if (!sinMovimiento) {
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
  }

  // Cursor de luz y parallax solo con mouse y sin movimiento reducido
  if (!conMouse || sinMovimiento) return;

  /* ---------- 3) Cursor de luz + 4) Parallax: un solo bucle de animación ---------- */
  const cursor = document.querySelector('.cursor-luz');
  const hero = document.querySelector('[data-parallax]');
  const capas = hero ? Array.from(hero.querySelectorAll('[data-profundidad]')) : [];
  const SELECTOR_INTERACTIVO = 'a, button, [data-ripple], #ball-canvas';

  if (cursor) document.documentElement.classList.add('cursor-luz-activo');

  const raton = { x: -100, y: -100 };          // posición real del mouse
  const anillo = { x: -100, y: -100 };         // posición del anillo (la sigue con suavidad)
  const parallax = { x: 0, y: 0, ox: 0, oy: 0 }; // actual y objetivo, de -1 a 1
  let heroVisible = true;
  let animando = false;

  function cuadro() {
    // Interpolación: el anillo y las capas alcanzan al mouse de forma suave
    anillo.x += (raton.x - anillo.x) * 0.22;
    anillo.y += (raton.y - anillo.y) * 0.22;
    parallax.x += (parallax.ox - parallax.x) * 0.08;
    parallax.y += (parallax.oy - parallax.y) * 0.08;

    if (cursor) cursor.style.transform = `translate3d(${anillo.x}px, ${anillo.y}px, 0)`;
    if (heroVisible) {
      capas.forEach((capa) => {
        const p = Number(capa.dataset.profundidad);
        capa.style.transform = `translate3d(${(parallax.x * p).toFixed(2)}px, ${(parallax.y * p).toFixed(2)}px, 0)`;
      });
    }

    // Se detiene cuando todo llegó a su lugar (no gasta batería con el mouse quieto)
    const quieto = Math.abs(raton.x - anillo.x) < 0.1 && Math.abs(raton.y - anillo.y) < 0.1
      && Math.abs(parallax.ox - parallax.x) < 0.001 && Math.abs(parallax.oy - parallax.y) < 0.001;
    animando = !quieto;
    if (animando) requestAnimationFrame(cuadro);
  }

  function arrancar() {
    if (animando) return;
    animando = true;
    requestAnimationFrame(cuadro);
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
    parallax.ox = (evento.clientX / window.innerWidth) * 2 - 1;
    parallax.oy = (evento.clientY / window.innerHeight) * 2 - 1;
    if (cursor) cursor.classList.add('cursor-luz--visible');
    arrancar();
  }, { passive: true });

  if (cursor) {
    document.addEventListener('pointerover', (evento) => {
      cursor.classList.toggle('cursor-luz--sobre', Boolean(evento.target.closest(SELECTOR_INTERACTIVO)));
    });
    document.documentElement.addEventListener('pointerleave', () => cursor.classList.remove('cursor-luz--visible'));
  }

  // Sin el hero en pantalla no tiene sentido mover sus capas
  if (hero && 'IntersectionObserver' in window) {
    new IntersectionObserver(([entrada]) => { heroVisible = entrada.isIntersecting; }).observe(hero);
  }

  /* ---------- 5) Carta holográfica ---------- */
  const INCLINACION_MAX = 16; // grados
  document.querySelectorAll('[data-holo]').forEach((carta) => {
    // El área que detecta el mouse es el contenedor (no cambia al inclinarse la carta)
    const zona = carta.parentElement;
    let pendiente = null;

    zona.addEventListener('pointerenter', () => carta.classList.add('inclinando'));

    zona.addEventListener('pointermove', (evento) => {
      const rect = carta.getBoundingClientRect();
      const x = Math.min(1, Math.max(0, (evento.clientX - rect.left) / rect.width));
      const y = Math.min(1, Math.max(0, (evento.clientY - rect.top) / rect.height));
      // Un cambio por cuadro como máximo
      if (pendiente) return;
      pendiente = requestAnimationFrame(() => {
        pendiente = null;
        carta.style.setProperty('--ry', `${((x - 0.5) * 2 * INCLINACION_MAX).toFixed(2)}deg`);
        carta.style.setProperty('--rx', `${((0.5 - y) * 2 * INCLINACION_MAX).toFixed(2)}deg`);
        carta.style.setProperty('--fx', `${(x * 100).toFixed(1)}%`);
        carta.style.setProperty('--fy', `${(y * 100).toFixed(1)}%`);
        carta.style.setProperty('--foil-op', '0.85');
      });
    });

    zona.addEventListener('pointerleave', () => {
      if (pendiente) cancelAnimationFrame(pendiente);
      pendiente = null;
      carta.classList.remove('inclinando'); // vuelve a su lugar con transición suave
      carta.style.setProperty('--rx', '0deg');
      carta.style.setProperty('--ry', '0deg');
      carta.style.setProperty('--fx', '50%');
      carta.style.setProperty('--fy', '50%');
      carta.style.setProperty('--foil-op', '0.35');
    });
  });
});
