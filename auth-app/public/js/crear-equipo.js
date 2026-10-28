// public/js/crear-equipo.js
// Wizard de equipo (form[data-wizard-equipo] en views/crear-equipo.ejs):
//  1) Muestra un paso a la vez (1: identidad, 2: configuración, 3: ubicación opcional) y actualiza la barra de progreso.
//  2) Valida el paso actual antes de avanzar (mismas reglas que validarEquipo en el servidor).
//  3) Vista previa en vivo: nombre, tipo de fútbol · nivel y escudo (reducido y enviado en el campo oculto "escudo").
//  Los tipos de fútbol son casillas: se puede marcar más de uno (la vista previa dice "Fútbol 7 y 11").
//  4) Al crear: revisa los pasos y pone el botón en "cargando".
//  5) EQ-UB: en el paso 3 crea el mapa (mapa-ubicacion.js) y copia el pin a los campos ocultos latitud y longitud.
//     Sin pin el botón dice "Crear sin ubicación" (el paso es opcional).
// Sin JS el formulario muestra los pasos juntos y funciona igual (valida el servidor; el mapa no aparece).

const PRIMER_PASO_EQUIPO = 1;
const ULTIMO_PASO_EQUIPO = 3;
const REGEX_CORREO_EQUIPO = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const NOMBRE_VACIO = 'Nombre del Club';
const DETALLE_VACIO = 'Tipo de fútbol · Nivel';
// El formulario viaja como urlencoded (límite de 100 KB en el servidor): el escudo debe quedar bajo esto.
const TIPOS_ESCUDO = ['image/png', 'image/jpeg', 'image/webp'];
const LADOS_ESCUDO = [256, 192, 128];
const LARGO_MAXIMO_ESCUDO = 80000;

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
    id_comuna: (v) => (v ? null : 'Elige la región y la comuna de tu equipo.'), // CORRECCIÓN: regla 11
    zona: (v) => (v ? null : 'Escribe la zona habitual de juego.'),
    modalidad: (v) => (v ? null : 'Elige al menos un tipo de fútbol.'),
  },
  3: {}, // EQ-UB: ubicación opcional (el pin siempre deja coordenadas válidas)
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
  const contenedorMapa = formulario.querySelector('[data-mapa-ubicacion]');
  const campoLatitud = formulario.querySelector('[data-latitud]');
  const campoLongitud = formulario.querySelector('[data-longitud]');
  const estadoUbicacion = formulario.querySelector('[data-ubicacion-estado]');
  const botonMiUbicacion = formulario.querySelector('[data-usar-mi-ubicacion]');
  const botonQuitarPin = formulario.querySelector('[data-quitar-ubicacion]');
  let marcador = null;

  let pasoActual = Number(formulario.dataset.pasoInicial) || PRIMER_PASO_EQUIPO;

  /* ---------- Validación ---------- */

  function valorDe(nombre) {
    const elemento = formulario.elements[nombre];
    // Casillas (tipos de fútbol): los valores marcados separados por coma ('' si ninguno)
    if (elemento instanceof RadioNodeList && elemento[0].type === 'checkbox') {
      return Array.from(elemento).filter((casilla) => casilla.checked).map((casilla) => casilla.value).join(',');
    }
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

  /** 'Fútbol 7 y 11' con los tipos marcados (mismo texto que el servidor). */
  function textoModalidades() {
    const marcadas = valorDe('modalidad').split(',').filter(Boolean);
    if (marcadas.length <= 1) return textoMarcado('modalidad');
    return `Fútbol ${marcadas.slice(0, -1).join(', ')} y ${marcadas[marcadas.length - 1]}`;
  }

  function actualizarVista() {
    const nombre = valorDe('nombre_equipo');
    document.querySelectorAll('[data-vista-nombre]').forEach((el) => {
      el.textContent = nombre || NOMBRE_VACIO;
      el.classList.toggle('ceq-identidad__nombre--vacio', !nombre);
    });
    const detalle = [textoModalidades(), textoMarcado('nivel')].filter(Boolean).join(' · ');
    document.querySelector('[data-vista-detalle]').textContent = detalle || DETALLE_VACIO;
  }

  // Escudo: se reduce y viaja como data URL en el campo oculto "escudo" (el input de archivo no tiene name).
  const datosEscudo = formulario.querySelector('[data-escudo-datos]');
  const errorEscudo = formulario.querySelector('[data-escudo-error]');

  function pintarEscudo(src) {
    document.querySelectorAll('[data-escudo]').forEach((caja) => {
      const imagen = document.createElement('img');
      imagen.src = src;
      imagen.alt = '';
      caja.replaceChildren(imagen);
    });
  }

  // Si el servidor devolvió el formulario con errores, el escudo elegido sigue en el campo oculto.
  if (datosEscudo.value) pintarEscudo(datosEscudo.value);

  formulario.querySelector('[data-subir-escudo]').addEventListener('change', async (evento) => {
    const archivo = evento.target.files[0];
    evento.target.value = '';
    errorEscudo.textContent = '';
    if (!archivo) return;
    if (!TIPOS_ESCUDO.includes(archivo.type)) {
      errorEscudo.textContent = 'El escudo debe ser JPG, PNG o WebP.';
      return;
    }
    try {
      const datos = await reducirEscudo(archivo);
      if (!datos) throw new Error('demasiado grande');
      datosEscudo.value = datos;
      pintarEscudo(datos);
    } catch (err) {
      console.error('No se pudo preparar el escudo:', err);
      errorEscudo.textContent = 'No pudimos usar esa imagen: prueba con otra.';
    }
  });

  /* ---------- CORRECCIÓN: regla 11 — Región y comuna ---------- */
  // Solo se ven las comunas de la región elegida (cada <optgroup> lleva data-region).
  const selectRegion = formulario.querySelector('[data-select-region]');
  const selectComuna = formulario.querySelector('[data-select-comuna]');
  if (selectRegion && selectComuna) {
    const grupos = Array.from(selectComuna.querySelectorAll('optgroup'));

    function filtrarComunas() {
      const region = selectRegion.value;
      grupos.forEach((grupo) => {
        const visible = grupo.dataset.region === region;
        grupo.hidden = !visible;
        grupo.disabled = !visible;
      });
      // Si la comuna marcada no es de esta región, se limpia
      const marcada = selectComuna.selectedOptions[0];
      if (marcada && marcada.parentElement.tagName === 'OPTGROUP' && marcada.parentElement.disabled) selectComuna.value = '';
      selectComuna.disabled = !region;
    }

    selectRegion.addEventListener('change', filtrarComunas);
    filtrarComunas();

    // La zona parte con el nombre de la comuna si el capitán aún no escribió una
    selectComuna.addEventListener('change', () => {
      const zona = formulario.elements.zona;
      const opcion = selectComuna.selectedOptions[0];
      if (zona && !zona.value.trim() && selectComuna.value) zona.value = opcion.textContent.trim();
      marcarError('id_comuna', null);
    });
  }

  /* ---------- Ubicación (paso 3, opcional) ---------- */

  const conUbicacion = () => campoLatitud.value !== '';
  const textoFinal = () => (conUbicacion() ? 'Crear equipo' : 'Crear sin ubicación');

  function avisarUbicacion(texto, error = false) {
    estadoUbicacion.textContent = texto;
    estadoUbicacion.classList.toggle('ceq-ubicacion__estado--error', error);
  }

  function copiarUbicacion(latlng) {
    campoLatitud.value = latlng ? latlng.lat.toFixed(5) : '';
    campoLongitud.value = latlng ? latlng.lng.toFixed(5) : '';
    botonQuitarPin.hidden = !latlng;
    if (pasoActual === ULTIMO_PASO_EQUIPO) textoContinuar.textContent = textoFinal();
    avisarUbicacion(latlng ? 'Ubicación marcada: puedes mover el pin si no quedó justo.' : '');
  }

  // El mapa se crea la primera vez que se muestra el paso (oculto, Leaflet mediría 0 px)
  function crearMapa() {
    if (marcador || typeof L === 'undefined' || typeof crearMapaUbicacion !== 'function') return;
    marcador = crearMapaUbicacion(contenedorMapa, {
      inicial: conUbicacion() ? [Number(campoLatitud.value), Number(campoLongitud.value)] : null,
      alCambiar: copiarUbicacion,
    });
  }

  botonMiUbicacion.addEventListener('click', async () => {
    if (!marcador) return;
    botonMiUbicacion.disabled = true;
    avisarUbicacion('Buscando tu ubicación...');
    try {
      await marcador.usarMiUbicacion();
    } catch (err) {
      avisarUbicacion(err.message, true);
    } finally {
      botonMiUbicacion.disabled = false;
    }
  });

  botonQuitarPin.addEventListener('click', () => {
    if (marcador) marcador.quitar();
    copiarUbicacion(null);
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

    // Pasos 1 y 2: "Continuar →"; paso 3: "Crear equipo ✓" (o "Crear sin ubicación") con la nota debajo
    const esUltimo = numero === ULTIMO_PASO_EQUIPO;
    textoContinuar.textContent = esUltimo ? textoFinal() : 'Continuar';
    if (esUltimo) crearMapa();
    iconoFinal.hidden = !esUltimo;
    iconoContinuar.hidden = esUltimo;
    notaFinal.hidden = !esUltimo;

    if (enfocar) {
      indicador.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      const activo = pasos.find((paso) => Number(paso.dataset.paso) === numero);
      const primerCampo = activo.querySelector('input:not([type="file"]):not([type="hidden"])');
      if (primerCampo) primerCampo.focus({ preventScroll: true });
    }
  }

  function ponerCargando(cargando) {
    botonContinuar.disabled = cargando;
    botonContinuar.classList.toggle('btn--cargando', cargando);
    botonContinuar.setAttribute('aria-busy', String(cargando));
    textoContinuar.textContent = cargando ? botonContinuar.dataset.textoCargando : textoFinal();
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

    // Último paso: se revisan todos los pasos antes de enviar.
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
    if (evento.target.type === 'radio' || evento.target.type === 'checkbox') marcarError(evento.target.name, null);
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
