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

  // Mantener para buscar: el CTA "Buscar partido" ([data-mantener]) se activa manteniéndolo
  // MANTENER_MS (mouse, toque o Enter/Espacio). El borde de progreso es un <rect> que se dimensiona al
  // botón con ResizeObserver; soltar antes lo vacía. Al completarse pulsa, dice "¡Buscando!" y abre su href.
  // Un clic de lector de pantalla (sin puntero ni tecla mantenida) navega directo.
  const MANTENER_MS = 1500;
  const VACIAR_MS = 450;
  const NAVEGAR_TRAS_MS = 600;
  const TOQUE_CORTO = 0.15; // progreso bajo el cual soltar muestra el aviso "mantén presionado"
  const AVISO_MS = 900;

  document.querySelectorAll('[data-mantener]').forEach((cta) => {
    const rect = cta.querySelector('.dash-cta__progreso rect');
    let perimetro = 0;
    let progreso = 0;
    let cuadroId = null;
    let avisoId = null;
    let teclaMantenida = false;

    function medir() {
      const trazo = 3;
      const ancho = cta.offsetWidth - trazo;
      const alto = cta.offsetHeight - trazo;
      rect.setAttribute('x', trazo / 2);
      rect.setAttribute('y', trazo / 2);
      rect.setAttribute('width', ancho);
      rect.setAttribute('height', alto);
      rect.setAttribute('rx', alto / 2);
      // Píldora: dos rectas más una circunferencia completa
      perimetro = 2 * (ancho - alto) + Math.PI * alto;
      rect.style.strokeDasharray = `${perimetro} ${perimetro}`;
      pintar();
    }

    function pintar() {
      rect.style.strokeDashoffset = perimetro * (1 - progreso);
      cta.style.setProperty('--progreso', progreso.toFixed(3));
    }

    function detenerCuadros() {
      cancelAnimationFrame(cuadroId);
      cuadroId = null;
    }

    function iniciar() {
      if (cta.dataset.estado === 'completo' || cta.dataset.estado === 'cargando') return;
      clearTimeout(avisoId);
      detenerCuadros();
      cta.dataset.estado = 'cargando';
      const inicio = performance.now() - progreso * MANTENER_MS;
      const paso = (ahora) => {
        progreso = Math.min((ahora - inicio) / MANTENER_MS, 1);
        pintar();
        if (progreso < 1) cuadroId = requestAnimationFrame(paso);
        else completar();
      };
      cuadroId = requestAnimationFrame(paso);
    }

    function soltar() {
      if (cta.dataset.estado !== 'cargando') return;
      detenerCuadros();
      const desde = progreso;
      if (desde < TOQUE_CORTO) {
        cta.dataset.estado = 'aviso';
        avisoId = setTimeout(() => { if (cta.dataset.estado === 'aviso') delete cta.dataset.estado; }, AVISO_MS);
      } else {
        delete cta.dataset.estado;
      }
      // Se vacía con desaceleración; el rebote del botón lo da la transición del CSS
      const inicio = performance.now();
      const duracion = sinMovimiento ? 0 : VACIAR_MS * desde;
      const paso = (ahora) => {
        const t = duracion ? Math.min((ahora - inicio) / duracion, 1) : 1;
        progreso = desde * (1 - t) ** 3;
        pintar();
        if (t < 1) cuadroId = requestAnimationFrame(paso);
      };
      cuadroId = requestAnimationFrame(paso);
    }

    function completar() {
      detenerCuadros();
      cta.dataset.estado = 'completo';
      if (navigator.vibrate) navigator.vibrate(40);
      setTimeout(() => { window.location.href = cta.href; }, NAVEGAR_TRAS_MS);
    }

    function reiniciar() {
      detenerCuadros();
      clearTimeout(avisoId);
      delete cta.dataset.estado;
      teclaMantenida = false;
      progreso = 0;
      pintar();
    }

    cta.addEventListener('pointerdown', (evento) => {
      if (evento.button !== 0) return;
      iniciar();
    });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach((tipo) => cta.addEventListener(tipo, soltar));

    cta.addEventListener('keydown', (evento) => {
      if (evento.key !== 'Enter' && evento.key !== ' ') return;
      evento.preventDefault(); // sin esto Enter abre el enlace y Espacio baja la página
      if (evento.repeat || teclaMantenida) return;
      teclaMantenida = true;
      iniciar();
    });
    cta.addEventListener('keyup', (evento) => {
      if (evento.key !== 'Enter' && evento.key !== ' ') return;
      teclaMantenida = false;
      soltar();
    });
    cta.addEventListener('blur', () => { teclaMantenida = false; soltar(); });

    // Un clic con mouse o toque (detail >= 1) no navega: hay que mantener.
    // detail 0 sin tecla mantenida = activación de un lector de pantalla: navega normal.
    cta.addEventListener('click', (evento) => {
      if (evento.detail > 0 || teclaMantenida || cta.dataset.estado) evento.preventDefault();
    });
    // Mantener un toque abre el menú del enlace en móviles
    cta.addEventListener('contextmenu', (evento) => evento.preventDefault());

    // Al volver con "Atrás" (página restaurada de caché) el botón queda listo otra vez
    window.addEventListener('pageshow', (evento) => { if (evento.persisted) reiniciar(); });

    if ('ResizeObserver' in window) new ResizeObserver(medir).observe(cta);
    medir();
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
