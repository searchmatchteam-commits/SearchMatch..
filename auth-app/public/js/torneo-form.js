// public/js/torneo-form.js
// Formulario de torneo del panel (/admin/torneos/nuevo y /editar).
//  - Vista previa de la foto elegida; avisa si falta, si el tipo no sirve o si pesa más de 5 MB (el servidor lo revalida).
//  - Patrocinadores: muestra un bloque y "+ Agregar otro patrocinador" revela el siguiente.
//  - TO-001 c5: al elegir la modalidad solo quedan los recintos con canchas activas de ella; al elegir el recinto
//    se cargan sus canchas activas de la modalidad (GET /admin/torneos/canchas).
//  - TO-001 c6: cantidad de grupos y clasificados solo con Fase de grupos.
//  - TO-002 c6: con PayPal, el equivalente en dólares del precio.
// Sin JavaScript el formulario funciona igual: se ven todos los campos, el botón "Ver canchas del recinto elegido"
// recarga el formulario y el servidor valida.

(function () {
  const form = document.querySelector('[data-torneo-form]');
  if (!form) return;

  const TIPOS = ['image/jpeg', 'image/png', 'image/webp'];
  // Vercel corta cualquier envío de más de 4,5 MB (error 413) y una foto de celular suele pesar eso o más:
  // antes de enviar, la foto se achica en el navegador (1600 px, JPEG) y cada logo a 512 px.
  const MAX_ORIGINAL = 30 * 1024 * 1024;
  const pendientes = new Set();

  function cargarImagen(archivo) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(archivo);
      const img = new Image();
      img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('ilegible')); };
      img.src = url;
    });
  }

  /** Devuelve un File más liviano (o el original si ya era chico o el navegador no puede reducirlo). */
  async function achicar(archivo, { ladoMaximo, conservarTransparencia }) {
    if (archivo.size <= 300 * 1024) return archivo; // ya es liviana
    const img = await cargarImagen(archivo);
    const escala = Math.min(1, ladoMaximo / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.naturalWidth * escala));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * escala));
    const ctx = canvas.getContext('2d');
    const tipo = conservarTransparencia && archivo.type !== 'image/jpeg' ? 'image/png' : 'image/jpeg';
    if (tipo === 'image/jpeg') { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height); }
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, tipo, 0.85));
    if (!blob || blob.size >= archivo.size) return archivo;
    const nombre = archivo.name.replace(/\.[^.]+$/, '') + (tipo === 'image/png' ? '.png' : '.jpg');
    return new File([blob], nombre, { type: tipo, lastModified: Date.now() });
  }

  /** Reemplaza el archivo elegido por su versión achicada. Devuelve un mensaje de error o ''. */
  async function prepararArchivo(input, opciones) {
    const archivo = input.files[0];
    if (!archivo) return '';
    if (!TIPOS.includes(archivo.type)) return 'La imagen debe ser JPG, PNG o WebP.';
    if (archivo.size > MAX_ORIGINAL) return 'La imagen es demasiado grande (más de 30 MB). Elige otra.';
    try {
      const liviano = await achicar(archivo, opciones);
      if (liviano !== archivo && typeof DataTransfer === 'function') {
        const dt = new DataTransfer();
        dt.items.add(liviano);
        input.files = dt.files;
      }
      return input.files[0].size > opciones.maximo ? `La imagen sigue pesando más de ${Math.round(opciones.maximo / 1024 / 1024)} MB: elige una más liviana.` : '';
    } catch (err) {
      return 'No se pudo leer la imagen. Prueba con otra JPG, PNG o WebP.';
    }
  }

  function vigilar(input, opciones, alTerminar) {
    input.addEventListener('change', () => {
      if (!input.files[0]) return;
      const tarea = prepararArchivo(input, opciones).then((mensaje) => {
        if (mensaje) input.value = '';
        alTerminar(mensaje);
      });
      pendientes.add(tarea);
      tarea.finally(() => pendientes.delete(tarea));
    });
  }

  const inputFoto = form.querySelector('[data-foto-input]');
  const vistaFoto = form.querySelector('[data-foto-vista]');
  if (inputFoto && vistaFoto) {
    const campoFoto = inputFoto.closest('.campo');
    const errorFoto = form.querySelector('#foto-error');
    function marcarFoto(mensaje) {
      campoFoto.classList.toggle('campo--error', Boolean(mensaje));
      errorFoto.textContent = mensaje;
    }

    vigilar(inputFoto, { ladoMaximo: 1600, maximo: 3 * 1024 * 1024 }, (mensaje) => {
      marcarFoto(mensaje);
      if (mensaje) { vistaFoto.hidden = true; return; }
      vistaFoto.src = URL.createObjectURL(inputFoto.files[0]);
      vistaFoto.hidden = false;
    });
  }

  // Logos de patrocinadores: igual que la foto, pero más chicos y conservando la transparencia.
  form.querySelectorAll('input[type="file"][name^="patrocinador_logo_"]').forEach((input) => {
    vigilar(input, { ladoMaximo: 512, conservarTransparencia: true, maximo: 1024 * 1024 }, (mensaje) => {
      const bloque = input.closest('[data-patrocinador]') || input.closest('.campo');
      if (!bloque) return;
      let error = bloque.querySelector('[data-error-logo]');
      if (!error) {
        error = document.createElement('small');
        error.className = 'campo__error';
        error.setAttribute('data-error-logo', '');
        input.insertAdjacentElement('afterend', error);
      }
      error.textContent = mensaje;
    });
  });

  // El formulario es novalidate: sin este aviso, recién el servidor diría que falta la foto.
  // Además espera a que terminen de achicarse las imágenes antes de enviar.
  const botonGuardar = [...form.querySelectorAll('button[type="submit"]')].find((b) => b.name !== 'accion');
  form.addEventListener('submit', async (e) => {
    if (e.submitter && e.submitter.name === 'accion') return;
    if (form.dataset.listo === 'si') return;
    e.preventDefault();
    if (pendientes.size > 0) {
      if (botonGuardar) { botonGuardar.disabled = true; botonGuardar.dataset.texto = botonGuardar.textContent; botonGuardar.textContent = 'Preparando imágenes…'; }
      await Promise.all([...pendientes]);
      if (botonGuardar) { botonGuardar.disabled = false; botonGuardar.textContent = botonGuardar.dataset.texto; }
    }
    if (inputFoto && !inputFoto.disabled && inputFoto.required && inputFoto.files.length === 0) {
      const campoFoto = inputFoto.closest('.campo');
      campoFoto.classList.add('campo--error');
      form.querySelector('#foto-error').textContent = 'La foto del torneo es obligatoria: sube una imagen JPG, PNG o WebP.';
      campoFoto.scrollIntoView({ behavior: 'smooth', block: 'center' });
      inputFoto.focus({ preventScroll: true });
      return;
    }
    form.dataset.listo = 'si';
    if (botonGuardar) { botonGuardar.disabled = true; botonGuardar.textContent = 'Guardando…'; }
    form.submit();
  });

  const bloques = [...form.querySelectorAll('[data-patrocinador]')];
  const botonAgregar = form.querySelector('[data-agregar-patrocinador]');
  const tieneDatos = (b) => b.classList.contains('campo--error') || [...b.querySelectorAll('input')].some((i) => i.value);
  bloques.forEach((b, i) => { b.hidden = i > 0 && !tieneDatos(b); });
  function actualizarBoton() {
    botonAgregar.hidden = !bloques.some((b) => b.hidden);
  }
  if (botonAgregar) {
    actualizarBoton();
    botonAgregar.addEventListener('click', () => {
      const siguiente = bloques.find((b) => b.hidden);
      if (!siguiente) return;
      siguiente.hidden = false;
      siguiente.querySelector('input').focus();
      actualizarBoton();
    });
  }

  // Fase de grupos
  const formato = form.querySelector('[data-formato]');
  const soloGrupos = form.querySelector('[data-solo-grupos]');
  function mostrarGrupos() {
    if (formato && soloGrupos) soloGrupos.hidden = formato.value !== 'grupos';
  }
  if (formato) formato.addEventListener('change', mostrarGrupos);
  mostrarGrupos();

  // Recinto y canchas de la modalidad
  const modalidad = form.querySelector('[data-modalidad]');
  const recinto = form.querySelector('[data-recinto]');
  const lista = form.querySelector('[data-canchas-lista]');
  const botonRecargar = form.querySelector('[data-canchas] [data-sin-js]');
  if (botonRecargar) botonRecargar.hidden = true;

  function nota(texto) {
    const p = document.createElement('p');
    p.className = 'dash-panel__nota';
    p.textContent = texto;
    return p;
  }

  function filtrarRecintos() {
    if (!modalidad || !recinto || recinto.disabled) return;
    [...recinto.options].forEach((op) => {
      if (!op.value) return;
      const admite = !modalidad.value || op.dataset.modalidades.split(',').includes(modalidad.value);
      op.hidden = !admite;
      op.disabled = !admite;
      if (!admite && op.selected) recinto.value = '';
    });
  }

  async function cargarCanchas() {
    if (!recinto || !lista || recinto.disabled) return;
    const elegidas = new Set([...lista.querySelectorAll('input[name="canchas"]:checked')].map((c) => c.value));
    lista.replaceChildren();
    if (!recinto.value) { lista.append(nota('Elige el recinto para ver sus canchas.')); return; }
    lista.append(nota('Cargando canchas…'));
    try {
      const qs = new URLSearchParams({ recinto: recinto.value, modalidad: modalidad ? modalidad.value : '' });
      const respuesta = await fetch(`/admin/torneos/canchas?${qs}`, { headers: { Accept: 'application/json' } });
      const { canchas } = await respuesta.json();
      lista.replaceChildren();
      if (canchas.length === 0) { lista.append(nota('Ese recinto no tiene canchas activas de la modalidad.')); return; }
      canchas.forEach((c) => {
        const etiqueta = document.createElement('label');
        etiqueta.className = 'sm-casilla';
        const casilla = document.createElement('input');
        casilla.type = 'checkbox';
        casilla.name = 'canchas';
        casilla.value = String(c.id);
        casilla.checked = elegidas.has(String(c.id)) || canchas.length === 1;
        const detalle = document.createElement('small');
        detalle.textContent = `(${c.modalidad})`;
        etiqueta.append(casilla, ` ${c.nombre} `, detalle);
        lista.append(etiqueta);
      });
    } catch (err) {
      lista.replaceChildren(nota('No se pudieron cargar las canchas. Guarda para verlas o vuelve a intentarlo.'));
      if (botonRecargar) botonRecargar.hidden = false;
    }
  }

  if (modalidad) modalidad.addEventListener('change', () => { filtrarRecintos(); cargarCanchas(); });
  if (recinto) recinto.addEventListener('change', cargarCanchas);
  filtrarRecintos();

  // Equivalente en USD para PayPal
  const precio = form.querySelector('[data-precio]');
  const paypal = form.querySelector('[data-paypal]');
  const usd = form.querySelector('[data-usd]');
  const usdMonto = form.querySelector('[data-usd-monto]');
  function mostrarUSD() {
    if (!precio || !usd) return;
    const tipoCambio = Number(precio.dataset.tipoCambio);
    const monto = Number(String(precio.value).replace(/\./g, ''));
    const ver = Boolean(paypal && paypal.checked && tipoCambio > 0 && Number.isInteger(monto) && monto > 0);
    usd.hidden = !ver;
    if (ver) usdMonto.textContent = `US$${(Math.ceil((monto / tipoCambio) * 100) / 100).toFixed(2)}`;
  }
  if (precio) precio.addEventListener('input', mostrarUSD);
  if (paypal) paypal.addEventListener('change', mostrarUSD);
  mostrarUSD();
})();
