// public/js/visualizador-corporal.js
// Visualizador corporal (views/partials/visualizador-corporal.ejs): coloca la silueta según
// data-altura (cm) y data-peso (kg) del <figure data-visualizador-corporal>.
//  - Altura: la silueta escala hasta que la cabeza toca esa marca de la regla.
//  - Peso: el IMC ensancha torso, brazos y piernas (solo en X); la cabeza no se deforma.
// Si data-altura o data-peso cambian, la silueta se anima (~300 ms). Para conectarlo a otra fuente:
//   visualizador.dataset.altura = 182; visualizador.dataset.peso = 80;

(() => {
  const DURACION_MS = 300;
  const POR_DEFECTO = { altura: 178, peso: 72 };
  const ALTURA_DIBUJO = [130, 215]; // límites del dibujo (las etiquetas muestran el valor real)
  const ALTO_FIGURA = 100;          // la silueta mide 100 unidades (pies en 0, cabeza en -100)
  const MEDIO_ANCHO_FIGURA = 16.6;  // de la mano al centro: la etiqueta del peso va más allá de la mano
  const ALTURA_CINTURA = 50;        // la etiqueta del peso va a la altura de la cintura
  const MEDIO_ANCHO_CINTURA = 9;    // de la cintura al centro: ahí empieza la guía hacia la etiqueta
  // IMC → factor de ancho, lineal por tramos y con límites en los extremos
  const TRAMOS_IMC = [[16, 0.8], [22, 1], [35, 1.35]];

  const sinMovimiento = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const limitar = (valor, min, max) => Math.min(max, Math.max(min, valor));

  function factorAncho(imc) {
    if (imc <= TRAMOS_IMC[0][0]) return TRAMOS_IMC[0][1];
    for (let i = 1; i < TRAMOS_IMC.length; i++) {
      const [imcA, factorA] = TRAMOS_IMC[i - 1];
      const [imcB, factorB] = TRAMOS_IMC[i];
      if (imc <= imcB) return factorA + ((factorB - factorA) * (imc - imcA)) / (imcB - imcA);
    }
    return TRAMOS_IMC[TRAMOS_IMC.length - 1][1];
  }

  function iniciar(visualizador) {
    const svg = visualizador.querySelector('svg');
    const piso = Number(svg.dataset.piso);
    const pxCm = Number(svg.dataset.pxCm);
    const centro = Number(svg.dataset.centro);
    const limiteTexto = Number(svg.dataset.limiteTexto); // x máximo donde puede terminar un texto
    const figura = svg.querySelector('.vc__figura');
    const cuerpo = svg.querySelector('.vc__cuerpo');
    const lineaAltura = svg.querySelector('.vc__altura line');
    const textoAltura = svg.querySelector('.vc__altura text');
    const textoPeso = svg.querySelector('.vc__peso');
    const guiaPeso = svg.querySelector('.vc__peso-guia');

    const leer = () => {
      const altura = Number(visualizador.dataset.altura);
      const peso = Number(visualizador.dataset.peso);
      return {
        altura: altura > 0 ? altura : POR_DEFECTO.altura,
        peso: peso > 0 ? peso : POR_DEFECTO.peso,
      };
    };

    function dibujar({ altura, peso }) {
      const alturaDibujo = limitar(altura, ...ALTURA_DIBUJO);
      const escala = (alturaDibujo * pxCm) / ALTO_FIGURA;
      const ancho = factorAncho(peso / (altura / 100) ** 2);
      const yCabeza = piso - alturaDibujo * pxCm;

      figura.setAttribute('transform', `translate(${centro} ${piso}) scale(${escala})`);
      cuerpo.setAttribute('transform', `scale(${ancho} 1)`);
      lineaAltura.setAttribute('y1', yCabeza);
      lineaAltura.setAttribute('y2', yCabeza);
      textoAltura.setAttribute('y', yCabeza - 5);
      textoAltura.textContent = `${Math.round(altura)} cm`;
      const yCintura = piso - ALTURA_CINTURA * escala;
      textoPeso.textContent = `${Math.round(peso)} kg`;
      // Más allá de la mano, pero sin pasarse del borde de la cuadrícula (con pesos altos la silueta es más ancha)
      const xEtiqueta = Math.min(centro + MEDIO_ANCHO_FIGURA * escala * ancho + 12, limiteTexto - textoPeso.getComputedTextLength());
      guiaPeso.setAttribute('x1', centro + MEDIO_ANCHO_CINTURA * escala * ancho);
      guiaPeso.setAttribute('x2', xEtiqueta - 4);
      guiaPeso.setAttribute('y1', yCintura);
      guiaPeso.setAttribute('y2', yCintura);
      textoPeso.setAttribute('x', xEtiqueta);
      textoPeso.setAttribute('y', yCintura);
      svg.setAttribute('aria-label', `Altura ${Math.round(altura)} cm, peso ${Math.round(peso)} kg`);
    }

    let actual = leer();
    let cuadro = null;
    dibujar(actual);
    visualizador.classList.add('vc--listo');

    // Transición de los valores actuales a los nuevos (ease-out); un cambio a mitad parte desde donde va
    function animarHacia(destino) {
      if (cuadro) cancelAnimationFrame(cuadro);
      if (sinMovimiento) {
        actual = destino;
        dibujar(actual);
        return;
      }
      const origen = actual;
      const inicio = performance.now();
      const paso = (ahora) => {
        const t = Math.min(1, (ahora - inicio) / DURACION_MS);
        const avance = 1 - (1 - t) ** 3;
        actual = {
          altura: origen.altura + (destino.altura - origen.altura) * avance,
          peso: origen.peso + (destino.peso - origen.peso) * avance,
        };
        dibujar(actual);
        cuadro = t < 1 ? requestAnimationFrame(paso) : null;
      };
      cuadro = requestAnimationFrame(paso);
    }

    new MutationObserver(() => animarHacia(leer()))
      .observe(visualizador, { attributes: true, attributeFilter: ['data-altura', 'data-peso'] });
  }

  document.querySelectorAll('[data-visualizador-corporal]').forEach(iniciar);
})();
