/* public/js/torneos-lista.js
   Galería de torneos (/torneos):
   - Filtros Todos | Mis torneos, combinados con el menú "Filtrar por" (formato o modalidad).
   - Si una foto no carga, se cambia por la imagen por defecto. */
(function () {
  'use strict';

  const galeria = document.querySelector('[data-galeria-torneos]');
  const filtros = document.querySelector('[data-filtros-torneos]');
  const extra = document.querySelector('[data-filtro-extra]');
  const vacio = document.querySelector('[data-sin-resultados]');
  const FOTO_POR_DEFECTO = '/img/torneo-placeholder.svg';
  const NOTAS = {
    todos: 'Prueba con otro filtro.',
    mios: 'Ninguno de tus equipos está inscrito en un torneo. Revisa los abiertos e inscríbete.',
  };

  // ---------- Filtros ----------
  if (filtros && galeria) {
    const botones = Array.from(filtros.querySelectorAll('[data-filtro]'));
    const cartas = Array.from(galeria.children);
    let pestana = 'todos';

    function aplicar() {
      const [campo, valor] = extra && extra.value ? extra.value.split(/:(.*)/) : [null, null];
      let visibles = 0;
      cartas.forEach(function (c) {
        const porPestana = pestana === 'todos' || c.dataset.mio === 'true';
        const porMenu = !campo || c.dataset[campo] === valor;
        c.hidden = !(porPestana && porMenu);
        if (!c.hidden) visibles++;
      });
      if (vacio) {
        vacio.hidden = visibles > 0;
        vacio.querySelector('[data-sin-resultados-nota]').textContent = NOTAS[pestana];
      }
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

  // ---------- Foto que no carga ----------
  document.querySelectorAll('[data-foto-torneo]').forEach(function (img) {
    function usarPorDefecto() {
      if (img.getAttribute('src') !== FOTO_POR_DEFECTO) img.src = FOTO_POR_DEFECTO;
    }
    if (img.complete && !img.naturalWidth) usarPorDefecto();
    else img.addEventListener('error', usarPorDefecto, { once: true });
  });
})();
