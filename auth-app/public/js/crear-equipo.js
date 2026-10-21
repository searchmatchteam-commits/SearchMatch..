// public/js/crear-equipo.js
// Wizard de equipo (form[data-wizard-equipo] en views/crear-equipo.ejs):
//  1) Muestra un paso a la vez (1: identidad, 2: configuración) y actualiza la barra de progreso.
//  2) Valida el paso actual antes de avanzar (mismas reglas que validarEquipo en el servidor).
//  3) Vista previa en vivo: nombre, tipo de fútbol · nivel y escudo (el escudo no se envía).
//  4) Al crear: revisa los dos pasos y pone el botón en "cargando".
// Sin JS el formulario muestra los dos pasos juntos y funciona igual (valida el servidor).

const PRIMER_PASO_EQUIPO = 1;
const ULTIMO_PASO_EQUIPO = 2;
const REGEX_CORREO_EQUIPO = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const NOMBRE_VACIO = 'Nombre del Club';
const DETALLE_VACIO = 'Tipo de fútbol · Nivel';

// Reglas por paso. Cada una devuelve el mensaje de error o null.
const REGLAS_EQUIPO = {
  1: {
    nombre_equipo: (v) => (v ? null : 'El nombre de la escuadra es obligatorio.'),
    correo_contacto: (v) => {
      if (!v) return 'El correo de contacto es obligatorio.';
      if (!REGEX_CORREO_EQUIPO.test(v)) return 'El formato del correo no es válido.';
      return null;
    },
  },
  2: {
    nivel: (v) => (v ? null : 'Elige el nivel de juego del equipo.'),
    zona: (v) => (v ? null : 'Escribe la zona habitual de juego.'),
    modalidad: (v) => (v ? null : 'Elige el tipo de fútbol.'),
  },
};

document.addEventListener('DOMContentLoaded', () => {
  const formulario = document.querySelector('form[data-wizard-equipo]');
  if (!formulario) return;

  const pasos = Array.from(formulario.querySelectorAll('.wizard__paso'));
  const indicador = document.querySelector('[data-pasos]');
  const items = Array.from(indicador.querySelectorAll('[data-indicador]'));
  const alerta = formulario.querySelector('[data-alerta-errores]');
  const botonVolver = formulario.querySelector('[data-volver]');
  const botonContinuar = formulario.querySelector('[data-continuar]');
  const textoContinuar = botonContinuar.querySelector('.btn__texto');
  const iconoFinal = botonContinuar.querySelector('[data-icono-final]');
  const iconoContinuar = botonContinuar.querySelector('[data-icono-continuar]');
  const notaFinal = formulario.querySelector('[data-nota-final]');

  let pasoActual = Number(formulario.dataset.pasoInicial) || PRIMER_PASO_EQUIPO;

  /* ---------- Validación ---------- */

  function valorDe(nombre) {
    const elemento = formulario.elements[nombre];
    // RadioNodeList.value es el valor del radio marcado ('' si ninguno).
    return elemento.value === undefined ? '' : elemento.value.trim();
  }

  /** Pinta (o limpia) el error de un campo o grupo de opciones. */
  function marcarError(nombre, mensaje) {
    const elemento = formulario.elements[nombre];
    const esGrupo = elemento instanceof RadioNodeList;
    const contenedor = esGrupo ? formulario.querySelector(`[data-grupo="${nombre}"]`) : elemento.closest('.campo');
    contenedor.classList.toggle(esGrupo ? 'grupo-opciones--error' : 'campo--error', Boolean(mensaje));
    if (!esGrupo) elemento.setAttribute('aria-invalid', mensaje ? 'true' : 'false');
    formulario.querySelector(`#${nombre}-error`).textContent = mensaje || '';
  }

  /** Valida un paso; devuelve la lista de errores y deja el foco en el primero. */
  function validarPaso(numero, { enfocar = true } = {}) {
    const errores = [];
    let primero = null;
    Object.entries(REGLAS_EQUIPO[numero]).forEach(([nombre, regla]) => {
      const mensaje = regla(valorDe(nombre));
      marcarError(nombre, mensaje);
      if (mensaje) {
        errores.push(mensaje);
        const elemento = formulario.elements[nombre];
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

  /* ---------- Vista previa en vivo ---------- */

  function textoMarcado(nombre) {
    const marcado = formulario.querySelector(`input[name="${nombre}"]:checked`);
    if (!marcado) return '';
    return marcado.dataset.texto || marcado.closest('label').querySelector('.opcion__nombre').textContent.trim();
  }

  function actualizarVista() {
    const nombre = valorDe('nombre_equipo');
    document.querySelectorAll('[data-vista-nombre]').forEach((el) => {
      el.textContent = nombre || NOMBRE_VACIO;
      el.classList.toggle('ceq-identidad__nombre--vacio', !nombre);
    });
    const detalle = [textoMarcado('modalidad'), textoMarcado('nivel')].filter(Boolean).join(' · ');
    document.querySelector('[data-vista-detalle]').textContent = detalle || DETALLE_VACIO;
  }

  // Escudo: solo se muestra aquí (el input no tiene name, así que no viaja con el formulario).
  let urlEscudo = null;
  formulario.querySelector('[data-subir-escudo]').addEventListener('change', (evento) => {
    const archivo = evento.target.files[0];
    if (!archivo || !archivo.type.startsWith('image/')) return;
    if (urlEscudo) URL.revokeObjectURL(urlEscudo);
    urlEscudo = URL.createObjectURL(archivo);
    document.querySelectorAll('[data-escudo]').forEach((caja) => {
      const imagen = document.createElement('img');
      imagen.src = urlEscudo;
      imagen.alt = '';
      caja.replaceChildren(imagen);
    });
  });

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

    // Paso 1: "Continuar →"; paso 2: "Crear equipo ✓" con la nota debajo
    const esUltimo = numero === ULTIMO_PASO_EQUIPO;
    textoContinuar.textContent = esUltimo ? 'Crear equipo' : 'Continuar';
    iconoFinal.hidden = !esUltimo;
    iconoContinuar.hidden = esUltimo;
    notaFinal.hidden = !esUltimo;

    if (enfocar) {
      indicador.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      const activo = pasos.find((paso) => Number(paso.dataset.paso) === numero);
      const primerCampo = activo.querySelector('input:not([type="file"])');
      if (primerCampo) primerCampo.focus({ preventScroll: true });
    }
  }

  function ponerCargando(cargando) {
    botonContinuar.disabled = cargando;
    botonContinuar.classList.toggle('btn--cargando', cargando);
    botonContinuar.setAttribute('aria-busy', String(cargando));
    textoContinuar.textContent = cargando ? botonContinuar.dataset.textoCargando : 'Crear equipo';
    iconoFinal.hidden = cargando;
  }

  // "Continuar" es el submit del formulario (así Enter también avanza).
  formulario.addEventListener('submit', (evento) => {
    if (botonContinuar.disabled) {
      evento.preventDefault();
      return;
    }

    if (pasoActual < ULTIMO_PASO_EQUIPO) {
      evento.preventDefault();
      const errores = validarPaso(pasoActual);
      mostrarAlerta(errores);
      if (errores.length === 0) irA(pasoActual + 1);
      return;
    }

    // Último paso: se revisan los dos pasos antes de enviar.
    for (let numero = PRIMER_PASO_EQUIPO; numero <= ULTIMO_PASO_EQUIPO; numero++) {
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
    // En el primer paso, "Volver" sigue el enlace a /select-role.
    if (pasoActual > PRIMER_PASO_EQUIPO) {
      evento.preventDefault();
      mostrarAlerta([]);
      irA(pasoActual - 1);
    }
  });

  formulario.addEventListener('input', (evento) => {
    actualizarVista();
    // Re-valida en vivo lo que ya estaba marcado con error.
    const nombre = evento.target.name;
    const regla = REGLAS_EQUIPO[pasoActual] && REGLAS_EQUIPO[pasoActual][nombre];
    if (regla && evento.target.closest('.campo--error, .grupo-opciones--error')) marcarError(nombre, regla(valorDe(nombre)));
  });

  formulario.addEventListener('change', (evento) => {
    if (evento.target.type === 'radio') marcarError(evento.target.name, null);
    actualizarVista();
  });

  window.addEventListener('pageshow', (evento) => {
    if (evento.persisted && botonContinuar.disabled) ponerCargando(false);
  });

  // Activa el modo "un paso a la vez" (sin esta clase se ven los dos pasos).
  formulario.classList.add('wizard__form--pasos');
  irA(pasoActual, { enfocar: false });
  actualizarVista();
});
