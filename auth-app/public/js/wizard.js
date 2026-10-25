const PRIMER_PASO = 2;
const ULTIMO_PASO = 4;
const REGEX_FECHA = /^\d{4}-\d{2}-\d{2}$/;
const EDAD_MINIMA = 18;

function calcularEdad(valor) {
  const [anio, mes, dia] = valor.split('-').map(Number);
  const hoy = new Date();
  let edad = hoy.getFullYear() - anio;
  if (hoy.getMonth() + 1 < mes || (hoy.getMonth() + 1 === mes && hoy.getDate() < dia)) edad -= 1;
  return edad;
}

const REGLAS = {
  2: {
    apodo: (v, input) => {
      if (!v) return 'El apodo es obligatorio: es el nombre que aparece en tu carta.';
      if (v.length > Number(input.maxLength)) return `El apodo no puede superar los ${input.maxLength} caracteres.`;
      return null;
    },
    fecha_nacimiento: (v) => {
      if (!v) return 'La fecha de nacimiento es obligatoria.';
      if (!REGEX_FECHA.test(v)) return 'La fecha de nacimiento no es válida.';
      if (v > new Date().toISOString().slice(0, 10)) return 'La fecha de nacimiento no puede estar en el futuro.';
      if (calcularEdad(v) < EDAD_MINIMA) return `Debes tener al menos ${EDAD_MINIMA} años para registrarte.`;
      return null;
    },
    altura: (v, input) => enRango(v, input, 'La altura', 'cm'),
    peso: (v, input) => enRango(v, input, 'El peso', 'kg'),
  },
  3: {
    posicion: (v) => (v ? null : 'Elige al menos una posición en la cancha.'),
  },
};

function enRango(valor, input, campo, unidad) {
  const numero = Number(String(valor).replace(',', '.'));
  const min = Number(input.min);
  const max = Number(input.max);
  if (!valor || !Number.isFinite(numero) || numero < min || numero > max) {
    return `${campo} debe estar entre ${min} y ${max} ${unidad}.`;
  }
  return null;
}

document.addEventListener('DOMContentLoaded', () => {
  const formulario = document.querySelector('form[data-wizard]');
  if (!formulario) return;

  const pasos = Array.from(formulario.querySelectorAll('.wizard__paso'));
  const indicador = document.querySelector('[data-pasos]');
  const items = Array.from(indicador.querySelectorAll('[data-indicador]'));
  const alerta = formulario.querySelector('[data-alerta-errores]');
  const botonVolver = formulario.querySelector('[data-volver]');
  const botonContinuar = formulario.querySelector('[data-continuar]');
  const textoContinuar = botonContinuar.querySelector('.btn__texto');

  let pasoActual = Number(formulario.dataset.pasoInicial) || PRIMER_PASO;

  function valorDe(nombre) {
    const marcadas = formulario.querySelectorAll(`input[type="checkbox"][name="${nombre}"]`);
    if (marcadas.length > 0) {
      return Array.from(marcadas).filter((casilla) => casilla.checked).map((casilla) => casilla.value).join(',');
    }
    const elemento = formulario.elements[nombre];
    return elemento.value === undefined ? '' : elemento.value.trim();
  }

  function marcarError(nombre, mensaje) {
    const elemento = formulario.elements[nombre];
    const contenedor =
      elemento instanceof RadioNodeList
        ? formulario.querySelector(`[data-grupo="${nombre}"]`)
        : elemento.closest('.campo');
    contenedor.classList.toggle(elemento instanceof RadioNodeList ? 'grupo-opciones--error' : 'campo--error', Boolean(mensaje));
    if (!(elemento instanceof RadioNodeList)) elemento.setAttribute('aria-invalid', mensaje ? 'true' : 'false');
    const salida = formulario.querySelector(`#${nombre}-error`);
    if (salida) salida.textContent = mensaje || '';
  }

  function validarPaso(numero, { enfocar = true } = {}) {
    const errores = [];
    let primero = null;
    Object.entries(REGLAS[numero] || {}).forEach(([nombre, regla]) => {
      const elemento = formulario.elements[nombre];
      const mensaje = regla(valorDe(nombre), elemento);
      marcarError(nombre, mensaje);
      if (mensaje) {
        errores.push(mensaje);
        if (!primero) primero = elemento instanceof RadioNodeList ? elemento[0] : elemento;
      }
    });
    if (primero && enfocar) primero.focus();
    return errores;
  }

  function mostrarAlerta(mensajes) {
    alerta.querySelector('ul').replaceChildren(
      ...mensajes.map((mensaje) => {
        const li = document.createElement('li');
        li.textContent = mensaje;
        return li;
      })
    );
    alerta.hidden = mensajes.length === 0;
  }

  function textoDeOpcion(nombre) {
    const marcadas = Array.from(formulario.querySelectorAll(`input[name="${nombre}"]:checked`));
    const textos = marcadas.map((input) => input.closest('label').querySelector('.opcion__nombre').textContent.trim());
    return textos.length > 0 ? textos.join(', ') : '—';
  }

  function llenarResumen() {
    const fecha = valorDe('fecha_nacimiento');
    const valores = {
      apodo: (valorDe('apodo') || '—').toUpperCase(),
      fecha_nacimiento: REGEX_FECHA.test(fecha) ? fecha.split('-').reverse().join('/') : '—',
      altura: valorDe('altura') ? `${valorDe('altura')} cm` : '—',
      peso: valorDe('peso') ? `${valorDe('peso')} kg` : '—',
      posicion: textoDeOpcion('posicion'),
    };
    Object.entries(valores).forEach(([clave, valor]) => {
      formulario.querySelector(`[data-resumen="${clave}"]`).textContent = valor;
    });
  }

  function irA(numero, { enfocar = true } = {}) {
    pasoActual = numero;

    pasos.forEach((paso) => paso.classList.toggle('wizard__paso--activo', Number(paso.dataset.paso) === numero));

    items.forEach((item) => {
      const n = Number(item.dataset.indicador);
      item.classList.toggle('pasos__item--hecho', n < numero);
      item.classList.toggle('pasos__item--activo', n === numero);
      if (n === numero) item.setAttribute('aria-current', 'step');
      else item.removeAttribute('aria-current');
    });
    indicador.style.setProperty('--progreso', String((numero - 1) / (items.length - 1)));

    textoContinuar.textContent = numero === ULTIMO_PASO ? botonContinuar.dataset.textoFinal : 'CONTINUAR';
    if (numero === ULTIMO_PASO) llenarResumen();

    if (enfocar) {
      indicador.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      const activo = pasos.find((paso) => Number(paso.dataset.paso) === numero);
      const primerCampo = activo.querySelector('input:not([type="radio"]), input[type="radio"]');
      if (primerCampo && numero !== ULTIMO_PASO) primerCampo.focus({ preventScroll: true });
    }
  }

  function ponerCargando(cargando) {
    botonContinuar.disabled = cargando;
    botonContinuar.classList.toggle('btn--cargando', cargando);
    botonContinuar.setAttribute('aria-busy', String(cargando));
    textoContinuar.textContent = cargando ? botonContinuar.dataset.textoCargando : botonContinuar.dataset.textoFinal;
  }

  formulario.addEventListener('submit', (evento) => {
    if (botonContinuar.disabled) {
      evento.preventDefault();
      return;
    }

    if (pasoActual < ULTIMO_PASO) {
      evento.preventDefault();
      const errores = validarPaso(pasoActual);
      mostrarAlerta(errores);
      if (errores.length === 0) irA(pasoActual + 1);
      return;
    }

    for (let numero = PRIMER_PASO; numero < ULTIMO_PASO; numero++) {
      const errores = validarPaso(numero, { enfocar: false });
      if (errores.length > 0) {
        evento.preventDefault();
        mostrarAlerta(errores);
        irA(numero);
        validarPaso(numero);
        return;
      }
    }
    ponerCargando(true);
  });

  botonVolver.addEventListener('click', (evento) => {
    if (pasoActual > PRIMER_PASO) {
      evento.preventDefault();
      mostrarAlerta([]);
      irA(pasoActual - 1);
    }
  });

  formulario.addEventListener('input', (evento) => {
    const nombre = evento.target.name;
    const regla = REGLAS[pasoActual] && REGLAS[pasoActual][nombre];
    if (!regla) return;
    const marcado = evento.target.closest('.campo--error, .grupo-opciones--error');
    if (marcado) marcarError(nombre, regla(valorDe(nombre), formulario.elements[nombre]));
  });

  formulario.addEventListener('change', (evento) => {
    if (evento.target.type !== 'radio') return;
    marcarError(evento.target.name, null);
  });

  window.addEventListener('pageshow', (evento) => {
    if (evento.persisted && botonContinuar.disabled) ponerCargando(false);
  });

  formulario.classList.add('wizard__form--pasos');
  irA(pasoActual, { enfocar: false });
});
