// public/js/main.js
// Comportamiento del lado del navegador.
// Aquí solo validamos en cliente los campos obligatorios antes de enviar
// (la validación real siempre la hace el servidor en middlewares/validators.js).

document.addEventListener('DOMContentLoaded', () => {
  const formularios = document.querySelectorAll('form.formulario');

  formularios.forEach((formulario) => {
    formulario.addEventListener('submit', (evento) => {
      const campos = formulario.querySelectorAll('input[required]');
      let valido = true;

      campos.forEach((campo) => {
        if (!campo.value.trim()) {
          valido = false;
          campo.style.borderColor = '#dc2626';
        } else {
          campo.style.borderColor = '';
        }
      });

      if (!valido) {
        evento.preventDefault();
        alert('Por favor, completa todos los campos obligatorios.');
      }
    });
  });
});
