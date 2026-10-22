// public/js/dashboard.js
// Interacciones del dashboard (todo en JS puro; las animaciones las hace el CSS con transform/opacity):
//  1) Avisos de "próximamente": "Buscar partido" y los íconos del dock
//     todavía no tienen backend, así que muestran un aviso flotante con el texto de data-proximamente.
//     El aviso que llega del servidor (tras responder una invitación) se esconde solo.
//  2) Parallax del hero: las capas con data-profundidad se desplazan según el mouse.
//  3) "Salir del equipo" (lista "Mis equipos" del dashboard y /mis-equipos): pide confirmación
//     (confirmarAccion, main.js) y, mientras el servidor responde, el botón queda como "Saliendo…".
// El ripple y el cursor de luz están en cyber.js; la aparición al hacer scroll (.revelar), en main.js.

const DURACION_AVISO_MS = 3200;

document.addEventListener('DOMContentLoaded', () => {
  const sinMovimiento = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const conMouse = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  /* ---------- 1) Avisos de "próximamente" ---------- */
  const aviso = document.querySelector('[data-aviso]');
  if (aviso) {
    let temporizador;
    if (aviso.classList.contains('panel-aviso--visible')) {
      temporizador = setTimeout(() => aviso.classList.remove('panel-aviso--visible'), DURACION_AVISO_MS);
    }
    document.querySelectorAll('[data-proximamente]').forEach((boton) => {
      boton.addEventListener('click', () => {
        aviso.textContent = boton.dataset.proximamente;
        aviso.classList.add('panel-aviso--visible');
        clearTimeout(temporizador);
        temporizador = setTimeout(() => aviso.classList.remove('panel-aviso--visible'), DURACION_AVISO_MS);
      });
    });
  }

  /* ---------- 3) Salir del equipo ---------- */
  document.querySelectorAll('form[data-salir]').forEach((formulario) => {
    formulario.addEventListener('submit', async (evento) => {
      evento.preventDefault();
      const boton = formulario.querySelector('button');
      if (boton.disabled) return;
      const confirmado = await confirmarAccion({
        titulo: 'Salir del equipo',
        texto: `¿Seguro que quieres salir de ${formulario.dataset.nombre}?`,
        confirmar: 'Salir',
      });
      if (!confirmado) return;
      boton.disabled = true;
      boton.textContent = 'Saliendo…';
      formulario.submit(); // envío normal: el servidor vuelve a esta página con la lista actualizada
    });
  });

  // Parallax y carta solo con mouse, sin movimiento reducido y fuera del modo liviano
  if (!conMouse || sinMovimiento || document.documentElement.classList.contains('modo-liviano')) return;

  /* ---------- 2) Parallax del hero ---------- */
  const hero = document.querySelector('[data-parallax]');
  const capas = hero ? Array.from(hero.querySelectorAll('[data-profundidad]')) : [];
  if (capas.length) {
    const parallax = { x: 0, y: 0, ox: 0, oy: 0 }; // actual y objetivo, de -1 a 1
    let heroVisible = true;
    let animando = false;

    function cuadro() {
      // Interpolación: las capas alcanzan al mouse de forma suave
      parallax.x += (parallax.ox - parallax.x) * 0.08;
      parallax.y += (parallax.oy - parallax.y) * 0.08;
      capas.forEach((capa) => {
        const p = Number(capa.dataset.profundidad);
        capa.style.transform = `translate3d(${(parallax.x * p).toFixed(2)}px, ${(parallax.y * p).toFixed(2)}px, 0)`;
      });
      // Se detiene cuando llegó a su lugar o el hero salió de la pantalla
      animando = heroVisible && (Math.abs(parallax.ox - parallax.x) > 0.001 || Math.abs(parallax.oy - parallax.y) > 0.001);
      if (animando) requestAnimationFrame(cuadro);
    }

    window.addEventListener('pointermove', (evento) => {
      if (evento.pointerType !== 'mouse') return;
      parallax.ox = (evento.clientX / window.innerWidth) * 2 - 1;
      parallax.oy = (evento.clientY / window.innerHeight) * 2 - 1;
      if (!animando && heroVisible) {
        animando = true;
        requestAnimationFrame(cuadro);
      }
    }, { passive: true });

    if ('IntersectionObserver' in window) {
      new IntersectionObserver(([entrada]) => { heroVisible = entrada.isIntersecting; }).observe(hero);
    }
  }
});
