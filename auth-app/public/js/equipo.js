// public/js/equipo.js
// Directorio de equipos (views/equipos.ejs):
//  1) Buscador: filtra las tarjetas (data-busqueda) mientras se escribe. Lo usan el directorio
//     (nombre o comuna) y el modal "Invitar jugador" del panel (nombre o posición).
//  2) "Solicitar unirme": abre un modal para el mensaje al capitán, envía la solicitud con fetch
//     (sin recargar) y deja el botón deshabilitado como "Solicitud enviada ✓" para no mandarla dos veces.
// Panel /mi-equipo (views/equipo-panel.ejs): el plantel y las solicitudes llegan del servidor;
//  3) Aceptar/Rechazar desactivan los botones de esa solicitud al enviarse (evita doble envío).
//  4) Desafíos: "Desafiar a otro equipo" abre la lista de rivales (solo los que juegan alguna de nuestras
//     modalidades) y el filtro deja los de una modalidad; "Enviar Desafío" abre un modal (modalidad del
//     partido entre las comunes, y fecha, hora y mensaje opcionales) y lo envía con fetch, sin recargar.
//  5) Alineaciones: una por tipo de fútbol del equipo, en pestañas que cambian sin recargar. El capitán
//     marca los tipos de fútbol que juega (pide confirmación si quita uno: se borra su alineación).
//     En cada alineación (solo el capitán): un puesto por jugador de la modalidad según la formación y el banco
//     de suplentes. Las cartas se arrastran a un puesto o al banco (o se tocan y luego se toca el destino;
//     con el teclado, Enter en la carta y Enter en el destino); en un puesto ocupado se intercambian.
//     Cambiar la formación mueve los puestos sin recargar. Cada cambio se guarda solo y, si falla, se deshace.
//     La "X" de cada carta saca al jugador (confirmarAccion + fetch): la carta desaparece sin recargar.
//  6) Escudo (solo el capitán): la imagen se reduce a LADO_ESCUDO px en el navegador y se sube.
//  7) "Invitar jugador +" (solo el capitán): abre el modal con todos los jugadores (con buscador, ver 1);
//     "Invitar" se envía con fetch y el botón queda gris como "Invitación Enviada".

// (dashboard.js, cargado en la misma página, ya declara DURACION_AVISO_MS)
const DURACION_EXITO_MS = 3200;

// Alineación: cuántos px hay que mover el puntero para que un toque se vuelva arrastre
const UMBRAL_ARRASTRE = 6;

// Escudo: cabe entero (como "object-fit: contain") en un cuadrado de este lado, en PNG (con transparencia)
const LADO_ESCUDO = 256;

// Texto del botón según la respuesta del servidor
const TEXTOS_BOTON = {
  enviada: 'Solicitud enviada ✓',
  pendiente: 'Solicitud enviada ✓',
  miembro: 'Ya eres parte',
  inexistente: 'No disponible',
  invitado: 'Te invitaron ✓', // CORRECCIÓN: regla 6 (el equipo ya lo invitó: acepta desde el panel)
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

  // Filtro por modalidad: deja los rivales que la juegan (y el modal propone esa modalidad)
  let filtroModalidad = '';
  const filtroRivales = document.querySelector('[data-filtro-rivales]');
  if (filtroRivales) {
    filtroRivales.hidden = false; // sin JS no se muestra: no haría nada
    const rivales = [...document.querySelectorAll('.eq-rivales [data-modalidades]')];
    const totalRivales = document.querySelector('[data-total-rivales]');
    const sinRivales = document.querySelector('[data-sin-rivales]');
    filtroRivales.addEventListener('click', (evento) => {
      const opcion = evento.target.closest('[data-filtro-modalidad]');
      if (!opcion) return;
      filtroModalidad = opcion.dataset.filtroModalidad;
      filtroRivales.querySelectorAll('[data-filtro-modalidad]').forEach((boton) => {
        boton.classList.toggle('eq-filtro-modalidad__opcion--activa', boton === opcion);
        boton.setAttribute('aria-pressed', String(boton === opcion));
      });
      let visibles = 0;
      rivales.forEach((rival) => {
        const juega = !filtroModalidad || rival.dataset.modalidades.split(' ').includes(filtroModalidad);
        rival.hidden = !juega;
        if (juega) visibles += 1;
      });
      totalRivales.textContent = `${visibles} ${visibles === 1 ? 'equipo disponible' : 'equipos disponibles'}`;
      sinRivales.hidden = visibles > 0;
    });
  }

  if (modal) {
    const formModal = modal.querySelector('[data-form-desafio]');
    const campoModalidad = modal.querySelector('[data-campo-modalidad]');
    const selectModalidad = modal.querySelector('[data-modal-modalidad]');
    const errorModal = modal.querySelector('[data-modal-error]');
    const botonEnviar = formModal.querySelector('button[type="submit"]');
    let formularioRival = null; // el formulario del rival elegido (su action dice a quién desafiar)

    function abrirModal(formulario) {
      formularioRival = formulario;
      modal.querySelector('[data-modal-rival]').textContent = formulario.dataset.rival;
      formModal.reset();
      // Modalidades que juegan los dos: la del filtro si es una de ellas; con una sola, no hay nada que elegir
      const comunes = (formulario.dataset.comunes || '').split(',').filter(Boolean);
      selectModalidad.replaceChildren(...comunes.map((n) => new Option(`Fútbol ${n}`, n)));
      selectModalidad.value = comunes.includes(filtroModalidad) ? filtroModalidad : comunes[0] || '';
      campoModalidad.hidden = comunes.length <= 1;
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

  // ---------- 5) Alineaciones ----------
  // Pestañas: una por tipo de fútbol. Son enlaces (?modalidad=): aquí cambian sin recargar y la URL
  // queda apuntando a la abierta (al recargar o volver se abre la misma).
  const pestanas = [...document.querySelectorAll('[data-pestana-alineacion]')];
  pestanas.forEach((pestana) => {
    pestana.addEventListener('click', (evento) => {
      evento.preventDefault();
      const modalidad = pestana.dataset.pestanaAlineacion;
      pestanas.forEach((otra) => {
        otra.classList.toggle('sm-pestanas__item--activa', otra === pestana);
        otra.setAttribute('aria-selected', String(otra === pestana));
      });
      document.querySelectorAll('[data-panel-alineacion]').forEach((panel) => {
        panel.hidden = panel.dataset.panelAlineacion !== modalidad;
      });
      history.replaceState(null, '', pestana.href);
    });
  });

  // Tipos de fútbol del equipo: al menos uno; si se quita alguno, se confirma (se borra su alineación)
  const formModalidades = document.querySelector('[data-form-modalidades]');
  formModalidades?.addEventListener('submit', async (evento) => {
    const casillas = [...formModalidades.querySelectorAll('input[name="modalidad"]')];
    if (!casillas.some((casilla) => casilla.checked)) {
      evento.preventDefault();
      mostrarAviso('Tu equipo debe jugar al menos un tipo de fútbol.');
      return;
    }
    const quitados = casillas.filter((casilla) => casilla.dataset.marcada === 'true' && !casilla.checked).map((c) => c.dataset.nombre);
    if (quitados.length === 0 || formModalidades.dataset.confirmado) return;
    evento.preventDefault();
    const confirmado = await confirmarAccion({
      titulo: quitados.length === 1 ? `Dejar de jugar ${quitados[0]}` : 'Quitar tipos de fútbol',
      texto: `Se borrará la alineación de ${quitados.join(' y ')} y ya no podrás desafiar `
        + `${quitados.length === 1 ? 'en esa modalidad' : 'en esas modalidades'}.`,
      confirmar: 'Guardar tipos',
    });
    if (confirmado) {
      formModalidades.dataset.confirmado = 'true';
      formModalidades.requestSubmit();
    }
  });

  // Cada alineación lleva sus propios puestos, banco y guardado; al sacar a un jugador se actualizan todas
  const actualizadores = [];
  const plantelCambio = () => actualizadores.forEach((actualizar) => actualizar());

  document.querySelectorAll('[data-alineacion]').forEach((alineacion) => {
    const puestos = [...alineacion.querySelectorAll('[data-puesto]')];
    const banco = alineacion.querySelector('[data-banco]');
    const bancoVacio = alineacion.querySelector('[data-banco-vacio]');
    const botonAlBanco = alineacion.querySelector('[data-al-banco]');
    const selectFormacion = alineacion.querySelector('[data-select-formacion]');
    const puestosPorFormacion = JSON.parse(alineacion.dataset.formaciones || '{}');
    let formacion = selectFormacion ? selectFormacion.value : '';
    let elegida = null;     // carta tocada que espera su destino
    let arrastre = null;    // { ficha, inicioX, inicioY, fantasma, desfaseX, desfaseY, destino }
    let ignorarClic = false; // el clic que llega justo después de soltar un arrastre
    let cola = Promise.resolve(); // los guardados van de a uno, en orden

    const fichaDe = (contenedor) => contenedor.querySelector(':scope > [data-ficha]');

    /** Formación y titulares (id por puesto, '' si está libre), tal como los recibe el servidor. */
    function estado() {
      return { formacion, titulares: puestos.map((puesto) => fichaDe(puesto)?.dataset.jugador || '') };
    }

    function actualizarContadores() {
      const titulares = puestos.filter(fichaDe).length;
      const suplentes = banco.querySelectorAll(':scope > [data-ficha]').length;
      alineacion.querySelector('[data-total-titulares]').textContent = titulares;
      alineacion.querySelector('[data-titulares]').classList.toggle('eq-alineacion__titulares--completa', titulares === puestos.length);
      alineacion.querySelector('[data-total-suplentes]').textContent = suplentes;
      bancoVacio.hidden = suplentes > 0;
    }

    /** Lleva cada puesto al lugar y la sigla que tiene en la formación. */
    function ubicarPuestos(nueva) {
      (puestosPorFormacion[nueva] || []).forEach((datos, i) => {
        const puesto = puestos[i];
        if (!puesto) return;
        puesto.style.setProperty('--x', datos.x);
        puesto.style.setProperty('--y', datos.y);
        puesto.dataset.linea = datos.linea;
        puesto.querySelector('[data-sigla]').textContent = datos.sigla;
      });
    }

    /** Deja la cancha como estaba (si el servidor no pudo guardar). */
    function aplicar(anterior) {
      formacion = anterior.formacion;
      if (selectFormacion) selectFormacion.value = formacion;
      ubicarPuestos(formacion);
      const fichas = new Map([...alineacion.querySelectorAll('[data-ficha]')].map((ficha) => [ficha.dataset.jugador, ficha]));
      anterior.titulares.forEach((id, i) => {
        if (id && fichas.has(id)) {
          puestos[i].append(fichas.get(id));
          fichas.delete(id);
        }
      });
      fichas.forEach((ficha) => banco.append(ficha));
      actualizarContadores();
    }

    function guardar(anterior) {
      actualizarContadores();
      const actual = estado();
      cola = cola.then(async () => {
        try {
          const respuesta = await fetch(alineacion.dataset.url, {
            method: 'POST',
            headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
              modalidad: alineacion.dataset.modalidad,
              formacion: actual.formacion,
              titulares: actual.titulares.join(','),
            }),
          });
          const datos = await respuesta.json().catch(() => ({}));
          if (!respuesta.ok || !datos.ok) throw new Error(datos.mensaje || 'No se pudo guardar la alineación.');
        } catch (err) {
          console.error('No se pudo guardar la alineación:', err);
          aplicar(anterior);
          mostrarAviso(err.message || 'No se pudo guardar la alineación.');
        }
      });
    }

    /** Pone la carta en un puesto (si estaba ocupado, el otro va a donde estaba ésta) o en el banco. */
    function mover(ficha, destino) {
      const origen = ficha.parentElement;
      if (!destino || destino === origen) return;
      const anterior = estado();
      const ocupante = destino === banco ? null : fichaDe(destino);
      if (ocupante) origen.append(ocupante);
      destino.append(ficha);
      guardar(anterior);
    }

    function elegir(ficha) {
      if (elegida) {
        elegida.classList.remove('eq-ficha--elegida');
        elegida.setAttribute('aria-pressed', 'false');
      }
      elegida = ficha;
      if (ficha) {
        ficha.classList.add('eq-ficha--elegida');
        ficha.setAttribute('aria-pressed', 'true');
      }
      alineacion.classList.toggle('eq-alineacion--eligiendo', Boolean(ficha));
      // "Mandar al banco" solo sirve para una carta que está en la cancha
      if (botonAlBanco) botonAlBanco.hidden = !ficha || ficha.parentElement === banco;
    }

    /** Puesto o banco bajo un punto de la pantalla (soltar sobre una carta = su puesto o el banco). */
    function destinoEn(x, y) {
      const elemento = document.elementFromPoint(x, y);
      if (!elemento || !alineacion.contains(elemento)) return null;
      return elemento.closest('[data-puesto]') || elemento.closest('[data-banco]');
    }

    function marcarDestino(destino) {
      if (arrastre.destino === destino) return;
      arrastre.destino?.classList.remove('eq-destino');
      arrastre.destino = destino;
      destino?.classList.add('eq-destino');
    }

    // Tocar: elegir una carta y después su destino (otra carta, un puesto libre o el banco)
    alineacion.addEventListener('click', (evento) => {
      if (ignorarClic) {
        ignorarClic = false;
        return;
      }
      if (evento.target.closest('form, select, [data-al-banco]')) return;
      const ficha = evento.target.closest('[data-ficha]');
      const destino = evento.target.closest('[data-puesto]') || evento.target.closest('[data-banco]');
      if (!elegida) {
        if (ficha) elegir(ficha);
        return;
      }
      if (ficha === elegida) {
        elegir(null);
        return;
      }
      // Otra carta del banco: entra al puesto de la elegida (intercambio) o, si las dos están en el banco, pasa a ser la elegida
      if (ficha && ficha.parentElement === banco) {
        if (elegida.parentElement === banco) elegir(ficha);
        else {
          mover(ficha, elegida.parentElement);
          elegir(null);
        }
        return;
      }
      if (destino) {
        mover(elegida, destino);
        elegir(null);
      }
    });

    alineacion.addEventListener('keydown', (evento) => {
      const ficha = evento.target.closest('[data-ficha]');
      if (ficha && (evento.key === 'Enter' || evento.key === ' ')) {
        evento.preventDefault();
        ficha.click();
      }
    });
    document.addEventListener('keydown', (evento) => {
      if (evento.key === 'Escape' && elegida) elegir(null);
    });

    botonAlBanco?.addEventListener('click', () => {
      if (!elegida) return;
      const ficha = elegida;
      mover(ficha, banco);
      elegir(null);
      ficha.focus();
    });

    // Arrastrar: una copia de la carta sigue al puntero y se suelta sobre un puesto o el banco
    alineacion.addEventListener('pointerdown', (evento) => {
      const ficha = evento.target.closest('[data-ficha]');
      if (!ficha || evento.button !== 0 || evento.target.closest('form')) return;
      arrastre = { ficha, inicioX: evento.clientX, inicioY: evento.clientY, fantasma: null, destino: null };
    });

    document.addEventListener('pointermove', (evento) => {
      if (!arrastre) return;
      const { ficha } = arrastre;
      if (!arrastre.fantasma) {
        if (Math.hypot(evento.clientX - arrastre.inicioX, evento.clientY - arrastre.inicioY) < UMBRAL_ARRASTRE) return;
        const rect = ficha.getBoundingClientRect();
        const fantasma = ficha.cloneNode(true);
        fantasma.removeAttribute('data-ficha');
        fantasma.classList.remove('eq-ficha--elegida');
        fantasma.classList.add('eq-ficha--fantasma');
        fantasma.style.width = `${rect.width}px`;
        document.body.append(fantasma);
        Object.assign(arrastre, { fantasma, desfaseX: arrastre.inicioX - rect.left, desfaseY: arrastre.inicioY - rect.top });
        ficha.classList.add('eq-ficha--origen');
        elegir(null);
        alineacion.classList.add('eq-alineacion--eligiendo');
      }
      arrastre.fantasma.style.transform = `translate(${evento.clientX - arrastre.desfaseX}px, ${evento.clientY - arrastre.desfaseY}px)`;
      const destino = destinoEn(evento.clientX, evento.clientY);
      marcarDestino(destino === ficha.parentElement ? null : destino);
    });

    function soltar(evento) {
      if (!arrastre) return;
      const { ficha, fantasma, destino } = arrastre;
      if (fantasma) {
        marcarDestino(null);
        fantasma.remove();
        ficha.classList.remove('eq-ficha--origen');
        alineacion.classList.remove('eq-alineacion--eligiendo');
        // El clic que sigue al soltar no debe elegir la carta (si no llega, se olvida enseguida)
        ignorarClic = evento.type === 'pointerup';
        setTimeout(() => { ignorarClic = false; });
        if (destino && evento.type === 'pointerup') mover(ficha, destino);
      }
      arrastre = null;
    }
    document.addEventListener('pointerup', soltar);
    document.addEventListener('pointercancel', soltar);

    // Formación: los puestos se deslizan a su nuevo lugar (cada titular sigue en su número de puesto)
    selectFormacion?.addEventListener('change', () => {
      const anterior = estado();
      formacion = selectFormacion.value;
      ubicarPuestos(formacion);
      guardar(anterior);
    });

    actualizadores.push(actualizarContadores);
  });

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
      const ficha = formulario.closest('.eq-ficha');
      boton.disabled = true;
      ficha.classList.add('eq-ficha--saliendo'); // cargando: la carta se atenúa

      try {
        const respuesta = await fetch(formulario.action, { method: 'POST', headers: { Accept: 'application/json' } });
        const datos = await respuesta.json().catch(() => ({}));
        if (!respuesta.ok || !datos.ok) throw new Error(datos.mensaje || 'No se pudo sacar al jugador. Inténtalo de nuevo.');

        // El jugador sale de todas las alineaciones (una carta por tipo de fútbol)
        document.querySelectorAll(`.eq-ficha[data-jugador="${ficha.dataset.jugador}"]`).forEach((carta) => carta.remove());
        plantelCambio();
        const total = document.querySelector('[data-total-plantel]');
        const quedan = new Set([...document.querySelectorAll('.eq-ficha')].map((carta) => carta.dataset.jugador)).size;
        if (total) total.textContent = `${quedan} ${quedan === 1 ? 'Jugador' : 'Jugadores'}`;
        mostrarAviso(datos.mensaje);
      } catch (err) {
        console.error('No se pudo sacar al jugador:', err);
        boton.disabled = false;
        ficha.classList.remove('eq-ficha--saliendo');
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
