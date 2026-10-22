// public/js/equipo.js
// Directorio de equipos (views/equipos.ejs):
//  1) Buscador: filtra las tarjetas (data-busqueda) mientras se escribe. Lo usan el directorio
//     (nombre o comuna) y el modal "Invitar jugador" del panel (nombre o posición).
//  2) "Solicitar unirme": abre un modal para el mensaje al capitán, envía la solicitud con fetch
//     (sin recargar) y deja el botón deshabilitado como "Solicitud enviada ✓" para no mandarla dos veces.
// Panel /mi-equipo (views/equipo-panel.ejs): el plantel y las solicitudes llegan del servidor;
//  3) Aceptar/Rechazar desactivan los botones de esa solicitud al enviarse (evita doble envío).
//  4) Desafíos: "Desafiar a otro equipo" abre la lista de rivales; "Enviar Desafío" abre un
//     modal (fecha, hora y mensaje opcionales) y lo envía con fetch, sin recargar.
//  5) Cancha táctica (solo el capitán): las cartas se arrastran (o se mueven con las flechas) y
//     cada posición se guarda al soltar. La "X" de cada carta saca al jugador (confirmarAccion + fetch):
//     la carta desaparece sin recargar.
//  6) Escudo (solo el capitán): la imagen se reduce a LADO_ESCUDO px en el navegador y se sube.
//  7) "Invitar jugador +" (solo el capitán): abre el modal con todos los jugadores (con buscador, ver 1);
//     "Invitar" se envía con fetch y el botón queda gris como "Invitación Enviada".

// (dashboard.js, cargado en la misma página, ya declara DURACION_AVISO_MS)
const DURACION_EXITO_MS = 3200;

// Cancha: hasta dónde se puede llevar el centro de una carta (en %), para que no se salga
const LIMITES_CANCHA = { x: [8, 92], y: [9, 91] };
const PASO_TECLADO = 2;          // % que avanza una carta con cada flecha
const ESPERA_GUARDAR_MS = 450;   // con el teclado, se guarda al dejar de mover

// Escudo: cabe entero (como "object-fit: contain") en un cuadrado de este lado, en PNG (con transparencia)
const LADO_ESCUDO = 256;

// Texto del botón según la respuesta del servidor
const TEXTOS_BOTON = {
  enviada: 'Solicitud enviada ✓',
  pendiente: 'Solicitud enviada ✓',
  miembro: 'Ya eres parte',
  inexistente: 'No disponible',
};

/** Minúsculas y sin tildes, para que "maipu" encuentre "Maipú". */
function normalizar(texto) {
  return texto.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();
}

document.addEventListener('DOMContentLoaded', () => {
  const aviso = document.querySelector('[data-aviso]');

  let temporizador;
  function mostrarAviso(texto) {
    if (!aviso) return;
    aviso.textContent = texto;
    aviso.classList.add('panel-aviso--visible');
    clearTimeout(temporizador);
    temporizador = setTimeout(() => aviso.classList.remove('panel-aviso--visible'), DURACION_EXITO_MS);
  }

  // El aviso que llega del servidor (formulario sin JavaScript) se esconde solo
  if (aviso && aviso.classList.contains('panel-aviso--visible')) {
    temporizador = setTimeout(() => aviso.classList.remove('panel-aviso--visible'), DURACION_EXITO_MS);
  }

  // ---------- 1) Buscador ----------
  const buscador = document.querySelector('[data-buscar-equipo]');
  if (buscador) {
    const tarjetas = [...document.querySelectorAll('[data-busqueda]')];
    const sinResultados = document.querySelector('[data-sin-resultados]');
    const total = document.querySelector('[data-total-resultados]'); // pie del modal "Invitar jugador"
    buscador.addEventListener('input', () => {
      const texto = normalizar(buscador.value);
      let visibles = 0;
      tarjetas.forEach((tarjeta) => {
        const coincide = normalizar(tarjeta.dataset.busqueda).includes(texto);
        tarjeta.hidden = !coincide;
        if (coincide) visibles += 1;
      });
      sinResultados.hidden = visibles > 0;
      if (total) total.textContent = visibles;
    });
  }

  // ---------- 3) Aceptar / Rechazar ----------
  document.querySelectorAll('form[data-responder]').forEach((formulario) => {
    formulario.addEventListener('submit', (evento) => {
      const botones = formulario.closest('.eq-solicitud__acciones').querySelectorAll('button');
      if (botones[0].disabled) {
        evento.preventDefault();
        return;
      }
      // Después del envío: si se desactivan antes, el formulario no se manda
      setTimeout(() => botones.forEach((boton) => { boton.disabled = true; }));
    });
  });

  // ---------- 4) Desafíos ----------
  const seccionDesafios = document.querySelector('[data-desafios]');
  const modal = document.querySelector('[data-modal-desafio]');

  // El botón de la cabecera abre la sección (es un <details>) y baja hasta ella
  document.querySelector('[data-abrir-desafios]')?.addEventListener('click', (evento) => {
    evento.preventDefault();
    seccionDesafios.open = true;
    seccionDesafios.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  if (modal) {
    const formModal = modal.querySelector('[data-form-desafio]');
    const errorModal = modal.querySelector('[data-modal-error]');
    const botonEnviar = formModal.querySelector('button[type="submit"]');
    let formularioRival = null; // el formulario del rival elegido (su action dice a quién desafiar)

    function abrirModal(formulario) {
      formularioRival = formulario;
      modal.querySelector('[data-modal-rival]').textContent = formulario.dataset.rival;
      formModal.reset();
      errorModal.hidden = true;
      modal.hidden = false;
      document.body.style.overflow = 'hidden'; // la página no se desplaza detrás del modal
      formModal.querySelector('input').focus();
    }

    function cerrarModal() {
      modal.hidden = true;
      document.body.style.overflow = '';
      formularioRival?.querySelector('button')?.focus();
    }

    // "Enviar Desafío" no envía todavía: abre el modal (sin JS, el formulario se envía directo)
    document.querySelectorAll('form[data-desafiar]').forEach((formulario) => {
      formulario.addEventListener('submit', (evento) => {
        evento.preventDefault();
        if (!formulario.querySelector('button').disabled) abrirModal(formulario);
      });
    });

    // Cerrar: botón Cancelar, clic fuera de la caja o tecla Escape
    modal.querySelector('[data-cerrar-modal]').addEventListener('click', cerrarModal);
    modal.addEventListener('click', (evento) => { if (evento.target === modal) cerrarModal(); });
    document.addEventListener('keydown', (evento) => { if (evento.key === 'Escape' && !modal.hidden) cerrarModal(); });

    formModal.addEventListener('submit', async (evento) => {
      evento.preventDefault();
      if (botonEnviar.disabled) return;
      botonEnviar.disabled = true;
      errorModal.hidden = true;

      try {
        const respuesta = await fetch(formularioRival.action, {
          method: 'POST',
          headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams(new FormData(formModal)),
        });
        const datos = await respuesta.json().catch(() => ({}));
        if (!respuesta.ok || !datos.resultado) throw new Error(datos.error || 'No se pudo enviar el desafío. Inténtalo de nuevo.');

        // Enviado (o ya había uno pendiente): el botón queda gris y deshabilitado
        const boton = formularioRival.querySelector('button');
        if (datos.resultado === 'enviado' || datos.resultado === 'pendiente') {
          boton.textContent = 'Desafío Enviado ✓';
          boton.classList.remove('btn--verde');
          boton.disabled = true;
        }
        cerrarModal();
        if (datos.mensaje) mostrarAviso(datos.mensaje);
      } catch (err) {
        console.error('No se pudo enviar el desafío:', err);
        errorModal.textContent = err.message;
        errorModal.hidden = false;
      } finally {
        botonEnviar.disabled = false;
      }
    });
  }

  // ---------- 2) Solicitar unirme ----------
  const modalUnion = document.querySelector('[data-modal-union]');
  if (modalUnion) {
    const formUnion = modalUnion.querySelector('[data-form-union]');
    const campoMensaje = formUnion.querySelector('textarea');
    const errorUnion = modalUnion.querySelector('[data-modal-error]');
    const botonUnion = formUnion.querySelector('button[type="submit"]');
    let formularioEquipo = null; // el formulario del equipo elegido (su action dice a cuál unirse)

    function abrirUnion(formulario) {
      formularioEquipo = formulario;
      modalUnion.querySelector('[data-modal-equipo]').textContent = formulario.dataset.equipo;
      formUnion.reset();
      errorUnion.hidden = true;
      modalUnion.hidden = false;
      document.body.style.overflow = 'hidden'; // la página no se desplaza detrás del modal
      campoMensaje.focus();
    }

    function cerrarUnion() {
      modalUnion.hidden = true;
      document.body.style.overflow = '';
      formularioEquipo?.querySelector('button')?.focus();
    }

    // "Solicitar unirme" abre el modal (sin JS, el formulario se envía directo y sin mensaje)
    document.querySelectorAll('form[data-unirme]').forEach((formulario) => {
      formulario.addEventListener('submit', (evento) => {
        evento.preventDefault();
        if (!formulario.querySelector('button').disabled) abrirUnion(formulario);
      });
    });

    // Cerrar: botón Cancelar, clic fuera de la caja o tecla Escape
    modalUnion.querySelector('[data-cerrar-modal]').addEventListener('click', cerrarUnion);
    modalUnion.addEventListener('click', (evento) => { if (evento.target === modalUnion) cerrarUnion(); });
    document.addEventListener('keydown', (evento) => { if (evento.key === 'Escape' && !modalUnion.hidden) cerrarUnion(); });

    formUnion.addEventListener('submit', async (evento) => {
      evento.preventDefault();
      if (botonUnion.disabled) return;
      if (!campoMensaje.value.trim()) {
        errorUnion.textContent = 'Escribe un mensaje para el capitán.';
        errorUnion.hidden = false;
        campoMensaje.focus();
        return;
      }
      botonUnion.disabled = true;
      errorUnion.hidden = true;

      try {
        const respuesta = await fetch(formularioEquipo.action, {
          method: 'POST',
          headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams(new FormData(formUnion)),
        });
        const datos = await respuesta.json().catch(() => ({}));
        if (!respuesta.ok || !datos.resultado) throw new Error(datos.error || 'No se pudo enviar la solicitud. Inténtalo de nuevo.');

        const boton = formularioEquipo.querySelector('button');
        boton.textContent = TEXTOS_BOTON[datos.resultado];
        boton.classList.remove('btn--verde');
        boton.disabled = true;
        cerrarUnion();
        if (datos.mensaje) mostrarAviso(datos.mensaje);
      } catch (err) {
        console.error('No se pudo enviar la solicitud:', err);
        errorUnion.textContent = err.message;
        errorUnion.hidden = false;
      } finally {
        botonUnion.disabled = false;
      }
    });
  }

  // ---------- 7) Invitar jugador ----------
  const modalInvitar = document.querySelector('[data-modal-invitar]');
  if (modalInvitar) {
    function cerrarInvitar() {
      modalInvitar.hidden = true;
      document.body.style.overflow = '';
    }

    // Degradados de la lista: arriba si ya se bajó, abajo si quedan jugadores (también al filtrar)
    const marco = modalInvitar.querySelector('[data-marco-invitar]');
    const cuerpo = modalInvitar.querySelector('[data-cuerpo-invitar]');
    function marcarScroll() {
      marco.classList.toggle('eq-invitar__marco--arriba', cuerpo.scrollTop > 4);
      marco.classList.toggle('eq-invitar__marco--abajo', cuerpo.scrollTop + cuerpo.clientHeight < cuerpo.scrollHeight - 4);
    }
    cuerpo.addEventListener('scroll', marcarScroll, { passive: true });
    modalInvitar.querySelector('[data-buscar-equipo]')?.addEventListener('input', marcarScroll);

    document.querySelector('[data-abrir-invitar]')?.addEventListener('click', () => {
      modalInvitar.hidden = false;
      marcarScroll();
      document.body.style.overflow = 'hidden'; // la página no se desplaza detrás del modal
      (modalInvitar.querySelector('[data-buscar-equipo]') || modalInvitar.querySelector('[data-cerrar-modal]')).focus();
    });

    // Cerrar: botón Cerrar, clic fuera de la caja o tecla Escape
    modalInvitar.querySelector('[data-cerrar-modal]').addEventListener('click', cerrarInvitar);
    modalInvitar.addEventListener('click', (evento) => { if (evento.target === modalInvitar) cerrarInvitar(); });
    document.addEventListener('keydown', (evento) => { if (evento.key === 'Escape' && !modalInvitar.hidden) cerrarInvitar(); });

    modalInvitar.querySelectorAll('form[data-invitar]').forEach((formulario) => {
      formulario.addEventListener('submit', async (evento) => {
        evento.preventDefault();
        const boton = formulario.querySelector('button');
        if (boton.disabled) return;
        boton.disabled = true;

        try {
          const respuesta = await fetch(formulario.action, { method: 'POST', headers: { Accept: 'application/json' } });
          const datos = await respuesta.json().catch(() => ({}));
          if (!respuesta.ok || !datos.resultado) throw new Error('No se pudo enviar la invitación. Inténtalo de nuevo.');

          // Enviada (o ya estaba): el botón queda gris y deshabilitado
          if (datos.resultado === 'enviada' || datos.resultado === 'ya-invitado') {
            boton.textContent = 'Invitación Enviada';
            boton.classList.remove('btn--verde');
          } else {
            boton.disabled = false;
          }
          if (datos.mensaje) mostrarAviso(datos.mensaje);
        } catch (err) {
          console.error('No se pudo enviar la invitación:', err);
          boton.disabled = false;
          mostrarAviso(err.message);
        }
      });
    });
  }

  // ---------- 5) Cancha táctica ----------
  const cancha = document.querySelector('[data-cancha-editable]');
  if (cancha) {
    const limitar = (valor, [min, max]) => Math.min(max, Math.max(min, valor));

    function colocar(ficha, x, y) {
      const nuevaX = limitar(x, LIMITES_CANCHA.x);
      const nuevaY = limitar(y, LIMITES_CANCHA.y);
      ficha.dataset.x = nuevaX.toFixed(2);
      ficha.dataset.y = nuevaY.toFixed(2);
      ficha.style.setProperty('--x', ficha.dataset.x);
      ficha.style.setProperty('--y', ficha.dataset.y);
    }

    // Guarda la posición; si falla, la carta vuelve a donde estaba
    async function guardar(ficha, anterior) {
      try {
        const respuesta = await fetch(ficha.dataset.url, {
          method: 'POST',
          headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ x: ficha.dataset.x, y: ficha.dataset.y }),
        });
        const datos = await respuesta.json().catch(() => ({}));
        if (!respuesta.ok || !datos.ok) throw new Error(datos.mensaje || 'No se pudo guardar la posición.');
      } catch (err) {
        console.error('No se pudo guardar la posición:', err);
        colocar(ficha, anterior.x, anterior.y);
        mostrarAviso(err.message || 'No se pudo guardar la posición.');
      }
    }

    cancha.querySelectorAll('[data-ficha]').forEach((ficha) => {
      let arrastre = null;

      ficha.addEventListener('pointerdown', (evento) => {
        if (evento.button !== 0) return;
        evento.preventDefault();
        const rect = cancha.getBoundingClientRect();
        const punteroX = ((evento.clientX - rect.left) / rect.width) * 100;
        const punteroY = ((evento.clientY - rect.top) / rect.height) * 100;
        const x = Number(ficha.dataset.x);
        const y = Number(ficha.dataset.y);
        // Se guarda dónde se tomó la carta: no salta a centrarse bajo el puntero
        arrastre = { rect, desfaseX: punteroX - x, desfaseY: punteroY - y, anterior: { x, y }, movida: false };
        ficha.setPointerCapture(evento.pointerId);
        ficha.classList.add('arrastrando');
      });

      ficha.addEventListener('pointermove', (evento) => {
        if (!arrastre) return;
        const { rect } = arrastre;
        arrastre.movida = true;
        colocar(
          ficha,
          ((evento.clientX - rect.left) / rect.width) * 100 - arrastre.desfaseX,
          ((evento.clientY - rect.top) / rect.height) * 100 - arrastre.desfaseY
        );
      });

      function soltar() {
        if (!arrastre) return;
        const { movida, anterior } = arrastre;
        arrastre = null;
        ficha.classList.remove('arrastrando');
        if (movida) guardar(ficha, anterior);
      }
      ficha.addEventListener('pointerup', soltar);
      ficha.addEventListener('pointercancel', soltar);

      // Teclado: flechas para mover; se guarda al dejar de mover
      let pendiente = null;
      let antesDeTeclas = null;
      ficha.addEventListener('keydown', (evento) => {
        const pasos = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[evento.key];
        if (!pasos) return;
        evento.preventDefault();
        if (!antesDeTeclas) antesDeTeclas = { x: Number(ficha.dataset.x), y: Number(ficha.dataset.y) };
        colocar(ficha, Number(ficha.dataset.x) + pasos[0] * PASO_TECLADO, Number(ficha.dataset.y) + pasos[1] * PASO_TECLADO);
        clearTimeout(pendiente);
        pendiente = setTimeout(() => {
          guardar(ficha, antesDeTeclas);
          antesDeTeclas = null;
        }, ESPERA_GUARDAR_MS);
      });
    });
  }

  // "X": sacar del plantel. Su pointerdown no llega a la carta (no empieza un arrastre).
  document.querySelectorAll('form[data-sacar]').forEach((formulario) => {
    const boton = formulario.querySelector('button');
    boton.addEventListener('pointerdown', (evento) => evento.stopPropagation());
    boton.addEventListener('keydown', (evento) => evento.stopPropagation()); // las flechas no mueven la carta

    formulario.addEventListener('submit', async (evento) => {
      evento.preventDefault();
      if (boton.disabled) return;
      const confirmado = await confirmarAccion({
        titulo: 'Sacar jugador',
        texto: `¿Estás seguro de que quieres sacar a ${formulario.dataset.nombre} del equipo?`,
        confirmar: 'Sacar del equipo',
      });
      if (!confirmado) return;
      const ficha = formulario.closest('.cancha__jugador');
      boton.disabled = true;
      ficha.classList.add('cancha__jugador--saliendo'); // cargando: la carta se atenúa

      try {
        const respuesta = await fetch(formulario.action, { method: 'POST', headers: { Accept: 'application/json' } });
        const datos = await respuesta.json().catch(() => ({}));
        if (!respuesta.ok || !datos.ok) throw new Error(datos.mensaje || 'No se pudo sacar al jugador. Inténtalo de nuevo.');

        ficha.remove();
        const total = document.querySelector('[data-total-plantel]');
        const quedan = document.querySelectorAll('.cancha__jugador').length;
        if (total) total.textContent = `${quedan} ${quedan === 1 ? 'Jugador' : 'Jugadores'}`;
        mostrarAviso(datos.mensaje);
      } catch (err) {
        console.error('No se pudo sacar al jugador:', err);
        boton.disabled = false;
        ficha.classList.remove('cancha__jugador--saliendo');
        mostrarAviso(err.message);
      }
    });
  });

  // ---------- 6) Escudo ----------
  const inputEscudo = document.querySelector('[data-escudo-input]');
  if (inputEscudo) {
    const vistaEscudo = document.querySelector('[data-escudo-vista]');

    /** La imagen entera dentro de un cuadrado de LADO_ESCUDO px, en PNG. */
    async function reducirEscudo(archivo) {
      const imagen = await createImageBitmap(archivo);
      const escala = Math.min(1, LADO_ESCUDO / Math.max(imagen.width, imagen.height));
      const ancho = Math.round(imagen.width * escala);
      const alto = Math.round(imagen.height * escala);
      const canvas = document.createElement('canvas');
      canvas.width = LADO_ESCUDO;
      canvas.height = LADO_ESCUDO;
      canvas.getContext('2d').drawImage(imagen, (LADO_ESCUDO - ancho) / 2, (LADO_ESCUDO - alto) / 2, ancho, alto);
      imagen.close();
      return new Promise((resolve, reject) => {
        canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('No se pudo procesar la imagen.'))), 'image/png');
      });
    }

    inputEscudo.addEventListener('change', async () => {
      const archivo = inputEscudo.files[0];
      if (!archivo) return;
      try {
        const escudo = await reducirEscudo(archivo);
        const respuesta = await fetch(inputEscudo.dataset.url, {
          method: 'POST',
          headers: { Accept: 'application/json', 'Content-Type': 'image/png' },
          body: escudo,
        });
        const datos = await respuesta.json().catch(() => ({}));
        if (!respuesta.ok || !datos.ok) throw new Error(datos.mensaje || 'No se pudo guardar el escudo.');

        const imagen = new Image();
        imagen.className = 'escudo-equipo__img';
        imagen.alt = '';
        imagen.src = URL.createObjectURL(escudo);
        vistaEscudo.replaceChildren(imagen);
        mostrarAviso('Escudo actualizado.');
      } catch (err) {
        console.error('No se pudo subir el escudo:', err);
        mostrarAviso(err.message || 'No se pudo guardar el escudo.');
      } finally {
        inputEscudo.value = '';
      }
    });
  }
});
