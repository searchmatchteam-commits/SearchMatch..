// public/js/perfil-pro.js
// Escena "cyber-gamer" de /perfil (estilos en public/css/perfil-pro.css):
// El fondo ambiental compartido vive en searchmatch-background.js.
//  2) Caída de la carta: la animación CSS parte del centro superior de la pantalla (--desde-x).
//  3) Conteo de 0 al valor final de la media y las estadísticas, cuando la carta aterriza.
//  4) Radar: se inclina un poco hacia el cursor.
// El tilt y el foil de la carta los mueve main.js ([data-tilt]); aquí no se tocan.
// Con movimiento reducido no hay conteo ni caída (el CSS también la apaga).

document.addEventListener('DOMContentLoaded', () => {
  const sinMovimiento = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const conMouse = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const ATERRIZAJE_MS = 780; // momento de la caída (52% de 1.5s) en que la carta toca el suelo

  /* ---------- PE-001: estado de carga de la carta ---------- */
  // El skeleton se quita cuando están listas las fuentes y la foto (cargada o con error).
  // Tope de 8 s para que nunca quede pegado si algo no responde.
  const heroe = document.querySelector('[data-heroe-carta]');
  if (heroe) {
    const foto = heroe.querySelector('.carta-jugador__foto img[src]');
    const fotoLista = !foto || foto.complete
      ? Promise.resolve()
      : new Promise((listo) => {
        foto.addEventListener('load', listo, { once: true });
        foto.addEventListener('error', listo, { once: true });
      });
    const fuentesListas = document.fonts ? document.fonts.ready : Promise.resolve();
    const tope = new Promise((listo) => setTimeout(listo, 8000));
    Promise.race([Promise.all([fotoLista, fuentesListas]), tope]).then(() => {
      heroe.removeAttribute('aria-busy');
      const texto = heroe.querySelector('[data-carta-cargando-texto]');
      if (texto) texto.textContent = '';
    });
  }

  /* ---------- 2) Caída desde el centro superior ---------- */
  const caida = document.querySelector('[data-caida]');
  if (caida && !sinMovimiento) {
    const rect = caida.getBoundingClientRect();
    const desdeX = window.innerWidth / 2 - (rect.left + rect.width / 2);
    caida.style.setProperty('--desde-x', `${Math.round(desdeX)}px`);
  }

  /* ---------- 3) Conteo de los números ---------- */
  // La media y las stats de la carta, más los valores del radar y la media del panel
  const numeros = [
    ...document.querySelectorAll('.perfil--pro [data-carta-media], .perfil--pro .carta-jugador__stats dd, .perfil--pro [data-contar]'),
  ].filter((el) => /^\d+$/.test(el.textContent.trim()));

  if (!sinMovimiento && numeros.length > 0) {
    const DURACION = 650;
    const finales = numeros.map((el) => Number(el.textContent.trim()));
    numeros.forEach((el) => { el.textContent = '0'; });

    setTimeout(() => {
      // El conteo parte en el primer cuadro y usa solo el reloj de requestAnimationFrame: mezclado con
      // performance.now(), el tiempo del cuadro podía ser anterior al inicio y mostraba números negativos.
      let inicio = null;
      function paso(ahora) {
        if (inicio === null) inicio = ahora;
        const t = Math.min(1, Math.max(0, (ahora - inicio) / DURACION));
        const avance = 1 - Math.pow(1 - t, 3); // frena al final
        numeros.forEach((el, i) => { el.textContent = String(Math.round(finales[i] * avance)); });
        if (t < 1) requestAnimationFrame(paso);
      }
      requestAnimationFrame(paso);
    }, ATERRIZAJE_MS);
  }

  /* ---------- 4) Radar que mira al cursor ---------- */
  const radar = document.querySelector('[data-radar]');
  if (radar && conMouse && !sinMovimiento) {
    const panel = radar.closest('.pp-panel');
    panel.addEventListener('pointermove', (evento) => {
      const r = panel.getBoundingClientRect();
      const x = (evento.clientX - r.left) / r.width - 0.5;
      const y = (evento.clientY - r.top) / r.height - 0.5;
      radar.style.setProperty('--radar-ry', `${(x * 16).toFixed(2)}deg`);
      radar.style.setProperty('--radar-rx', `${(22 - y * 12).toFixed(2)}deg`);
    });
    panel.addEventListener('pointerleave', () => {
      radar.style.removeProperty('--radar-ry');
      radar.style.removeProperty('--radar-rx');
    });
  }
});
