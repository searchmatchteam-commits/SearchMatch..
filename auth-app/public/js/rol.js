// public/js/rol.js
// Pantalla de bienvenida al registro (form[data-seleccion-rol]):
//  - Al enviar, muestra "Cargando..." y evita el doble envío.
// El servidor guarda el rol y redirige a los datos del jugador (rolController.guardarSeleccion).

document.addEventListener('DOMContentLoaded', () => {
  const formulario = document.querySelector('form[data-seleccion-rol]');
  if (!formulario) return;

  const boton = formulario.querySelector('[data-boton-rol]');
  const texto = boton.querySelector('.btn__texto');
  const textoOriginal = texto.textContent;

  formulario.addEventListener('submit', (evento) => {
    if (boton.dataset.enviando) {
      evento.preventDefault();
      return;
    }
    boton.dataset.enviando = 'true';
    boton.setAttribute('aria-busy', 'true');
    texto.textContent = 'Cargando...';
  });

  // Al volver con "Atrás" desde la caché del navegador, el botón queda listo otra vez.
  window.addEventListener('pageshow', (evento) => {
    if (!evento.persisted) return;
    delete boton.dataset.enviando;
    boton.removeAttribute('aria-busy');
    texto.textContent = textoOriginal;
  });
});
