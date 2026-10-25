const DURACION_AVISO_MS = 3200;

document.addEventListener('DOMContentLoaded', () => {
  const sinMovimiento = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const conMouse = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

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
      formulario.submit();
    });
  });

  if (!conMouse || sinMovimiento || document.documentElement.classList.contains('modo-liviano')) return;

  const hero = document.querySelector('[data-parallax]');
  const capas = hero ? Array.from(hero.querySelectorAll('[data-profundidad]')) : [];
  if (capas.length) {
    const parallax = { x: 0, y: 0, ox: 0, oy: 0 };
    let heroVisible = true;
    let animando = false;

    function cuadro() {
      parallax.x += (parallax.ox - parallax.x) * 0.08;
      parallax.y += (parallax.oy - parallax.y) * 0.08;
      capas.forEach((capa) => {
        const p = Number(capa.dataset.profundidad);
        capa.style.transform = `translate3d(${(parallax.x * p).toFixed(2)}px, ${(parallax.y * p).toFixed(2)}px, 0)`;
      });
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
