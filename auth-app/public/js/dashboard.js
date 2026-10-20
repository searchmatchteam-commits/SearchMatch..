// public/js/dashboard.js
// Dashboard: "Buscar partido" y los íconos de canchas y equipos del dock
// todavía no tienen backend, así que muestran un aviso flotante con el texto de data-proximamente.

const DURACION_AVISO_MS = 3200;

document.addEventListener('DOMContentLoaded', () => {
  const aviso = document.querySelector('[data-aviso]');
  if (!aviso) return;
  let temporizador;

  document.querySelectorAll('[data-proximamente]').forEach((boton) => {
    boton.addEventListener('click', () => {
      aviso.textContent = boton.dataset.proximamente;
      aviso.classList.add('panel-aviso--visible');
      clearTimeout(temporizador);
      temporizador = setTimeout(() => aviso.classList.remove('panel-aviso--visible'), DURACION_AVISO_MS);
    });
  });
});
