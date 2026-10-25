function confirmarAccion({ titulo, texto, confirmar = 'Confirmar' }) {
  return new Promise((resolver) => {
    const fondo = document.createElement('div');
    fondo.className = 'confirmar';
    fondo.innerHTML = `
      <div class="confirmar__caja" role="alertdialog" aria-modal="true" aria-labelledby="confirmar-titulo" aria-describedby="confirmar-texto">
        <h2 class="confirmar__titulo" id="confirmar-titulo"></h2>
        <p class="confirmar__texto" id="confirmar-texto"></p>
        <div class="confirmar__acciones">
          <button type="button" class="btn btn--contorno btn--chico" data-confirmar-no>Cancelar</button>
          <button type="button" class="btn btn--chico confirmar__si" data-confirmar-si></button>
        </div>
      </div>`;
    fondo.querySelector('.confirmar__titulo').textContent = titulo;
    fondo.querySelector('.confirmar__texto').textContent = texto;
    fondo.querySelector('[data-confirmar-si]').textContent = confirmar;
    const botones = [...fondo.querySelectorAll('button')];
    const anterior = document.activeElement;

    function cerrar(respuesta) {
      fondo.remove();
      document.removeEventListener('keydown', teclas);
      if (anterior && anterior.focus) anterior.focus();
      resolver(respuesta);
    }
    function teclas(evento) {
      if (evento.key === 'Escape') cerrar(false);
      if (evento.key === 'Tab') {
        evento.preventDefault();
        botones[(botones.indexOf(document.activeElement) + 1) % botones.length].focus();
      }
    }

    fondo.addEventListener('click', (evento) => { if (evento.target === fondo) cerrar(false); });
    fondo.querySelector('[data-confirmar-no]').addEventListener('click', () => cerrar(false));
    fondo.querySelector('[data-confirmar-si]').addEventListener('click', () => cerrar(true));
    document.addEventListener('keydown', teclas);
    document.body.append(fondo);
    botones[0].focus();
  });
}

document.addEventListener('DOMContentLoaded', () => {
  const sinMovimiento = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const revelables = document.querySelectorAll('.revelar');

  revelables.forEach((el) => {
    const hermanos = Array.from(el.parentElement.children).filter((h) => h.classList.contains('revelar'));
    el.style.setProperty('--retraso', `${hermanos.indexOf(el) * 90}ms`);
  });

  if ('IntersectionObserver' in window) {
    const observador = new IntersectionObserver(
      (entradas) => {
        entradas.forEach((entrada) => {
          if (!entrada.isIntersecting) return;
          const el = entrada.target;
          el.classList.add('visible');
          observador.unobserve(el);
          setTimeout(() => el.style.removeProperty('--retraso'), 1200);
        });
      },
      { threshold: 0.15, rootMargin: '0px 0px -40px 0px' }
    );
    revelables.forEach((el) => observador.observe(el));
  } else {
    revelables.forEach((el) => el.classList.add('visible'));
  }

  document.querySelectorAll('input[data-telefono-cl]').forEach((input) => {
    input.addEventListener('blur', () => {
      const digitos = input.value.replace(/\D/g, '').replace(/^56/, '');
      if (/^9\d{8}$/.test(digitos)) {
        input.value = `+56 9 ${digitos.slice(1, 5)} ${digitos.slice(5)}`;
      }
    });
  });

  document.querySelectorAll('.bento__tarjeta').forEach((tarjeta) => {
    tarjeta.addEventListener('pointermove', (evento) => {
      const rect = tarjeta.getBoundingClientRect();
      tarjeta.style.setProperty('--mx', `${evento.clientX - rect.left}px`);
      tarjeta.style.setProperty('--my', `${evento.clientY - rect.top}px`);
    });
  });

  const conMouse = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  if (conMouse && !sinMovimiento) {
    const INCLINACION_MAX = 14;

    document.querySelectorAll('[data-tilt]').forEach((carta) => {
      const zona = carta.parentElement;

      zona.addEventListener('pointerenter', () => carta.classList.add('inclinando'));

      zona.addEventListener('pointermove', (evento) => {
        if (evento.pointerType !== 'mouse') return;
        const rect = carta.getBoundingClientRect();
        const x = Math.min(1, Math.max(0, (evento.clientX - rect.left) / rect.width));
        const y = Math.min(1, Math.max(0, (evento.clientY - rect.top) / rect.height));
        carta.style.setProperty('--ry', `${(x - 0.5) * 2 * INCLINACION_MAX}deg`);
        carta.style.setProperty('--rx', `${(0.5 - y) * 2 * INCLINACION_MAX}deg`);
        carta.style.setProperty('--brillo-x', `${x * 100}%`);
        carta.style.setProperty('--brillo-y', `${y * 100}%`);
        carta.style.setProperty('--brillo-op', '1');
        carta.style.setProperty('--px', ((x - 0.5) * 2).toFixed(3));
        carta.style.setProperty('--py', ((y - 0.5) * 2).toFixed(3));
      });

      zona.addEventListener('pointerleave', () => {
        carta.classList.remove('inclinando');
        carta.style.setProperty('--rx', '0deg');
        carta.style.setProperty('--ry', '0deg');
        carta.style.setProperty('--brillo-op', '0');
        carta.style.setProperty('--px', '0');
        carta.style.setProperty('--py', '0');
      });
    });
  }

  document.querySelectorAll('[data-boton-volver]').forEach((boton) => {
    boton.addEventListener('click', (evento) => {
      const vieneDelSitio = document.referrer && new URL(document.referrer).origin === window.location.origin;
      if (vieneDelSitio && window.history.length > 1) {
        evento.preventDefault();
        window.history.back();
      }
    });
  });

  const timeline = document.querySelector('[data-timeline]');
  if (timeline) {
    const linea = timeline.querySelector('.timeline__linea');
    const numeros = Array.from(timeline.querySelectorAll('.timeline__numero'));
    const horizontal = window.matchMedia('(min-width: 760px)');
    let pendiente = false;

    function colocarLinea() {
      const base = timeline.getBoundingClientRect();
      const centros = numeros.map((numero) => {
        const r = numero.getBoundingClientRect();
        return { x: r.left + r.width / 2 - base.left, y: r.top + r.height / 2 - base.top };
      });
      const inicio = centros[0];
      const fin = centros[centros.length - 1];

      Object.assign(
        linea.style,
        horizontal.matches
          ? { left: `${inicio.x}px`, top: `${inicio.y - 1}px`, width: `${fin.x - inicio.x}px`, height: '2px' }
          : { left: `${inicio.x - 1}px`, top: `${inicio.y}px`, width: '2px', height: `${fin.y - inicio.y}px` }
      );
    }

    function actualizarProgreso() {
      pendiente = false;
      let progreso = 1;

      if (!sinMovimiento) {
        const alto = window.innerHeight;
        const r = linea.getBoundingClientRect();
        progreso = horizontal.matches
          ? (alto * 0.85 - r.top) / (alto * 0.35)
          : (alto * 0.7 - r.top) / r.height;
        progreso = Math.min(1, Math.max(0, progreso));
      }

      timeline.style.setProperty('--progreso', progreso.toFixed(3));
      numeros.forEach((numero, i) => {
        const posicion = Math.max(i / (numeros.length - 1), 0.001);
        numero.classList.toggle('encendido', progreso >= posicion - 0.001);
      });
    }

    function programar() {
      if (pendiente) return;
      pendiente = true;
      requestAnimationFrame(actualizarProgreso);
    }

    function recalcular() {
      colocarLinea();
      actualizarProgreso();
    }

    recalcular();
    window.addEventListener('scroll', programar, { passive: true });
    window.addEventListener('resize', recalcular);
    if (document.fonts) document.fonts.ready.then(recalcular);
  }
});
