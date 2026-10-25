const REGEX_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const REGEX_CELULAR_CL = /^(?:\+?56)?9\d{8}$/;
const LONGITUD_MINIMA_PASSWORD = 8;
const EDAD_MINIMA = 18;

function calcularEdad(valor) {
  const [anio, mes, dia] = valor.split('-').map(Number);
  const hoy = new Date();
  let edad = hoy.getFullYear() - anio;
  if (hoy.getMonth() + 1 < mes || (hoy.getMonth() + 1 === mes && hoy.getDate() < dia)) edad -= 1;
  return edad;
}

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
    if (valor > new Date().toISOString().slice(0, 10)) return 'La fecha de nacimiento no puede estar en el futuro.';
    if (calcularEdad(valor) < EDAD_MINIMA) return `Debes tener al menos ${EDAD_MINIMA} años para registrarte.`;
    return null;
  },

  password: (valor, formulario) => {
    if (!valor) return 'La contraseña es obligatoria.';
    if (formulario.dataset.validar === 'registro' && valor.length < LONGITUD_MINIMA_PASSWORD) {
      return `La contraseña debe tener al menos ${LONGITUD_MINIMA_PASSWORD} caracteres.`;
    }
    if (formulario.dataset.validar === 'registro' && (!/[A-Za-zÁÉÍÓÚÑáéíóúñ]/.test(valor) || !/\d/.test(valor))) {
      return 'La contraseña debe combinar letras y números.';
    }
    return null;
  },

  nombre_equipo: (valor) => (valor ? null : 'El nombre del equipo es obligatorio.'),

  id_comuna: (valor) => (valor ? null : 'Elige la comuna del equipo.'),

  confirmar_password: (valor, formulario) => {
    if (!valor) return 'Confirma tu contraseña.';
    if (valor !== formulario.elements.password.value) return 'Las contraseñas no coinciden.';
    return null;
  },
};

function validarCampo(input, formulario) {
  const regla = REGLAS[input.name];
  if (!regla) return null;

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

function alternarPassword(boton) {
  const input = document.getElementById(boton.getAttribute('aria-controls'));
  const visible = input.type === 'password';
  input.type = visible ? 'text' : 'password';
  boton.setAttribute('aria-pressed', String(visible));
  boton.setAttribute('aria-label', visible ? 'Ocultar contraseña' : 'Mostrar contraseña');
}

function ponerCargando(boton, cargando) {
  const texto = boton.querySelector('.btn__texto');
  if (!boton.dataset.textoOriginal) boton.dataset.textoOriginal = texto.textContent;

  boton.disabled = cargando;
  boton.classList.toggle('btn--cargando', cargando);
  boton.setAttribute('aria-busy', String(cargando));
  texto.textContent = cargando ? boton.dataset.textoCargando : boton.dataset.textoOriginal;
  const tarjeta = boton.closest('.auth__tarjeta');
  if (tarjeta) tarjeta.classList.toggle('auth__tarjeta--enviando', cargando);
}

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('[data-ver-password]').forEach((boton) => {
    boton.addEventListener('click', () => alternarPassword(boton));
  });

  document.querySelectorAll('form[data-validar]').forEach((formulario) => {
    const boton = formulario.querySelector('button[type="submit"]');
    const alerta = formulario.parentElement.querySelector('[data-alerta-errores]');
    const inputs = Array.from(formulario.querySelectorAll('input[name], select[name]'));

    formulario.addEventListener('submit', (evento) => {
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

      ponerCargando(boton, true);
    });

    formulario.addEventListener('input', (evento) => {
      const input = evento.target;
      if (input.closest('.campo--error')) validarCampo(input, formulario);
      const confirmar = formulario.elements.confirmar_password;
      if (input.name === 'password' && confirmar && confirmar.closest('.campo--error')) {
        validarCampo(confirmar, formulario);
      }
    });

    formulario.addEventListener('focusout', (evento) => {
      const input = evento.target;
      if (input.matches('input[name], select[name]') && input.value) validarCampo(input, formulario);
    });
  });

  window.addEventListener('pageshow', (evento) => {
    if (!evento.persisted) return;
    document.querySelectorAll('form[data-validar] button[type="submit"]').forEach((boton) => {
      if (boton.dataset.textoOriginal) ponerCargando(boton, false);
    });
  });
});
