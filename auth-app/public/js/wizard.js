// public/js/wizard.js
// Wizard de perfil de jugador (form[data-wizard]):
//  1) Muestra un paso a la vez y actualiza la barra de progreso. El paso 1 (tipo de cuenta) ya está hecho.
//     Pasos: 2 datos personales · 3 perfil deportivo · 4 rol · 5 crear equipo · 6 confirmación.
//     El 5 (y todo lo marcado con data-solo-capitan) solo existe si en el paso 4 se elige "Soy capitán":
//     la secuencia de pasos y la barra se recalculan cada vez que cambia el rol.
//  2) Valida el paso actual antes de avanzar (mismas reglas que validarPerfilJugador).
//  3) Elegir una tarjeta de rol avanza solo al paso siguiente.
//  4) Escudo (opcional): la imagen se reduce a LADO_ESCUDO px y viaja como data URL en el campo oculto "escudo".
//  5) Llena el resumen de la confirmación y, al confirmar, envía el formulario con estado "cargando".
// Sin JS el formulario muestra todos los pasos juntos y funciona igual (valida el servidor).

const PASO_ROL = 4;
const REGEX_FECHA = /^\d{4}-\d{2}-\d{2}$/;
const EDAD_MINIMA = 18;
const ROLES = { jugador: 'Jugador', capitan: 'Capitán' };
const ESPERA_AVANCE_MS = 220; // deja ver la tarjeta marcada antes de pasar al paso siguiente
// El formulario viaja como urlencoded (límite de 100 KB en el servidor): el escudo debe quedar bajo esto.
const LADOS_ESCUDO = [256, 192, 128];
const LARGO_MAXIMO_ESCUDO = 80000;

/** Años cumplidos a partir de "AAAA-MM-DD", comparando con el día de hoy. */
function calcularEdad(valor) {
  const [anio, mes, dia] = valor.split('-').map(Number);
  const hoy = new Date();
  let edad = hoy.getFullYear() - anio;
  // Aún no cumple años este año
  if (hoy.getMonth() + 1 < mes || (hoy.getMonth() + 1 === mes && hoy.getDate() < dia)) edad -= 1;
  return edad;
}

/** Texto obligatorio con largo máximo (el maxlength del input). */
function textoObligatorio(valor, input, vacio, campo) {
  if (!valor) return vacio;
  if (valor.length > Number(input.maxLength)) return `${campo} no puede superar los ${input.maxLength} caracteres.`;
  return null;
}

// Reglas por paso. Cada una devuelve el mensaje de error o null.
const REGLAS = {
  2: {
    apodo: (v, input) => textoObligatorio(v, input, 'El apodo es obligatorio: es el nombre que aparece en tu carta.', 'El apodo'),
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
  4: {
    rol: (v) => (v ? null : 'Elige si te registras como jugador o como capitán.'),
  },
  5: {
    nombre_equipo: (v, input) => textoObligatorio(v, input, 'El nombre del equipo es obligatorio.', 'El nombre'),
    id_comuna: (v) => (v ? null : 'Elige la región y la comuna de tu equipo.'),
    nivel: (v) => (v ? null : 'Elige el nivel de juego del equipo.'),
    modalidad: (v) => (v ? null : 'Elige al menos un tipo de fútbol.'),
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

/** La imagen entera dentro de un cuadrado de "lado" px, como data URL (WebP si el navegador puede; si no, PNG). */
function escudoComoDataUrl(imagen, lado) {
  const escala = Math.min(1, lado / Math.max(imagen.naturalWidth, imagen.naturalHeight));
  const ancho = Math.round(imagen.naturalWidth * escala);
  const alto = Math.round(imagen.naturalHeight * escala);
  const canvas = document.createElement('canvas');
  canvas.width = lado;
  canvas.height = lado;
  canvas.getContext('2d').drawImage(imagen, (lado - ancho) / 2, (lado - alto) / 2, ancho, alto);
  const webp = canvas.toDataURL('image/webp', 0.85);
  return webp.startsWith('data:image/webp') ? webp : canvas.toDataURL('image/png');
}

/** Reduce el archivo hasta que quepa en el formulario; null si no se logra. */
async function reducirEscudo(archivo) {
  const url = URL.createObjectURL(archivo);
  try {
    const imagen = new Image();
    imagen.src = url;
    await imagen.decode();
    for (const lado of LADOS_ESCUDO) {
      const datos = escudoComoDataUrl(imagen, lado);
      if (datos.length <= LARGO_MAXIMO_ESCUDO) return datos;
    }
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
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

  /* ---------- Rol y secuencia de pasos ---------- */

  const esCapitan = () => valorDe('rol') === 'capitan';
  const textoFinal = () => (esCapitan() ? botonContinuar.dataset.textoFinalCapitan : botonContinuar.dataset.textoFinal);

  /** Números de los pasos del formulario que existen con el rol actual, en orden. */
  function secuencia() {
    return pasos
      .filter((paso) => esCapitan() || !paso.hasAttribute('data-solo-capitan'))
      .map((paso) => Number(paso.dataset.paso));
  }
  const primerPaso = () => secuencia()[0];
  const ultimoPaso = () => secuencia().at(-1);

  let pasoActual = Number(formulario.dataset.pasoInicial) || primerPaso();

  /* ---------- Validación ---------- */

  function valorDe(nombre) {
    // Casillas (posiciones, tipos de fútbol): los valores marcados separados por coma ('' si ninguno).
    const marcadas = formulario.querySelectorAll(`input[type="checkbox"][name="${nombre}"]`);
    if (marcadas.length > 0) {
      return Array.from(marcadas).filter((casilla) => casilla.checked).map((casilla) => casilla.value).join(',');
    }
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

  /* ---------- Resumen de la confirmación ---------- */

  // Radios: la opción marcada; casillas: todas las marcadas separadas por coma.
  function textoDeOpcion(nombre) {
    const marcadas = Array.from(formulario.querySelectorAll(`input[name="${nombre}"]:checked`));
    const textos = marcadas.map((input) => input.closest('label').querySelector('.opcion__nombre').textContent.trim());
    return textos.length > 0 ? textos.join(', ') : '—';
  }

  function llenarResumen() {
    const fecha = valorDe('fecha_nacimiento');
    const comuna = formulario.elements.id_comuna.selectedOptions[0];
    const valores = {
      apodo: (valorDe('apodo') || '—').toUpperCase(),
      fecha_nacimiento: REGEX_FECHA.test(fecha) ? fecha.split('-').reverse().join('/') : '—',
      altura: valorDe('altura') ? `${valorDe('altura')} cm` : '—',
      peso: valorDe('peso') ? `${valorDe('peso')} kg` : '—',
      posicion: textoDeOpcion('posicion'),
      rol: ROLES[valorDe('rol')] || '—',
      nombre_equipo: valorDe('nombre_equipo') || '—',
      id_comuna: comuna && comuna.value ? comuna.textContent.trim() : '—',
      nivel: textoDeOpcion('nivel'),
      modalidad: textoDeOpcion('modalidad'),
    };
    Object.entries(valores).forEach(([clave, valor]) => {
      formulario.querySelector(`[data-resumen="${clave}"]`).textContent = valor;
    });
  }

  /* ---------- Navegación ---------- */

  /** Barra de progreso según la secuencia actual: oculta "Crear equipo" si no es capitán y renumera. */
  function pintarBarra() {
    const visibles = items.filter((item) => esCapitan() || !item.hasAttribute('data-solo-capitan'));
    const posicionActual = visibles.findIndex((item) => Number(item.dataset.indicador) === pasoActual);
    items.forEach((item) => {
      const posicion = visibles.indexOf(item);
      item.hidden = posicion === -1;
      item.classList.toggle('pasos__item--hecho', posicion !== -1 && posicion < posicionActual);
      item.classList.toggle('pasos__item--activo', posicion === posicionActual);
      if (posicion === posicionActual) item.setAttribute('aria-current', 'step');
      else item.removeAttribute('aria-current');
      if (posicion !== -1) item.querySelector('.pasos__numero').textContent = String(posicion + 1);
    });
    indicador.style.setProperty('--cantidad-pasos', String(visibles.length));
    indicador.style.setProperty('--progreso', String(posicionActual / (visibles.length - 1)));
    // Todo lo exclusivo del capitán (el resumen del equipo) sigue al rol
    formulario.querySelectorAll('.resumen-equipo[data-solo-capitan]').forEach((bloque) => { bloque.hidden = !esCapitan(); });
  }

  function irA(numero, { enfocar = true } = {}) {
    pasoActual = numero;
    const ultimo = numero === ultimoPaso();

    pasos.forEach((paso) => paso.classList.toggle('wizard__paso--activo', Number(paso.dataset.paso) === numero));
    pintarBarra();

    textoContinuar.textContent = ultimo ? textoFinal() : 'CONTINUAR';
    if (ultimo) llenarResumen();

    if (enfocar) {
      // Lleva la vista al inicio del panel (en celulares el paso nuevo queda arriba).
      indicador.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      const activo = pasos.find((paso) => Number(paso.dataset.paso) === numero);
      const primerCampo = activo.querySelector('input:not([type="radio"]):not([type="hidden"]):not([type="file"]), select, input[type="radio"]:not(:disabled)');
      if (primerCampo && !ultimo) primerCampo.focus({ preventScroll: true });
    }
  }

  /** Paso siguiente o anterior dentro de la secuencia actual. */
  function vecino(desplazamiento) {
    const orden = secuencia();
    return orden[orden.indexOf(pasoActual) + desplazamiento];
  }

  function ponerCargando(cargando) {
    botonContinuar.disabled = cargando;
    botonContinuar.classList.toggle('btn--cargando', cargando);
    botonContinuar.setAttribute('aria-busy', String(cargando));
    textoContinuar.textContent = cargando ? botonContinuar.dataset.textoCargando : textoFinal();
  }

  // "Continuar" es el submit del formulario (así Enter también avanza).
  formulario.addEventListener('submit', (evento) => {
    if (botonContinuar.disabled) {
      evento.preventDefault();
      return;
    }

    if (pasoActual !== ultimoPaso()) {
      evento.preventDefault();
      const errores = validarPaso(pasoActual);
      mostrarAlerta(errores);
      if (errores.length === 0) irA(vecino(1));
      return;
    }

    // Último paso: se revisan todos los pasos de la secuencia antes de enviar.
    for (const numero of secuencia().slice(0, -1)) {
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
    if (pasoActual !== primerPaso()) {
      evento.preventDefault();
      mostrarAlerta([]);
      irA(vecino(-1));
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

  let avanceProgramado = null;
  formulario.addEventListener('change', (evento) => {
    const { type, name } = evento.target;
    if (type === 'radio' || type === 'checkbox') marcarError(name, null);
    if (name !== 'rol') return;

    // El rol cambia la secuencia (aparece o desaparece "Crear equipo"): barra al día y, enseguida, al paso siguiente.
    mostrarAlerta([]);
    pintarBarra();
    clearTimeout(avanceProgramado);
    if (pasoActual === PASO_ROL) avanceProgramado = setTimeout(() => irA(vecino(1)), ESPERA_AVANCE_MS);
  });

  window.addEventListener('pageshow', (evento) => {
    if (evento.persisted && botonContinuar.disabled) ponerCargando(false);
  });

  /* ---------- Escudo del equipo ---------- */

  const botonEscudo = formulario.querySelector('[data-escudo-boton]');
  const archivoEscudo = formulario.querySelector('[data-escudo-archivo]');
  const datosEscudo = formulario.querySelector('[data-escudo-datos]');
  const vistaEscudo = formulario.querySelector('[data-escudo-vista]');
  const errorEscudo = formulario.querySelector('[data-escudo-error]');

  if (botonEscudo && archivoEscudo) {
    botonEscudo.hidden = false; // sin JS no hay cómo reducir la imagen: el botón queda oculto
    archivoEscudo.addEventListener('change', async () => {
      const archivo = archivoEscudo.files[0];
      archivoEscudo.value = ''; // permite elegir el mismo archivo otra vez
      if (!archivo) return;
      errorEscudo.textContent = '';
      try {
        const datos = await reducirEscudo(archivo);
        if (!datos) throw new Error('La imagen es demasiado pesada. Prueba con otra más simple.');
        datosEscudo.value = datos;
        const imagen = document.createElement('img');
        imagen.src = datos;
        imagen.alt = '';
        vistaEscudo.replaceChildren(imagen);
      } catch (err) {
        errorEscudo.textContent = err.message && !(err instanceof DOMException)
          ? err.message
          : 'No pudimos leer esa imagen. Elige un JPG, PNG o WebP.';
      }
    });
  }

  // Activa el modo "un paso a la vez" (sin esta clase se ven todos los pasos).
  formulario.classList.add('wizard__form--pasos');
  irA(pasoActual, { enfocar: false });
});
