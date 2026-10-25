const SM_REGEX_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

document.addEventListener('DOMContentLoaded', () => {

  function marcar(campo, mensaje) {
    const contenedor = campo.closest('.campo');
    if (!contenedor) return;
    contenedor.classList.toggle('campo--error', Boolean(mensaje));
    campo.setAttribute('aria-invalid', mensaje ? 'true' : 'false');
    const error = contenedor.querySelector('.campo__error');
    if (error) error.textContent = mensaje || '';
  }

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
      const boton = formulario.querySelector('button[type="submit"]');
      if (boton) setTimeout(() => { if (!evento.defaultPrevented) boton.disabled = true; });
    });

    campos.forEach((campo) => campo.addEventListener('input', () => {
      if (campo.closest('.campo--error') && !revisar(campo)) marcar(campo, null);
    }));
  });

  document.querySelectorAll('form[data-confirmar]').forEach((formulario) => {
    formulario.addEventListener('submit', async (evento) => {
      if (formulario.dataset.confirmado === 'si') return;
      if (evento.defaultPrevented) return;
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
