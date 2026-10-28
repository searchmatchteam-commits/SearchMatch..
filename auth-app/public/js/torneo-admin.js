// public/js/torneo-admin.js
// /admin/super/torneos/:id: buscador por equipo y filtros (Todos / Pendientes / Jugados) de los partidos.
// Oculta las tarjetas que no coinciden y las rondas que quedan vacías.
(function () {
  document.querySelectorAll('[data-cargar-resultados]').forEach(function (panel) {
    const buscador = panel.querySelector('[data-buscar-partido]');
    const pills = panel.querySelectorAll('[data-filtro-partido]');
    const vacio = panel.querySelector('[data-sin-partidos]');
    let filtro = 'todos';

    function aplicar() {
      const texto = buscador.value.trim().toLowerCase();
      let visibles = 0;
      panel.querySelectorAll('.sm-ronda').forEach(function (ronda) {
        let enRonda = 0;
        ronda.querySelectorAll('[data-partido]').forEach(function (p) {
          const ok = (filtro === 'todos' || p.dataset.estado === filtro) && p.dataset.nombres.includes(texto);
          p.hidden = !ok;
          if (ok) enRonda++;
        });
        ronda.hidden = enRonda === 0;
        visibles += enRonda;
      });
      vacio.hidden = visibles > 0;
    }

    buscador.addEventListener('input', aplicar);
    pills.forEach(function (pill) {
      pill.addEventListener('click', function () {
        filtro = pill.dataset.filtroPartido;
        pills.forEach(function (b) { b.setAttribute('aria-pressed', String(b === pill)); });
        aplicar();
      });
    });
  });
})();
