/* public/js/torneo-detalle.js
   Detalle de un torneo (/torneos/:id):
   - Pestañas Información | Equipos inscritos | Cuadrante (clic y flechas del teclado).
   - "Inscribir equipo": modal para elegir el equipo y aceptar las reglas.
   - Cuadrante: al pasar el mouse (o el foco) por un equipo, se ilumina en verde su camino en la llave.
   - Victoria: si el capitán ganó el torneo, modal "¡Campeones!" la primera vez que entra. */
(function () {
  'use strict';

  // ---------- Pestañas ----------
  document.querySelectorAll('[data-pestanas]').forEach(function (contenedor) {
    const pestanas = Array.from(contenedor.querySelectorAll('[role="tab"]'));

    function activar(pestana, enfocar) {
      pestanas.forEach(function (p) {
        const activa = p === pestana;
        p.setAttribute('aria-selected', String(activa));
        p.tabIndex = activa ? 0 : -1;
        const panel = document.getElementById(p.getAttribute('aria-controls'));
        if (panel) panel.hidden = !activa;
      });
      if (enfocar) pestana.focus();
    }

    pestanas.forEach(function (pestana, i) {
      pestana.addEventListener('click', function () { activar(pestana, false); });
      pestana.addEventListener('keydown', function (e) {
        let destino = null;
        if (e.key === 'ArrowRight') destino = pestanas[(i + 1) % pestanas.length];
        else if (e.key === 'ArrowLeft') destino = pestanas[(i - 1 + pestanas.length) % pestanas.length];
        else if (e.key === 'Home') destino = pestanas[0];
        else if (e.key === 'End') destino = pestanas[pestanas.length - 1];
        if (destino) {
          e.preventDefault();
          activar(destino, true);
        }
      });
    });
  });

  // ---------- Modal "Inscribir equipo" ----------
  // Lo abren los botones del panel, de Información y de Equipos inscritos. Escape, "Cancelar" o un clic
  // fuera de la caja lo cierran. Tras habilitar la modalidad (?aviso=modalidad-agregada) se abre solo.
  const modal = document.querySelector('[data-modal-inscripcion]');
  if (modal) {
    let anterior = null;

    function abrir() {
      anterior = document.activeElement;
      modal.hidden = false;
      modal.querySelector('select').focus();
      document.addEventListener('keydown', teclas);
    }
    function cerrar() {
      modal.hidden = true;
      document.removeEventListener('keydown', teclas);
      if (anterior && anterior.focus) anterior.focus();
    }
    function teclas(e) {
      if (e.key === 'Escape') cerrar();
    }

    document.querySelectorAll('[data-abrir-inscripcion]').forEach(function (boton) {
      boton.addEventListener('click', abrir);
    });
    modal.querySelector('[data-cerrar-modal]').addEventListener('click', cerrar);
    modal.addEventListener('click', function (e) { if (e.target === modal) cerrar(); });

    if (new URLSearchParams(location.search).get('aviso') === 'modalidad-agregada') abrir();
  }

  // ---------- Modal de victoria ----------
  // Se abre solo la primera vez que el capitán campeón entra al torneo (se recuerda en este navegador).
  // "Compartir logro" usa el menú nativo de compartir; sin él, copia el enlace.
  const victoria = document.querySelector('[data-modal-victoria]');
  if (victoria) {
    const clave = 'sm-victoria-vista-' + victoria.dataset.torneo;
    const principal = victoria.querySelector('[data-cerrar-victoria]');
    const compartir = victoria.querySelector('[data-compartir-victoria]');
    const etiqueta = victoria.querySelector('[data-compartir-etiqueta]');
    let vista = false;
    try { vista = localStorage.getItem(clave) === '1'; } catch (e) { /* sin almacenamiento: se muestra igual */ }

    function cerrarVictoria() {
      victoria.hidden = true;
      document.removeEventListener('keydown', teclasVictoria);
      try { localStorage.setItem(clave, '1'); } catch (e) { /* sin almacenamiento */ }
    }
    function teclasVictoria(e) {
      if (e.key === 'Escape') cerrarVictoria();
      // El foco no sale del modal: solo hay dos botones
      if (e.key === 'Tab') {
        e.preventDefault();
        (document.activeElement === principal ? compartir : principal).focus();
      }
    }

    principal.addEventListener('click', cerrarVictoria);
    victoria.addEventListener('click', function (e) { if (e.target === victoria) cerrarVictoria(); });
    compartir.addEventListener('click', function () {
      const datos = { title: document.title, text: victoria.dataset.compartirTexto, url: location.origin + location.pathname };
      if (navigator.share) {
        navigator.share(datos).catch(function () { /* el usuario canceló */ });
      } else if (navigator.clipboard) {
        navigator.clipboard.writeText(datos.text + ' ' + datos.url).then(function () {
          etiqueta.textContent = '¡Enlace copiado!';
          setTimeout(function () { etiqueta.textContent = 'Compartir logro'; }, 2200);
        });
      }
    });

    if (!vista) {
      victoria.hidden = false;
      principal.focus();
      document.addEventListener('keydown', teclasVictoria);
    }
  }

  // ---------- Camino de un equipo en la llave ----------
  document.querySelectorAll('[data-llave]').forEach(function (llave) {
    const equipos = llave.querySelectorAll('[data-equipo]');
    const partidos = llave.querySelectorAll('.sm-partido');

    function iluminar(id) {
      llave.classList.toggle('trn-llave--enfocada', id !== null);
      equipos.forEach(function (el) {
        el.classList.toggle('trn-camino', id !== null && el.dataset.equipo === id);
      });
      partidos.forEach(function (p) {
        p.classList.toggle('trn-camino-partido', id !== null && !!p.querySelector('[data-equipo="' + id + '"]'));
      });
    }

    equipos.forEach(function (el) {
      el.tabIndex = 0;
      el.addEventListener('mouseenter', function () { iluminar(el.dataset.equipo); });
      el.addEventListener('focus', function () { iluminar(el.dataset.equipo); });
      el.addEventListener('mouseleave', function () { iluminar(null); });
      el.addEventListener('blur', function () { iluminar(null); });
    });
  });
})();
