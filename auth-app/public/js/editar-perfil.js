const LADO_FOTO = 600;
const CALIDAD_JPEG = 0.85;
const TAMANO_MAXIMO_ORIGINAL = 15 * 1024 * 1024;
const TIPOS_FOTO = ['image/jpeg', 'image/png', 'image/webp'];

function cargarImagen(archivo) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(archivo);
    const imagen = new Image();
    imagen.onload = () => {
      URL.revokeObjectURL(url);
      resolve(imagen);
    };
    imagen.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('No se pudo leer la imagen.'));
    };
    imagen.src = url;
  });
}

async function prepararFoto(archivo) {
  const imagen = await cargarImagen(archivo);
  const lado = Math.min(imagen.naturalWidth, imagen.naturalHeight);
  const salida = Math.min(LADO_FOTO, lado);

  const canvas = document.createElement('canvas');
  canvas.width = salida;
  canvas.height = salida;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#151915';
  ctx.fillRect(0, 0, salida, salida);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(
    imagen,
    (imagen.naturalWidth - lado) / 2, (imagen.naturalHeight - lado) / 2, lado, lado,
    0, 0, salida, salida
  );

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('No se pudo procesar la imagen.'))), 'image/jpeg', CALIDAD_JPEG);
  });
}

document.addEventListener('DOMContentLoaded', () => {
  const formulario = document.querySelector('[data-editor]');
  const carta = document.querySelector('[data-carta]');
  if (!formulario || !carta) return;

  const estado = formulario.querySelector('[data-estado]');
  const botonGuardar = formulario.querySelector('[data-guardar]');

  function avisar(mensaje) {
    estado.textContent = mensaje;
  }

  const nombreCarta = carta.querySelector('[data-carta-nombre]');
  const apodoInput = formulario.querySelector('[data-editor-apodo]');
  apodoInput.addEventListener('input', () => {
    nombreCarta.textContent = (apodoInput.value.trim() || '—').toUpperCase();
    if (window.ajustarNombreCarta) window.ajustarNombreCarta(nombreCarta);
  });

  // ---------- Posiciones y estadísticas (config/perfilJugador.js: PESOS, cartasDe) ----------
  // La carta de vista previa es la de la posición principal: con Portero muestra las estadísticas de portero.
  const posicionCarta = carta.querySelector('[data-carta-posicion]');
  const statsCarta = carta.querySelector('.carta-jugador__stats');
  const radiosPrincipal = Array.from(formulario.querySelectorAll('input[name="posicion_principal"]'));
  const casillasAlternativa = Array.from(formulario.querySelectorAll('input[name="posicion_alternativa"]'));
  const rangos = Array.from(formulario.querySelectorAll('[data-editor-stat]'));
  const mediaCarta = carta.querySelector('[data-carta-media]');
  const mediaEditor = formulario.querySelector('[data-editor-media]');
  let pesos = {};
  try { pesos = JSON.parse(formulario.querySelector('[data-pesos]').textContent); } catch (e) { /* sin pesos: promedio simple */ }

  const principal = () => (radiosPrincipal.find((r) => r.checked) || {}).value || null;
  const posiciones = () => [principal(), ...casillasAlternativa.filter((c) => c.checked).map((c) => c.value)].filter(Boolean);
  const grupoDe = (posicion) => (posicion === 'arquero' ? 'arquero' : 'campo');

  // Media ponderada de la posición principal (igual que calcularMedia en el servidor)
  function actualizarMedia() {
    const deLaPosicion = pesos[principal()];
    let media;
    if (deLaPosicion) {
      media = rangos.reduce((suma, r) => suma + Number(r.value) * (deLaPosicion[r.dataset.editorStat] || 0), 0);
    } else {
      const campo = rangos.filter((r) => r.dataset.grupo === 'campo');
      media = campo.reduce((suma, r) => suma + Number(r.value), 0) / campo.length;
    }
    mediaCarta.textContent = String(Math.round(media));
    mediaEditor.textContent = String(Math.round(media));
  }

  // Estadísticas de la carta: las del grupo de la posición principal, con las clave destacadas
  function dibujarStatsCarta() {
    const deLaPosicion = pesos[principal()] || {};
    const grupo = grupoDe(principal());
    statsCarta.replaceChildren(...rangos.filter((r) => r.dataset.grupo === grupo).map((r) => {
      const fila = document.createElement('div');
      if ((deLaPosicion[r.dataset.editorStat] || 0) >= 0.2) fila.className = 'carta-jugador__stat--clave';
      const sigla = document.createElement('dt');
      sigla.textContent = r.dataset.sigla;
      const valor = document.createElement('dd');
      valor.dataset.cartaStat = r.dataset.editorStat;
      valor.textContent = r.value;
      fila.append(sigla, valor);
      return fila;
    }));
    rangos.forEach((r) => {
      r.closest('[data-stat-item]').classList.toggle('carta-jugador__stat--clave', (deLaPosicion[r.dataset.editorStat] || 0) >= 0.2);
    });
  }

  function alCambiarPosiciones() {
    const elegida = principal();
    // La principal no puede ser también alternativa
    casillasAlternativa.forEach((c) => {
      c.disabled = c.value === elegida;
      if (c.disabled) c.checked = false;
    });
    const lista = posiciones();
    posicionCarta.textContent = elegida ? radiosPrincipal.find((r) => r.checked).dataset.sigla : '—';
    formulario.querySelectorAll('[data-grupo-stats]').forEach((grupo) => {
      grupo.hidden = grupo.dataset.grupoStats === 'arquero'
        ? !lista.includes('arquero')
        : !(lista.some((p) => p !== 'arquero') || !lista.length);
    });
    if (elegida) formulario.querySelector('[data-grupo="posicion_principal"]').classList.remove('grupo-opciones--error');
    dibujarStatsCarta();
    actualizarMedia();
  }

  [...radiosPrincipal, ...casillasAlternativa].forEach((input) => input.addEventListener('change', alCambiarPosiciones));

  rangos.forEach((rango) => {
    const clave = rango.dataset.editorStat;
    const valor = formulario.querySelector(`[data-editor-valor="${clave}"]`);
    rango.addEventListener('input', () => {
      valor.textContent = rango.value;
      const statCarta = carta.querySelector(`[data-carta-stat="${clave}"]`);
      if (statCarta) statCarta.textContent = rango.value;
      rango.style.setProperty('--valor', rango.value);
      actualizarMedia();
    });
  });

  const inputFoto = document.querySelector('[data-foto-input]');
  const preview = carta.querySelector('[data-foto-preview]');
  const silueta = carta.querySelector('[data-foto-silueta]');
  const botonQuitar = document.querySelector('[data-quitar-foto]');
  const textosSubir = document.querySelectorAll('[data-texto-subir], .carta-jugador__subir');
  const fotoGuardada = !preview.hidden;

  let fotoPendiente = null;
  let quitarFoto = false;
  let urlPendiente = null;

  function mostrarFoto(url) {
    if (url) preview.src = url;
    preview.hidden = !url;
    silueta.hidden = Boolean(url);
    carta.classList.toggle('carta-jugador--con-foto', Boolean(url));
    botonQuitar.hidden = !url;
    textosSubir.forEach((elemento) => {
      const nodo = Array.from(elemento.childNodes).reverse().find((n) => n.nodeType === Node.TEXT_NODE && n.textContent.trim());
      if (nodo) nodo.textContent = url ? ' Cambiar foto ' : ' Subir foto ';
    });
  }

  inputFoto.addEventListener('change', async () => {
    const archivo = inputFoto.files[0];
    inputFoto.value = '';
    if (!archivo) return;
    if (!TIPOS_FOTO.includes(archivo.type)) {
      avisar('Elige una imagen JPG, PNG o WebP.');
      return;
    }
    if (archivo.size > TAMANO_MAXIMO_ORIGINAL) {
      avisar('La imagen pesa más de 15 MB. Elige una más liviana.');
      return;
    }

    try {
      fotoPendiente = await prepararFoto(archivo);
      quitarFoto = false;
      if (urlPendiente) URL.revokeObjectURL(urlPendiente);
      urlPendiente = URL.createObjectURL(fotoPendiente);
      mostrarFoto(urlPendiente);
      avisar('Foto lista. Se guardará al presionar “Guardar cambios”.');
    } catch (err) {
      avisar('No pudimos leer esa imagen. Prueba con otra.');
    }
  });

  botonQuitar.addEventListener('click', () => {
    fotoPendiente = null;
    quitarFoto = fotoGuardada;
    mostrarFoto(null);
    avisar(fotoGuardada ? 'La foto se quitará al presionar “Guardar cambios”.' : '');
  });

  const alerta = formulario.querySelector('[data-alerta-errores]');

  formulario.addEventListener('submit', async (evento) => {
    if (!principal()) {
      evento.preventDefault();
      const item = document.createElement('li');
      item.textContent = 'Elige tu posición principal en la cancha.';
      alerta.querySelector('ul').replaceChildren(item);
      alerta.hidden = false;
      formulario.querySelector('[data-grupo="posicion_principal"]').classList.add('grupo-opciones--error');
      radiosPrincipal[0].focus();
      return;
    }

    if (!fotoPendiente && !quitarFoto) {
      botonGuardar.classList.add('btn--cargando');
      return;
    }

    evento.preventDefault();
    botonGuardar.classList.add('btn--cargando');
    avisar('Guardando foto...');

    try {
      const respuesta = fotoPendiente
        ? await fetch('/perfil/foto', { method: 'POST', headers: { 'Content-Type': 'image/jpeg' }, body: fotoPendiente })
        : await fetch('/perfil/foto/eliminar', { method: 'POST' });
      if (!respuesta.ok) {
        const datos = await respuesta.json().catch(() => ({}));
        throw new Error(datos.mensaje || 'No pudimos guardar la foto. Inténtalo de nuevo.');
      }
    } catch (err) {
      botonGuardar.classList.remove('btn--cargando');
      avisar(err instanceof TypeError ? 'Sin conexión: no pudimos guardar la foto.' : err.message);
      return;
    }

    fotoPendiente = null;
    quitarFoto = false;
    formulario.submit();
  });
});

// Zona "Eliminar mi cuenta": el botón rojo muestra la confirmación y el envío solo se habilita
// cuando el texto coincide con la frase exacta (el servidor la vuelve a comprobar).
document.addEventListener('DOMContentLoaded', () => {
  const zona = document.querySelector('[data-eliminar-cuenta]');
  if (!zona) return;
  const abrir = zona.querySelector('[data-eliminar-abrir]');
  const form = zona.querySelector('[data-eliminar-form]');
  const input = zona.querySelector('[data-eliminar-input]');
  const confirmar = zona.querySelector('[data-eliminar-confirmar]');
  const cancelar = zona.querySelector('[data-eliminar-cancelar]');
  const frase = input.dataset.frase;

  const actualizar = () => {
    confirmar.disabled = input.value.trim() !== frase;
  };

  abrir.addEventListener('click', () => {
    abrir.hidden = true;
    abrir.setAttribute('aria-expanded', 'true');
    form.hidden = false;
    input.focus();
  });

  cancelar.addEventListener('click', () => {
    form.hidden = true;
    input.value = '';
    actualizar();
    abrir.hidden = false;
    abrir.setAttribute('aria-expanded', 'false');
    abrir.focus();
  });

  input.addEventListener('input', actualizar);
  input.addEventListener('paste', (evento) => evento.preventDefault()); // que se escriba, no se pegue

  form.addEventListener('submit', (evento) => {
    if (input.value.trim() !== frase) {
      evento.preventDefault();
      return;
    }
    confirmar.disabled = true;
    confirmar.textContent = 'Eliminando…';
  });

  actualizar();
});
