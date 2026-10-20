// public/js/auth.js
// Formularios de login y registro (form[data-validar]):
//  1) Validación en el navegador: campos obligatorios, formato del correo,
//     celular chileno, contraseña de 8+ caracteres y confirmación.
//  2) Errores bajo cada campo + resumen en la alerta roja bajo el formulario.
//  3) Estado "cargando": spinner y botón deshabilitado mientras responde el servidor.
//  4) Botón de ojo para mostrar u ocultar las contraseñas ([data-ver-password]).
// Es solo una ayuda para el usuario: la validación real la repite el servidor
// (middlewares/validators.js), así que las reglas deben coincidir con las de allá.

const REGEX_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const REGEX_CELULAR_CL = /^(?:\+?56)?9\d{8}$/;
const LONGITUD_MINIMA_PASSWORD = 8;

// Reglas por campo. Cada una recibe el valor (y el formulario) y devuelve
// el mensaje de error, o null si el valor es válido.
const REGLAS = {
  nombre: (valor) => (valor ? null : 'El nombre es obligatorio.'),

  apellido: (valor) => (valor ? null : 'El apellido es obligatorio.'),

  correo: (valor) => {
    if (!valor) return 'El correo es obligatorio.';
    if (!REGEX_CORREO.test(valor)) return 'El formato del correo no es válido.';
    return null;
  },

  telefono: (valor) => {
    if (!valor) return 'El teléfono es obligatorio.';
    if (!REGEX_CELULAR_CL.test(valor.replace(/[\s\-().]/g, ''))) {
      return 'El teléfono debe ser un celular chileno, por ejemplo +56 9 1234 5678.';
    }
    return null;
  },

  fecha_nacimiento: (valor) => {
    if (!valor) return 'La fecha de nacimiento es obligatoria.';
    // "AAAA-MM-DD" se compara bien como texto
    if (valor > new Date().toISOString().slice(0, 10)) return 'La fecha de nacimiento no puede estar en el futuro.';
    return null;
  },

  password: (valor, formulario) => {
    if (!valor) return 'La contraseña es obligatoria.';
    // En el login no exigimos largo mínimo: cuentas antiguas podrían tener otra regla.
    if (formulario.dataset.validar === 'registro' && valor.length < LONGITUD_MINIMA_PASSWORD) {
      return `La contraseña debe tener al menos ${LONGITUD_MINIMA_PASSWORD} caracteres.`;
    }
    return null;
  },

  confirmar_password: (valor, formulario) => {
    if (!valor) return 'Confirma tu contraseña.';
    if (valor !== formulario.elements.password.value) return 'Las contraseñas no coinciden.';
    return null;
  },
};

/** Valida un campo, pinta su error y devuelve el mensaje (o null). */
function validarCampo(input, formulario) {
  const regla = REGLAS[input.name];
  if (!regla) return null;

  // Las contraseñas no se recortan (aunque estén visibles, con type="text").
  const esPassword = input.name === 'password' || input.name === 'confirmar_password';
  const valor = esPassword ? input.value : input.value.trim();
  const mensaje = regla(valor, formulario);

  const campo = input.closest('.campo');
  campo.classList.toggle('campo--error', Boolean(mensaje));
  input.setAttribute('aria-invalid', mensaje ? 'true' : 'false');
  const salida = campo.querySelector('.campo__error');
  if (salida) salida.textContent = mensaje || '';

  return mensaje;
}

/** Muestra (o esconde, con una lista vacía) la alerta roja bajo el formulario. */
function mostrarAlerta(alerta, mensajes) {
  if (!alerta) return;
  const lista = alerta.querySelector('ul');
  lista.replaceChildren(
    ...mensajes.map((mensaje) => {
      const li = document.createElement('li');
      li.textContent = mensaje;
      return li;
    })
  );
  alerta.hidden = mensajes.length === 0;
}

/** Alterna una contraseña entre visible y oculta, y actualiza el botón del ojo. */
function alternarPassword(boton) {
  const input = document.getElementById(boton.getAttribute('aria-controls'));
  const visible = input.type === 'password';
  input.type = visible ? 'text' : 'password';
  boton.setAttribute('aria-pressed', String(visible));
  boton.setAttribute('aria-label', visible ? 'Ocultar contraseña' : 'Mostrar contraseña');
}

/** Activa o desactiva el estado "cargando" del botón de envío. */
function ponerCargando(boton, cargando) {
  const texto = boton.querySelector('.btn__texto');
  if (!boton.dataset.textoOriginal) boton.dataset.textoOriginal = texto.textContent;

  boton.disabled = cargando;
  boton.classList.toggle('btn--cargando', cargando);
  boton.setAttribute('aria-busy', String(cargando));
  texto.textContent = cargando ? boton.dataset.textoCargando : boton.dataset.textoOriginal;
}

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('[data-ver-password]').forEach((boton) => {
    boton.addEventListener('click', () => alternarPassword(boton));
  });

  document.querySelectorAll('form[data-validar]').forEach((formulario) => {
    const boton = formulario.querySelector('button[type="submit"]');
    const alerta = formulario.parentElement.querySelector('[data-alerta-errores]');
    const inputs = Array.from(formulario.querySelectorAll('input[name]'));

    formulario.addEventListener('submit', (evento) => {
      // Evita doble envío si el usuario hace clic varias veces.
      if (boton.disabled) {
        evento.preventDefault();
        return;
      }

      const errores = [];
      let primerInvalido = null;
      inputs.forEach((input) => {
        const mensaje = validarCampo(input, formulario);
        if (mensaje) {
          errores.push(mensaje);
          if (!primerInvalido) primerInvalido = input;
        }
      });

      mostrarAlerta(alerta, errores);

      if (primerInvalido) {
        evento.preventDefault();
        primerInvalido.focus();
        return;
      }

      // Todo válido: el formulario se envía normalmente (POST) y el servidor
      // responde con una redirección al dashboard o con la página y sus errores.
      ponerCargando(boton, true);
    });

    // Re-valida en vivo los campos que ya se marcaron como erróneos.
    formulario.addEventListener('input', (evento) => {
      const input = evento.target;
      if (input.closest('.campo--error')) validarCampo(input, formulario);
      // Si cambia la contraseña, la confirmación puede pasar a coincidir (o dejar de hacerlo).
      const confirmar = formulario.elements.confirmar_password;
      if (input.name === 'password' && confirmar && confirmar.closest('.campo--error')) {
        validarCampo(confirmar, formulario);
      }
    });

    // Al salir de un campo con contenido se valida (no molestamos con campos aún vacíos).
    formulario.addEventListener('focusout', (evento) => {
      const input = evento.target;
      if (input.matches('input[name]') && input.value) validarCampo(input, formulario);
    });
  });

  // Al volver con el botón "Atrás", el navegador puede restaurar la página desde
  // su caché con el botón aún en "cargando": lo dejamos listo de nuevo.
  window.addEventListener('pageshow', (evento) => {
    if (!evento.persisted) return;
    document.querySelectorAll('form[data-validar] button[type="submit"]').forEach((boton) => {
      if (boton.dataset.textoOriginal) ponerCargando(boton, false);
    });
  });
});
