// public/js/equipo-ubicacion.js
// EQ-UB · "Ubicación del equipo" en /mi-equipo (solo el capitán; views/equipo-panel.ejs).
// El mapa y el pin los arma mapa-ubicacion.js; aquí: "Guardar" lo manda con fetch a
// POST /equipos/:id/ubicacion y "Quitar" la borra. El servidor la redondea a ~100 m.

document.addEventListener('DOMContentLoaded', () => {
  const seccion = document.querySelector('[data-ubicacion]');
  if (!seccion || typeof L === 'undefined' || typeof crearMapaUbicacion !== 'function') return;

  const contenedor = seccion.querySelector('[data-mapa-ubicacion]');
  const resumen = seccion.querySelector('[data-ubicacion-resumen]');
  const estado = seccion.querySelector('[data-ubicacion-estado]');
  const botonMiUbicacion = seccion.querySelector('[data-usar-mi-ubicacion]');
  const botonGuardar = seccion.querySelector('[data-guardar-ubicacion]');
  const botonQuitar = seccion.querySelector('[data-quitar-ubicacion]');
  const url = `/equipos/${seccion.dataset.equipo}/ubicacion`;
  const guardada = seccion.dataset.lat ? [Number(seccion.dataset.lat), Number(seccion.dataset.lng)] : null;
  let marcador = null;

  function avisar(texto, error = false) {
    estado.textContent = texto;
    estado.classList.toggle('eq-ubicacion__estado--error', error);
  }

  // El mapa se crea al abrir la sección (dentro de un <details> cerrado Leaflet mide 0 px)
  function abrir() {
    if (marcador) return;
    marcador = crearMapaUbicacion(contenedor, {
      inicial: guardada,
      alCambiar: () => {
        botonGuardar.disabled = false;
        avisar('Pin movido: guarda para usar esta ubicación.');
      },
    });
  }

  if (seccion.open) abrir();
  seccion.addEventListener('toggle', () => { if (seccion.open) abrir(); });

  botonMiUbicacion.addEventListener('click', async () => {
    botonMiUbicacion.disabled = true;
    avisar('Buscando tu ubicación...');
    try {
      await marcador.usarMiUbicacion();
    } catch (err) {
      avisar(err.message, true);
    } finally {
      botonMiUbicacion.disabled = false;
    }
  });

  async function enviar(datos) {
    const respuesta = await fetch(url, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(datos),
    });
    const json = await respuesta.json().catch(() => ({}));
    if (!respuesta.ok || !json.ok) throw new Error(json.mensaje || 'No se pudo guardar la ubicación. Inténtalo de nuevo.');
    return json.mensaje;
  }

  botonGuardar.addEventListener('click', async () => {
    const posicion = marcador && marcador.posicion();
    if (!posicion) return;
    botonGuardar.disabled = true;
    try {
      avisar(await enviar({ lat: posicion.lat.toFixed(5), lng: posicion.lng.toFixed(5) }));
      resumen.textContent = 'Marcada';
      botonQuitar.hidden = false;
    } catch (err) {
      botonGuardar.disabled = false;
      avisar(err.message, true);
    }
  });

  botonQuitar.addEventListener('click', async () => {
    botonQuitar.disabled = true;
    try {
      avisar(await enviar({ quitar: '1' }));
      marcador.quitar();
      resumen.textContent = 'Sin marcar';
      botonQuitar.hidden = true;
      botonGuardar.disabled = true;
    } catch (err) {
      avisar(err.message, true);
    } finally {
      botonQuitar.disabled = false;
    }
  });
});
