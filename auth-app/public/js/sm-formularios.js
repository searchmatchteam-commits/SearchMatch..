// public/js/sm-formularios.js
// Comportamientos reutilizables de los formularios NUEVOS (se carga en todas las páginas).
// Cada uno se activa con un atributo data-*, así una vista solo tiene que agregarlo:
//  1) form[data-sm-validar]      → marca los campos obligatorios vacíos (o con mal formato) antes de enviar.
//  2) form[data-confirmar]       → pide confirmación (modal confirmarAccion de main.js) antes de enviar.
//  3) form[data-requiere-aceptar]→ el botón se habilita solo con la casilla marcada (términos).
//  4) [data-ver-password]        → mostrar u ocultar contraseñas (en páginas "auth" ya lo hace auth.js).
//  5) select[data-sm-region] + select[data-sm-comuna] → la lista de comunas muestra solo las de la región.
// Es solo una ayuda: el servidor vuelve a validar todo.

const SM_REGEX_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

document.addEventListener('DOMContentLoaded', () => {
  /* ---------- 1) Campos obligatorios ---------- */

  /** Escribe (o borra) el error de un campo dentro de su .campo. */
  function marcar(campo, mensaje) {
    const contenedor = campo.closest('.campo');
    if (!contenedor) return;
    contenedor.classList.toggle('campo--error', Boolean(mensaje));
    campo.setAttribute('aria-invalid', mensaje ? 'true' : 'false');
    const error = contenedor.querySelector('.campo__error');
    if (error) error.textContent = mensaje || '';
  }

  /** Mensaje de error del campo, o null si está bien. */
  function revisar(campo) {
    const valor = campo.value.trim();
    if (campo.required && !valor) return campo.dataset.mensaje || 'Este campo es obligatorio.';
    if (valor && campo.type === 'email' && !SM_REGEX_CORREO.test(valor)) return 'El formato del correo no es válido.';
    if (valor && campo.minLength > 0 && valor.length < campo.minLength) return `Debe tener al menos ${campo.minLength} caracteres.`;
    if (valor && campo.type === 'number') {
      const numero = Number(valor);
      if (campo.min !== '' && numero < Number(campo.min)) return `Debe ser mayor o igual a ${campo.min}.`;
      if (campo.max !== '' && numero > Number(campo.max)) return `Debe ser menor o igual a ${campo.max}.`;
    }
    return null;
  }

  document.querySelectorAll('form[data-sm-validar]').forEach((formulario) => {
    const campos = Array.from(formulario.querySelectorAll('input[name], select[name], textarea[name]'))
      .filter((campo) => campo.type !== 'hidden' && campo.type !== 'checkbox');

    formulario.addEventListener('submit', (evento) => {
      let primero = null;
      campos.forEach((campo) => {
        if (campo.disabled) return;
        const mensaje = revisar(campo);
        marcar(campo, mensaje);
        if (mensaje && !primero) primero = campo;
      });
      if (primero) {
        evento.preventDefault();
        primero.focus();
        return;
      }
      // Evita el doble envío (solo si el envío sigue en pie: una confirmación pendiente lo detiene)
      const boton = formulario.querySelector('button[type="submit"]');
      if (boton) setTimeout(() => { if (!evento.defaultPrevented) boton.disabled = true; });
    });

    // Al corregir un campo se quita su error
    campos.forEach((campo) => campo.addEventListener('input', () => {
      if (campo.closest('.campo--error') && !revisar(campo)) marcar(campo, null);
    }));
  });

  /* ---------- 2) Confirmar antes de enviar ---------- */
  document.querySelectorAll('form[data-confirmar]').forEach((formulario) => {
    formulario.addEventListener('submit', async (evento) => {
      if (formulario.dataset.confirmado === 'si') return; // ya confirmó: se envía de verdad
      if (evento.defaultPrevented) return; // la validación (1) encontró errores: no se pregunta nada
      evento.preventDefault();
      if (typeof confirmarAccion !== 'function') return formulario.submit();
      const confirmado = await confirmarAccion({
        titulo: formulario.dataset.confirmarTitulo || '¿Estás seguro?',
        texto: formulario.dataset.confirmar,
        confirmar: formulario.dataset.confirmarBoton || 'Confirmar',
      });
      if (!confirmado) return;
      formulario.dataset.confirmado = 'si';
      formulario.requestSubmit();
    });
  });

  /* ---------- 3) Casilla obligatoria (términos) ---------- */
  document.querySelectorAll('form[data-requiere-aceptar]').forEach((formulario) => {
    const casilla = formulario.querySelector('[data-casilla-aceptar]');
    const boton = formulario.querySelector('[data-boton-aceptar]');
    const aviso = formulario.querySelector('[data-aviso-aceptar]');
    if (!casilla || !boton) return;
    const actualizar = () => {
      boton.disabled = !casilla.checked;
      if (aviso) aviso.hidden = casilla.checked;
    };
    casilla.addEventListener('change', actualizar);
    actualizar();
  });

  /* ---------- 4) Mostrar u ocultar contraseña (fuera de las páginas "auth") ---------- */
  if (!document.body.classList.contains('pagina-auth')) {
    document.querySelectorAll('[data-ver-password]').forEach((boton) => {
      boton.addEventListener('click', () => {
        const input = document.getElementById(boton.getAttribute('aria-controls'));
        const mostrar = input.type === 'password';
        input.type = mostrar ? 'text' : 'password';
        boton.setAttribute('aria-pressed', String(mostrar));
        boton.setAttribute('aria-label', mostrar ? 'Ocultar contraseña' : 'Mostrar contraseña');
      });
    });
  }

  /* ---------- 5) Región → comunas ---------- */
  document.querySelectorAll('select[data-sm-region]').forEach((selectRegion) => {
    const selectComuna = document.getElementById(selectRegion.dataset.smRegion);
    if (!selectComuna) return;
    const grupos = Array.from(selectComuna.querySelectorAll('optgroup'));

    function filtrar() {
      const region = selectRegion.value;
      grupos.forEach((grupo) => {
        const visible = !region || grupo.dataset.region === region;
        grupo.hidden = !visible;
        grupo.disabled = !visible;
      });
      const marcada = selectComuna.selectedOptions[0];
      if (marcada && marcada.parentElement.disabled) selectComuna.value = '';
    }

    selectRegion.addEventListener('change', filtrar);
    filtrar();
  });
});
