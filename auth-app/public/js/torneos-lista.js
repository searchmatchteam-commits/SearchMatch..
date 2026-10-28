/* public/js/torneos-lista.js
   Galería de torneos (/torneos):
   - Filtros Todos | Mis torneos | Próximos, combinados con el menú "Filtrar por" (formato o modalidad).
   - Flechas del carrusel: avanzan una carta y se desactivan en los extremos.
   - Fotos con fondo blanco: si las esquinas de la imagen son casi blancas, se marca con
     .tl-carta__foto--fondo-claro y el CSS la funde con la carta oscura. Si no carga, se quita
     y quedan las iniciales del torneo. */
(function () {
  'use strict';

  const galeria = document.querySelector('[data-galeria-torneos]');
  const filtros = document.querySelector('[data-filtros-torneos]');
  const extra = document.querySelector('[data-filtro-extra]');
  const vacio = document.querySelector('[data-sin-resultados]');
  const flechas = Array.from(document.querySelectorAll('[data-carrusel-mover]'));
  const NOTAS = {
    todos: 'Prueba con otro filtro.',
    mios: 'Ninguno de tus equipos está inscrito en un torneo. Revisa los próximos e inscríbete.',
    proximos: 'No hay torneos con inscripciones abiertas por ahora.',
  };

  // ---------- Carrusel ----------
  function actualizarFlechas() {
    if (!galeria) return;
    const fin = galeria.scrollWidth - galeria.clientWidth - 2;
    flechas.forEach(function (b) {
      b.disabled = b.dataset.carruselMover === '-1' ? galeria.scrollLeft <= 2 : galeria.scrollLeft >= fin;
    });
  }

  if (galeria) {
    flechas.forEach(function (b) {
      b.addEventListener('click', function () {
        const carta = galeria.querySelector('.tl-carta:not([hidden])');
        const paso = carta ? carta.offsetWidth + 24 : galeria.clientWidth * 0.8;
        galeria.scrollBy({ left: paso * Number(b.dataset.carruselMover) });
      });
    });
    galeria.addEventListener('scroll', actualizarFlechas, { passive: true });
    window.addEventListener('resize', actualizarFlechas);
    actualizarFlechas();
  }

  // ---------- Filtros ----------
  if (filtros && galeria) {
    const botones = Array.from(filtros.querySelectorAll('[data-filtro]'));
    const cartas = Array.from(galeria.children);
    let pestana = 'todos';

    function aplicar() {
      const [campo, valor] = extra && extra.value ? extra.value.split(/:(.*)/) : [null, null];
      let visibles = 0;
      cartas.forEach(function (c) {
        const porPestana = pestana === 'todos'
          || (pestana === 'mios' && c.dataset.mio === 'true')
          || (pestana === 'proximos' && c.dataset.estado === 'abierto');
        const porMenu = !campo || c.dataset[campo] === valor;
        c.hidden = !(porPestana && porMenu);
        if (!c.hidden) visibles++;
      });
      if (vacio) {
        vacio.hidden = visibles > 0;
        vacio.querySelector('[data-sin-resultados-nota]').textContent = NOTAS[pestana];
      }
      galeria.scrollLeft = 0;
      actualizarFlechas();
    }

    function elegir(boton, enfocar) {
      pestana = boton.dataset.filtro;
      botones.forEach(function (b) {
        const activo = b === boton;
        b.setAttribute('aria-selected', String(activo));
        b.tabIndex = activo ? 0 : -1;
      });
      if (enfocar) boton.focus();
      aplicar();
    }

    botones.forEach(function (boton, i) {
      boton.addEventListener('click', function () { elegir(boton, false); });
      boton.addEventListener('keydown', function (e) {
        let destino = null;
        if (e.key === 'ArrowRight') destino = botones[(i + 1) % botones.length];
        else if (e.key === 'ArrowLeft') destino = botones[(i - 1 + botones.length) % botones.length];
        if (destino) {
          e.preventDefault();
          elegir(destino, true);
        }
      });
    });
    if (extra) extra.addEventListener('change', aplicar);
  }

  // ---------- Fotos con fondo blanco ----------
  function fondoClaro(img) {
    try {
      const lienzo = document.createElement('canvas');
      const tam = 24;
      lienzo.width = tam;
      lienzo.height = tam;
      const ctx = lienzo.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0, tam, tam);
      // Promedio de las cuatro esquinas (2x2 píxeles cada una)
      const esquinas = [[0, 0], [tam - 2, 0], [0, tam - 2], [tam - 2, tam - 2]];
      let claros = 0;
      esquinas.forEach(function ([x, y]) {
        const d = ctx.getImageData(x, y, 2, 2).data;
        let luz = 0;
        for (let i = 0; i < d.length; i += 4) luz += (d[i] + d[i + 1] + d[i + 2]) / 3;
        if (luz / 4 > 225) claros++;
      });
      return claros >= 3;
    } catch (err) {
      return false; // imagen de otro origen: el canvas no deja leerla
    }
  }

  document.querySelectorAll('[data-foto-torneo]').forEach(function (img) {
    function revisar() {
      if (fondoClaro(img)) img.classList.add('tl-carta__foto--fondo-claro');
      img.classList.add('tl-carta__foto--lista');
    }
    if (img.complete && img.naturalWidth) revisar();
    else {
      img.addEventListener('load', revisar, { once: true });
      img.addEventListener('error', function () { img.remove(); }, { once: true });
    }
  });
})();
