// public/js/wizard.js
// Wizard de perfil de jugador (form[data-wizard]):
//  1) Muestra un paso a la vez (2: datos personales, 3: perfil deportivo, 4: confirmación)
//     y actualiza la barra de progreso. El paso 1 (tipo de cuenta) ya está hecho.
//  2) Valida el paso actual antes de avanzar (mismas reglas que validarPerfilJugador).
//  3) Llena el resumen del paso 4 y, al confirmar, envía el formulario con estado "cargando".
// Sin JS el formulario muestra todos los pasos juntos y funciona igual (valida el servidor).

const PRIMER_PASO = 2;
const ULTIMO_PASO = 4;
const REGEX_FECHA = /^\d{4}-\d{2}-\d{2}$/;

// Reglas por paso. Cada una devuelve el mensaje de error o null.
const REGLAS = {
  2: {
    nombre: (v) => (v ? null : 'El nombre es obligatorio.'),
    apellido: (v) => (v ? null : 'El apellido es obligatorio.'),
    fecha_nacimiento: (v) => {
      if (!v) return 'La fecha de nacimiento es obligatoria.';
      if (!REGEX_FECHA.test(v)) return 'La fecha de nacimiento no es válida.';
      if (v > new Date().toISOString().slice(0, 10)) return 'La fecha de nacimiento no puede estar en el futuro.';
      return null;
    },
    altura: (v, input) => enRango(v, input, 'La altura', 'cm'),
    peso: (v, input) => enRango(v, input, 'El peso', 'kg'),
  },
  3: {
    posicion: (v) => (v ? null : 'Elige tu posición en la cancha.'),
    pie_habil: (v) => (v ? null : 'Elige tu pie hábil.'),
  },
};

/** Número dentro del min/max del input (los mismos rangos que el servidor). */
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

  /* ---------- Validación ---------- */

  function valorDe(nombre) {
    const elemento = formulario.elements[nombre];
    // RadioNodeList.value es el valor del radio marcado ('' si ninguno).
    return elemento.value === undefined ? '' : elemento.value.trim();
  }

  /** Pinta (o limpia) el error de un campo o grupo de opciones. */
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

  /** Valida un paso; devuelve la lista de errores y deja el foco en el primero. */
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

  /* ---------- Resumen del paso 4 ---------- */

  function textoDeOpcion(nombre) {
    const marcado = formulario.querySelector(`input[name="${nombre}"]:checked`);
    return marcado ? marcado.closest('label').querySelector('.opcion__nombre').textContent.trim() : '—';
  }

  function llenarResumen() {
    const fecha = valorDe('fecha_nacimiento');
    const valores = {
      nombre_completo: `${valorDe('nombre')} ${valorDe('apellido')}`.trim() || '—',
      fecha_nacimiento: REGEX_FECHA.test(fecha) ? fecha.split('-').reverse().join('/') : '—',
      altura: valorDe('altura') ? `${valorDe('altura')} cm` : '—',
      peso: valorDe('peso') ? `${valorDe('peso')} kg` : '—',
      posicion: textoDeOpcion('posicion'),
      pie_habil: textoDeOpcion('pie_habil'),
    };
    Object.entries(valores).forEach(([clave, valor]) => {
      formulario.querySelector(`[data-resumen="${clave}"]`).textContent = valor;
    });
  }

  /* ---------- Navegación ---------- */

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
      // Lleva la vista al inicio del panel (en celulares el paso nuevo queda arriba).
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

  // "Continuar" es el submit del formulario (así Enter también avanza).
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

    // Último paso: se revisan todos los pasos antes de enviar.
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
    // En el primer paso del formulario, "Volver" sigue el enlace a /select-role.
    if (pasoActual > PRIMER_PASO) {
      evento.preventDefault();
      mostrarAlerta([]);
      irA(pasoActual - 1);
    }
  });

  // Re-valida en vivo lo que ya estaba marcado con error.
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

  // Activa el modo "un paso a la vez" (sin esta clase se ven todos los pasos).
  formulario.classList.add('wizard__form--pasos');
  irA(pasoActual, { enfocar: false });
});
