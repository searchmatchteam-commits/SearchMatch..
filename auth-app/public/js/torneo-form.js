// public/js/torneo-form.js
// Formulario de torneo del superadministrador (/admin/super/torneos/nuevo y /editar).
//  - Vista previa de la foto elegida.
//  - Patrocinadores: muestra un bloque y "+ Agregar otro patrocinador" revela el siguiente.
//  - Cantidad de equipos: solo deja elegir las válidas para el tipo (relámpago 4/8/16/32, liga 3 a 20).
// Sin JavaScript el formulario funciona igual: se ven todos los bloques y el servidor valida.

(function () {
  const form = document.querySelector('[data-torneo-form]');
  if (!form) return;

  const inputFoto = form.querySelector('[data-foto-input]');
  const vistaFoto = form.querySelector('[data-foto-vista]');
  if (inputFoto && vistaFoto) {
    inputFoto.addEventListener('change', () => {
      const archivo = inputFoto.files[0];
      if (!archivo) return;
      vistaFoto.src = URL.createObjectURL(archivo);
      vistaFoto.hidden = false;
    });
  }

  const bloques = [...form.querySelectorAll('[data-patrocinador]')];
  const botonAgregar = form.querySelector('[data-agregar-patrocinador]');
  const tieneDatos = (b) => b.classList.contains('campo--error') || [...b.querySelectorAll('input')].some((i) => i.value);
  bloques.forEach((b, i) => { b.hidden = i > 0 && !tieneDatos(b); });
  function actualizarBoton() {
    botonAgregar.hidden = !bloques.some((b) => b.hidden);
  }
  if (botonAgregar) {
    actualizarBoton();
    botonAgregar.addEventListener('click', () => {
      const siguiente = bloques.find((b) => b.hidden);
      if (!siguiente) return;
      siguiente.hidden = false;
      siguiente.querySelector('input').focus();
      actualizarBoton();
    });
  }

  const formato = form.querySelector('[data-formato]');
  const cantidad = form.querySelector('[data-cantidad]');
  function filtrarCantidades() {
    if (!formato || !cantidad || cantidad.disabled) return;
    [...cantidad.options].forEach((op) => {
      if (!op.value) return;
      const valida = !formato.value || op.dataset[formato.value] === 'true';
      op.hidden = !valida;
      op.disabled = !valida;
      if (!valida && op.selected) cantidad.value = '';
    });
  }
  if (formato) formato.addEventListener('change', filtrarCantidades);
  filtrarCantidades();
})();
