// public/js/main.js
// Comportamiento del lado del navegador:
//  1) Animaciones de aparición al hacer scroll (IntersectionObserver).
//  2) Formato del teléfono chileno mientras se escribe (+56 9 XXXX XXXX).
//  3) Aviso visual de campos obligatorios vacíos antes de enviar.
//  4) Tarjetas bento: glow y borde que siguen al cursor.
//  5) Carta de jugador: inclinación 3D con reflejo de luz.
//  6) Timeline "Cómo funciona": línea que se rellena con el scroll.
// La validación real siempre la hace el servidor (middlewares/validators.js).

document.addEventListener('DOMContentLoaded', () => {
  const sinMovimiento = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- 1) Aparición al hacer scroll ---------- */
  const revelables = document.querySelectorAll('.revelar');

  // Pequeño escalonado entre elementos hermanos (ej: las 3 tarjetas de una grilla).
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
          observador.unobserve(el); // se anima una sola vez
          // Terminada la aparición, se quita el retraso para que el hover responda al instante.
          setTimeout(() => el.style.removeProperty('--retraso'), 1200);
        });
      },
      { threshold: 0.15, rootMargin: '0px 0px -40px 0px' }
    );
    revelables.forEach((el) => observador.observe(el));
  } else {
    revelables.forEach((el) => el.classList.add('visible'));
  }

  /* ---------- 2) Formato del teléfono chileno ---------- */
  document.querySelectorAll('input[data-telefono-cl]').forEach((input) => {
    input.addEventListener('blur', () => {
      const digitos = input.value.replace(/\D/g, '').replace(/^56/, '');
      // Solo formateamos si es un celular completo (9 + 8 dígitos).
      if (/^9\d{8}$/.test(digitos)) {
        input.value = `+56 9 ${digitos.slice(1, 5)} ${digitos.slice(5)}`;
      }
    });
  });

  /* ---------- 3) Campos obligatorios vacíos ---------- */
  document.querySelectorAll('form.formulario').forEach((formulario) => {
    formulario.addEventListener('submit', (evento) => {
      let primerVacio = null;

      formulario.querySelectorAll('input[required]').forEach((campo) => {
        const vacio = !campo.value.trim();
        campo.closest('.campo').classList.toggle('campo--error', vacio);
        if (vacio && !primerVacio) primerVacio = campo;
      });

      if (primerVacio) {
        evento.preventDefault();
        primerVacio.focus();
      }
    });

    // Al corregir un campo se quita la marca roja.
    formulario.addEventListener('input', (evento) => {
      const campo = evento.target.closest('.campo');
      if (campo) campo.classList.remove('campo--error');
    });
  });

  /* ---------- 4) Bento: glow que sigue al cursor ---------- */
  document.querySelectorAll('.bento__tarjeta').forEach((tarjeta) => {
    tarjeta.addEventListener('pointermove', (evento) => {
      const rect = tarjeta.getBoundingClientRect();
      tarjeta.style.setProperty('--mx', `${evento.clientX - rect.left}px`);
      tarjeta.style.setProperty('--my', `${evento.clientY - rect.top}px`);
    });
  });

  /* ---------- 5) Carta de jugador: tilt 3D ---------- */
  // Solo con mouse: en pantallas táctiles o con movimiento reducido la carta queda quieta.
  const conMouse = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  if (conMouse && !sinMovimiento) {
    const INCLINACION_MAX = 14; // grados

    document.querySelectorAll('[data-tilt]').forEach((carta) => {
      // El área que detecta el mouse es el contenedor (no cambia al inclinarse la carta).
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
      });

      zona.addEventListener('pointerleave', () => {
        carta.classList.remove('inclinando'); // vuelve a su lugar con transición suave
        carta.style.setProperty('--rx', '0deg');
        carta.style.setProperty('--ry', '0deg');
        carta.style.setProperty('--brillo-op', '0');
      });
    });
  }

  /* ---------- 6) Timeline que se rellena con el scroll ---------- */
  const timeline = document.querySelector('[data-timeline]');
  if (timeline) {
    const linea = timeline.querySelector('.timeline__linea');
    const numeros = Array.from(timeline.querySelectorAll('.timeline__numero'));
    const horizontal = window.matchMedia('(min-width: 760px)'); // mismo corte que en style.css
    let pendiente = false;

    // Ubica el riel entre el centro del primer número y el del último.
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
      let progreso = 1; // con movimiento reducido: todo encendido, sin animar

      if (!sinMovimiento) {
        const alto = window.innerHeight;
        const r = linea.getBoundingClientRect();
        progreso = horizontal.matches
          ? (alto * 0.85 - r.top) / (alto * 0.35)   // se llena mientras la línea sube por la pantalla
          : (alto * 0.7 - r.top) / r.height;         // vertical: avanza a la par del scroll
        progreso = Math.min(1, Math.max(0, progreso));
      }

      timeline.style.setProperty('--progreso', progreso.toFixed(3));
      // Cada número se enciende cuando la línea llega a su posición.
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
    // Las fuentes web pueden cambiar el alto de los textos al cargar.
    if (document.fonts) document.fonts.ready.then(recalcular);
  }
});
