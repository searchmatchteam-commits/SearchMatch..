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

  const inputFoto = form.querySelector('[data-foto-input]');
  const vistaFoto = form.querySelector('[data-foto-vista]');
  if (inputFoto && vistaFoto) {
    const campoFoto = inputFoto.closest('.campo');
    const errorFoto = form.querySelector('#foto-error');
    function marcarFoto(mensaje) {
      campoFoto.classList.toggle('campo--error', Boolean(mensaje));
      errorFoto.textContent = mensaje;
    }

    inputFoto.addEventListener('change', () => {
      const archivo = inputFoto.files[0];
      if (!archivo) return;
      let mensaje = '';
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(archivo.type)) mensaje = 'La foto debe ser una imagen JPG, PNG o WebP.';
      else if (archivo.size > 5 * 1024 * 1024) mensaje = 'La foto puede pesar como máximo 5 MB.';
      marcarFoto(mensaje);
      if (mensaje) {
        inputFoto.value = '';
        return;
      }
      vistaFoto.src = URL.createObjectURL(archivo);
      vistaFoto.hidden = false;
    });

    // El formulario es novalidate: sin este aviso, recién el servidor diría que falta la foto.
    form.addEventListener('submit', (e) => {
      if (inputFoto.disabled || !inputFoto.required || inputFoto.files.length > 0) return;
      e.preventDefault();
      marcarFoto('La foto del torneo es obligatoria: sube una imagen JPG, PNG o WebP.');
      inputFoto.focus();
    });
  }

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
