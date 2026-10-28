// public/js/main.js
// Comportamiento del lado del navegador:
//  1) Animaciones de aparición al hacer scroll (IntersectionObserver).
//  2) Formato del teléfono chileno mientras se escribe (+56 9 XXXX XXXX).
//  3) Tarjetas bento: glow y borde que siguen al cursor.
//  4) Carta de jugador: inclinación 3D con reflejo de luz y paralaje de los datos (la flotación en reposo es CSS).
//  5) Timeline "Cómo funciona": línea que se rellena con el scroll.
//  6) Botón "Volver" (partials/boton-volver): vuelve atrás si se llegó desde otra página del sitio.
//  7) confirmarAccion(): modal de confirmación con el estilo del sitio (en vez de window.confirm).
//     Lo usan equipo.js ("sacar" del plantel) y dashboard.js ("Salir del equipo"); main.js carga antes.
//  8) Modo claro / oscuro: botón [data-cambiar-tema] del navbar. Guarda la elección en localStorage
//     ("sm-tema") y la aplica como html[data-theme="light"]; el oscuro es el predeterminado.
//     El tema guardado se aplica antes del primer pintado (script del <head> en partials/header.ejs).
// La validación de login/registro está en auth.js (y la real, en el servidor).

const COLOR_BARRA = { light: '#ffffff', dark: '#0b0d0b' }; // <meta name="theme-color"> (barra del navegador en celulares)
const DURACION_CAMBIO_TEMA = 350;

/** Tema actual: 'light' | 'dark'. */
function temaActual() {
  return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
}

/** Deja el botón del navbar al día: aria-pressed (modo claro activo) y el texto de la acción. */
function pintarBotonTema(boton) {
  const claro = temaActual() === 'light';
  const texto = claro ? 'Cambiar a modo oscuro' : 'Cambiar a modo claro';
  boton.setAttribute('aria-pressed', String(claro));
  boton.title = texto;
  boton.setAttribute('aria-label', texto);
}

/** Cambia el tema con una transición de colores breve (solo durante el cambio, no en cada hover). */
function aplicarTema(tema) {
  const raiz = document.documentElement;
  const sinMovimiento = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!sinMovimiento) {
    raiz.classList.add('tema-transicion');
    clearTimeout(aplicarTema.espera);
    aplicarTema.espera = setTimeout(() => raiz.classList.remove('tema-transicion'), DURACION_CAMBIO_TEMA);
  }
  if (tema === 'light') raiz.setAttribute('data-theme', 'light');
  else raiz.removeAttribute('data-theme');
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', COLOR_BARRA[tema]);
  try {
    localStorage.setItem('sm-tema', tema);
  } catch (e) { /* sin localStorage: el tema dura hasta recargar */ }
}

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('[data-cambiar-tema]').forEach((boton) => {
    pintarBotonTema(boton);
    boton.addEventListener('click', () => {
      aplicarTema(temaActual() === 'light' ? 'dark' : 'light');
      pintarBotonTema(boton);
    });
  });
});

/* ---------- 7) Confirmación ---------- */
/**
 * Pregunta antes de una acción que no se deshace, en un modal propio (estilos .confirmar en style.css).
 * Cancelar, Escape o clic fuera de la caja responden false. El foco parte en "Cancelar".
 * @param {{titulo: string, texto: string, confirmar?: string}} opciones - Se escriben como texto, no como HTML.
 * @returns {Promise<boolean>}
 */
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
      // Tab no sale del modal: va y viene entre los dos botones
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

  /* ---------- 3) Bento: glow que sigue al cursor ---------- */
  document.querySelectorAll('.bento__tarjeta').forEach((tarjeta) => {
    tarjeta.addEventListener('pointermove', (evento) => {
      const rect = tarjeta.getBoundingClientRect();
      tarjeta.style.setProperty('--mx', `${evento.clientX - rect.left}px`);
      tarjeta.style.setProperty('--my', `${evento.clientY - rect.top}px`);
    });
  });

  /* ---------- 4) Carta de jugador: tilt 3D con resorte ---------- */
  // Solo con mouse: en pantallas táctiles o con movimiento reducido la carta queda quieta.
  // La inclinación (--rx/--ry) no salta al cursor: un resorte amortiguado (rigidez 300, amortiguación 20)
  // la lleva hacia el objetivo en cada cuadro y, al salir el mouse, la devuelve a 0 con un leve rebote.
  // Mientras el resorte la mueve, la carta lleva .tilt-resorte (sin transición CSS de transform).
  const conMouse = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  if (conMouse && !sinMovimiento) {
    const INCLINACION_MAX = 14; // grados (data-tilt="15" lo cambia para esa carta)
    const RIGIDEZ = 300;
    const AMORTIGUACION = 20;
    const REPOSO = 0.01; // grados y grados/s bajo los que el resorte se detiene

    /** Resorte de --rx/--ry de una carta: objetivo(rx, ry) fija hacia dónde va; se anima solo. */
    function crearResorte(carta, inclinacionMax) {
      const limite = inclinacionMax * 1.5;
      const estado = { rx: 0, ry: 0, vx: 0, vy: 0, ox: 0, oy: 0 };
      let cuadro = null;
      let anterior = null; // tiempo del cuadro anterior (solo el reloj de requestAnimationFrame, sin mezclar con performance.now)

      function paso(ahora) {
        // El primer cuadro solo marca el tiempo. Después, el paso nunca es negativo (con dt < 0 el resorte
        // se desboca) y tiene tope (una pestaña en segundo plano no "salta").
        const dt = anterior === null ? 0 : Math.min(Math.max((ahora - anterior) / 1000, 0), 1 / 30);
        anterior = ahora;
        if (dt === 0) {
          cuadro = requestAnimationFrame(paso);
          return;
        }
        estado.vx += (-RIGIDEZ * (estado.rx - estado.ox) - AMORTIGUACION * estado.vx) * dt;
        estado.vy += (-RIGIDEZ * (estado.ry - estado.oy) - AMORTIGUACION * estado.vy) * dt;
        // Seguro: aunque algo falle, la carta nunca pasa de 1,5 veces la inclinación máxima
        estado.rx = Math.max(-limite, Math.min(limite, estado.rx + estado.vx * dt));
        estado.ry = Math.max(-limite, Math.min(limite, estado.ry + estado.vy * dt));
        carta.style.setProperty('--rx', `${estado.rx.toFixed(2)}deg`);
        carta.style.setProperty('--ry', `${estado.ry.toFixed(2)}deg`);
        const quieto = Math.abs(estado.rx - estado.ox) < REPOSO && Math.abs(estado.ry - estado.oy) < REPOSO
          && Math.abs(estado.vx) < REPOSO && Math.abs(estado.vy) < REPOSO;
        if (quieto) {
          cuadro = null;
          if (estado.ox === 0 && estado.oy === 0) carta.classList.remove('tilt-resorte');
          return;
        }
        cuadro = requestAnimationFrame(paso);
      }

      return function objetivo(rx, ry) {
        estado.ox = rx;
        estado.oy = ry;
        carta.classList.add('tilt-resorte');
        if (!cuadro) {
          anterior = null;
          cuadro = requestAnimationFrame(paso);
        }
      };
    }

    document.querySelectorAll('[data-tilt]').forEach((carta) => {
      const inclinacionMax = Number(carta.dataset.tilt) || INCLINACION_MAX;
      const inclinar = crearResorte(carta, inclinacionMax);
      // El área que detecta el mouse es el contenedor (no cambia al inclinarse la carta).
      const zona = carta.parentElement;

      zona.addEventListener('pointerenter', () => carta.classList.add('inclinando'));

      zona.addEventListener('pointermove', (evento) => {
        if (evento.pointerType !== 'mouse') return;
        const rect = carta.getBoundingClientRect();
        const x = Math.min(1, Math.max(0, (evento.clientX - rect.left) / rect.width));
        const y = Math.min(1, Math.max(0, (evento.clientY - rect.top) / rect.height));
        inclinar((0.5 - y) * 2 * inclinacionMax, (x - 0.5) * 2 * inclinacionMax);
        carta.style.setProperty('--brillo-x', `${x * 100}%`);
        carta.style.setProperty('--brillo-y', `${y * 100}%`);
        carta.style.setProperty('--brillo-op', '1');
        // Paralaje: los datos se corren hacia el cursor (de -1 a 1), como si flotaran sobre la carta
        carta.style.setProperty('--px', ((x - 0.5) * 2).toFixed(3));
        carta.style.setProperty('--py', ((y - 0.5) * 2).toFixed(3));
      });

      zona.addEventListener('pointerleave', () => {
        carta.classList.remove('inclinando');
        inclinar(0, 0); // el resorte la devuelve a su lugar, con un leve rebote
        carta.style.setProperty('--brillo-op', '0');
        carta.style.setProperty('--px', '0');
        carta.style.setProperty('--py', '0');
      });
    });
  }

  /* ---------- 6) Botón "Volver" ---------- */
  // Sin página anterior del sitio (enlace directo o pestaña nueva) sigue el href: la página de respaldo.
  // (data-boton-volver y no data-volver: ese lo usan los wizards para ir al paso anterior)
  document.querySelectorAll('[data-boton-volver]').forEach((boton) => {
    boton.addEventListener('click', (evento) => {
      const vieneDelSitio = document.referrer && new URL(document.referrer).origin === window.location.origin;
      if (vieneDelSitio && window.history.length > 1) {
        evento.preventDefault();
        window.history.back();
      }
    });
  });

  /* ---------- 5) Timeline que se rellena con el scroll ---------- */
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
