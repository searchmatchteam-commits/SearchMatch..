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
  });

  const posicionCarta = carta.querySelector('[data-carta-posicion]');
  const casillasPosicion = Array.from(formulario.querySelectorAll('input[name="posicion"]'));
  const grupoPosicion = formulario.querySelector('[data-grupo="posicion"]');
  casillasPosicion.forEach((casilla) => {
    casilla.addEventListener('change', () => {
      const principal = casillasPosicion.find((c) => c.checked);
      posicionCarta.textContent = principal ? principal.dataset.sigla : '—';
      if (principal) grupoPosicion.classList.remove('grupo-opciones--error');
    });
  });

  const rangos = Array.from(formulario.querySelectorAll('[data-editor-stat]'));
  const mediaCarta = carta.querySelector('[data-carta-media]');
  const mediaEditor = formulario.querySelector('[data-editor-media]');

  function actualizarMedia() {
    const suma = rangos.reduce((total, rango) => total + Number(rango.value), 0);
    const media = String(Math.round(suma / rangos.length));
    mediaCarta.textContent = media;
    mediaEditor.textContent = media;
  }

  rangos.forEach((rango) => {
    const clave = rango.dataset.editorStat;
    const valor = formulario.querySelector(`[data-editor-valor="${clave}"]`);
    const statCarta = carta.querySelector(`[data-carta-stat="${clave}"]`);
    rango.addEventListener('input', () => {
      valor.textContent = rango.value;
      statCarta.textContent = rango.value;
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
    if (!casillasPosicion.some((c) => c.checked)) {
      evento.preventDefault();
      const item = document.createElement('li');
      item.textContent = 'Elige al menos una posición en la cancha.';
      alerta.querySelector('ul').replaceChildren(item);
      alerta.hidden = false;
      grupoPosicion.classList.add('grupo-opciones--error');
      casillasPosicion[0].focus();
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
