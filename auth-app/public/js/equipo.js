// public/js/equipo.js
// Directorio de equipos (views/equipos.ejs):
//  1) Buscador: filtra las tarjetas por nombre o comuna mientras se escribe.
//  2) "Solicitar unirme": envía la solicitud con fetch (sin recargar) y deja el
//     botón deshabilitado como "Solicitud enviada ✓" para no mandarla dos veces.
// Panel /mi-equipo (views/equipo-panel.ejs): el plantel y las solicitudes llegan del servidor;
//  3) Aceptar/Rechazar desactivan los botones de esa solicitud al enviarse (evita doble envío).
//  4) Desafíos: "Desafiar a otro equipo" abre la lista de rivales; "Enviar Desafío" abre un
//     modal (fecha, hora y mensaje opcionales) y lo envía con fetch, sin recargar.

// (dashboard.js, cargado en la misma página, ya declara DURACION_AVISO_MS)
const DURACION_EXITO_MS = 3200;

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
    buscador.addEventListener('input', () => {
      const texto = normalizar(buscador.value);
      let visibles = 0;
      tarjetas.forEach((tarjeta) => {
        const coincide = normalizar(tarjeta.dataset.busqueda).includes(texto);
        tarjeta.hidden = !coincide;
        if (coincide) visibles += 1;
      });
      sinResultados.hidden = visibles > 0;
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
  document.querySelectorAll('form[data-unirme]').forEach((formulario) => {
    formulario.addEventListener('submit', async (evento) => {
      evento.preventDefault();
      const boton = formulario.querySelector('button');
      if (boton.disabled) return;
      boton.disabled = true;

      try {
        const respuesta = await fetch(formulario.action, { method: 'POST', headers: { Accept: 'application/json' } });
        if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`);
        const { resultado, mensaje } = await respuesta.json();

        boton.textContent = TEXTOS_BOTON[resultado];
        boton.classList.remove('btn--verde');
        if (mensaje) mostrarAviso(mensaje);
      } catch (err) {
        console.error('No se pudo enviar la solicitud:', err);
        boton.disabled = false;
        mostrarAviso('No se pudo enviar la solicitud. Inténtalo de nuevo.');
      }
    });
  });
});
