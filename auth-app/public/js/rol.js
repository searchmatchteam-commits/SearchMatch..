const TEXTOS_BOTON = {
  jugador: 'Continuar como jugador',
  equipo: 'Continuar como equipo',
};

document.addEventListener('DOMContentLoaded', () => {
  const formulario = document.querySelector('form[data-seleccion-rol]');
  if (!formulario) return;

  const boton = formulario.querySelector('[data-boton-rol]');
  const texto = boton.querySelector('.btn__texto');

  function rolElegido() {
    const marcado = formulario.querySelector('input[name="rol"]:checked');
    return marcado ? marcado.value : null;
  }

  function actualizarBoton() {
    const rol = rolElegido();
    boton.disabled = !rol;
    texto.textContent = rol ? TEXTOS_BOTON[rol] : 'Elige una opción';
  }

  formulario.addEventListener('change', actualizarBoton);

  formulario.addEventListener('submit', (evento) => {
    if (!rolElegido() || boton.dataset.enviando) {
      evento.preventDefault();
      return;
    }
    boton.dataset.enviando = 'true';
    boton.setAttribute('aria-busy', 'true');
    texto.textContent = 'Guardando...';
  });

  window.addEventListener('pageshow', (evento) => {
    if (!evento.persisted) return;
    delete boton.dataset.enviando;
    boton.removeAttribute('aria-busy');
    actualizarBoton();
  });

  actualizarBoton();
});
