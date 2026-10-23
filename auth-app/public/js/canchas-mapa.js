// public/js/canchas-mapa.js
// DE-003 · Mapa de canchas: un marcador por recinto según su latitud y longitud (Leaflet + OpenStreetMap, oscurecido con CSS).
// Los datos los deja el servidor en <script type="application/json" id="datos-mapa"> (canchasController.recintosParaMapa).
// El contenido de cada globo se arma con textContent (nunca con HTML del usuario).
// Los pines se agrupan con leaflet.markercluster cuando la página lo carga (lista de canchas); la ficha no lo necesita.

const CENTRO_SANTIAGO = [-33.45, -70.66];
const ZOOM_INICIAL = 12;
const ZOOM_MINIMO_ENCUADRE = 11; // si encuadrar todo aleja más que esto, se centra en Santiago

document.addEventListener('DOMContentLoaded', () => {
  const contenedor = document.getElementById('mapa-canchas');
  const datos = document.getElementById('datos-mapa');
  if (!contenedor || !datos || typeof L === 'undefined') return;

  const recintos = JSON.parse(datos.textContent);
  const pesos = new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 });

  const mapa = L.map(contenedor).setView(CENTRO_SANTIAGO, ZOOM_INICIAL);
  // Tiles estándar de OSM; el modo oscuro lo pone un filtro en .leaflet-tile-pane (modulos.css)
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; colaboradores de OpenStreetMap',
  }).addTo(mapa);

  // Pin verde neón (el brillo lo pone .sm-pin en modulos.css)
  const pin = L.divIcon({
    className: 'sm-pin',
    html: '<svg viewBox="0 0 24 32" width="28" height="36" aria-hidden="true"><path d="M12 1C6 1 1.5 5.5 1.5 11.3 1.5 19 12 31 12 31s10.5-12 10.5-19.7C22.5 5.5 18 1 12 1z"/><circle cx="12" cy="11.5" r="4"/></svg>',
    iconSize: [28, 36],
    iconAnchor: [14, 35],
    popupAnchor: [0, -32],
  });

  /** Elemento con clase y texto (siempre textContent). */
  function crear(etiqueta, clase, texto) {
    const elemento = document.createElement(etiqueta);
    if (clase) elemento.className = clase;
    if (texto) elemento.textContent = texto;
    return elemento;
  }

  /**
   * Contenido del globo: nombre, dirección y una fila de arriendo por cancha.
   * Con precio: el precio por hora en grande; sin precio: botón "Consultar disponibilidad". Todo lleva a la ficha.
   */
  function globo(recinto) {
    const caja = crear('div', 'sm-globo');
    caja.append(crear('strong', 'sm-globo__titulo', recinto.nombre), crear('p', 'sm-globo__direccion', `${recinto.direccion}, ${recinto.comuna}`));
    recinto.canchas.forEach((cancha) => {
      const fila = crear('a', 'sm-globo__cancha');
      fila.href = `/canchas/${cancha.id}`;
      const datos = crear('span', 'sm-globo__datos');
      datos.append(crear('span', 'sm-globo__nombre', cancha.nombre), crear('span', 'sm-globo__modalidad', cancha.modalidad));
      const arriendo = cancha.precio > 0
        ? crear('span', 'sm-globo__precio', pesos.format(cancha.precio))
        : crear('span', 'sm-globo__consultar', 'Consultar disponibilidad');
      if (cancha.precio > 0) arriendo.append(crear('small', '', '/hora'));
      fila.append(datos, arriendo);
      caja.append(fila);
    });
    return caja;
  }

  /** Ícono de un grupo: círculo verde translúcido con la cantidad de recintos. */
  function iconoGrupo(grupo) {
    const total = grupo.getChildCount();
    const tamano = total < 10 ? 'chico' : total < 100 ? 'medio' : 'grande';
    const lado = { chico: 36, medio: 44, grande: 52 }[tamano];
    return L.divIcon({
      className: `sm-grupo sm-grupo--${tamano}`,
      html: `<span>${total}</span>`,
      iconSize: [lado, lado],
    });
  }

  // Al hacer clic en un grupo se acerca a su zona (zoomToBoundsOnClick); en el zoom máximo se abre en abanico
  const capa = typeof L.markerClusterGroup === 'function'
    ? L.markerClusterGroup({ iconCreateFunction: iconoGrupo, showCoverageOnHover: false, maxClusterRadius: 60, chunkedLoading: true })
    : L.featureGroup();

  // El globo se arma recién al abrirlo (no 1.000+ globos al cargar)
  const marcadores = recintos.map((recinto) => L.marker([recinto.latitud, recinto.longitud], { icon: pin }).bindPopup(() => globo(recinto)));
  if (capa.addLayers) capa.addLayers(marcadores); // de una vez: mucho más rápido que uno por uno
  else marcadores.forEach((marcador) => capa.addLayer(marcador));
  capa.addTo(mapa);

  // Encuadra los recintos encontrados (p. ej. al filtrar por comuna); si son de toda la región, centra en Santiago
  if (recintos.length > 0) {
    mapa.fitBounds(capa.getBounds(), { padding: [40, 40], maxZoom: 15 });
    if (mapa.getZoom() < ZOOM_MINIMO_ENCUADRE) mapa.setView(CENTRO_SANTIAGO, ZOOM_INICIAL);
  }

  // ---------- Expandir mapa (ventana grande sobre la página) ----------
  const ICONO_EXPANDIR = '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>';
  const ICONO_CERRAR = '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>';
  // El mapa expandido se MUEVE a una capa hija directa de <body>: así ningún padre con transform, filter u
  // overflow (paneles de vidrio, animaciones .revelar) puede recortarlo ni romper su position: fixed.
  const modal = document.createElement('div');
  modal.className = 'sm-mapa-modal';
  modal.hidden = true;
  document.body.append(modal);
  const hueco = document.createElement('div'); // ocupa el lugar del mapa para que la página no salte
  let botonExpandir = null;
  let expandido = false;

  // Leaflet no se entera solo de los cambios de tamaño (quedan cuadros grises): se le avisa cada vez que cambia
  new ResizeObserver(() => mapa.invalidateSize()).observe(contenedor);

  function expandir(valor) {
    expandido = valor;
    if (expandido) {
      hueco.style.height = `${contenedor.offsetHeight}px`;
      contenedor.replaceWith(hueco);
      modal.append(contenedor);
    } else {
      hueco.replaceWith(contenedor);
    }
    contenedor.classList.toggle('sm-mapa--expandido', expandido);
    modal.hidden = !expandido;
    document.body.classList.toggle('sm-sin-scroll', expandido);
    botonExpandir.innerHTML = expandido ? ICONO_CERRAR : ICONO_EXPANDIR;
    const texto = expandido ? 'Cerrar mapa grande' : 'Expandir mapa';
    botonExpandir.title = texto;
    botonExpandir.setAttribute('aria-label', texto);
    mapa.invalidateSize();
  }

  const ControlExpandir = L.Control.extend({
    options: { position: 'topright' },
    onAdd() {
      const barra = L.DomUtil.create('div', 'leaflet-bar');
      botonExpandir = L.DomUtil.create('a', 'sm-expandir', barra);
      botonExpandir.href = '#';
      botonExpandir.setAttribute('role', 'button');
      botonExpandir.title = 'Expandir mapa';
      botonExpandir.setAttribute('aria-label', 'Expandir mapa');
      botonExpandir.innerHTML = ICONO_EXPANDIR;
      L.DomEvent.disableClickPropagation(barra);
      L.DomEvent.on(botonExpandir, 'click', (evento) => {
        L.DomEvent.preventDefault(evento);
        expandir(!expandido);
      });
      return barra;
    },
  });
  mapa.addControl(new ControlExpandir());
  modal.addEventListener('click', (evento) => {
    if (evento.target === modal) expandir(false); // clic en el fondo, no dentro del mapa
  });
  document.addEventListener('keydown', (evento) => {
    if (evento.key === 'Escape' && expandido) expandir(false);
  });

  // ---------- Mi ubicación (navigator.geolocation) ----------
  if (!('geolocation' in navigator)) return;

  const puntoUsuario = L.divIcon({ className: 'sm-yo', html: '<span></span>', iconSize: [18, 18], iconAnchor: [9, 9] });
  let marcadorUsuario = null;
  let boton = null;

  /** Mensaje breve dentro del mapa (en vez de alert). */
  function avisar(texto) {
    const aviso = document.createElement('div');
    aviso.className = 'sm-mapa__aviso';
    aviso.setAttribute('role', 'status');
    aviso.textContent = texto;
    contenedor.append(aviso);
    setTimeout(() => aviso.remove(), 4000);
  }

  /** Pide la ubicación, centra el mapa y marca al usuario. silencioso = sin avisos (carga automática). */
  function ubicar(silencioso) {
    boton.classList.add('sm-ubicar--cargando');
    boton.setAttribute('aria-busy', 'true');
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const posicion = [coords.latitude, coords.longitude];
        if (marcadorUsuario) marcadorUsuario.setLatLng(posicion);
        else marcadorUsuario = L.marker(posicion, { icon: puntoUsuario, zIndexOffset: 1000, keyboard: false, title: 'Tu ubicación' }).addTo(mapa);
        mapa.flyTo(posicion, 14);
        boton.classList.remove('sm-ubicar--cargando');
        boton.removeAttribute('aria-busy');
      },
      (error) => {
        boton.classList.remove('sm-ubicar--cargando');
        boton.removeAttribute('aria-busy');
        if (silencioso) return;
        avisar(error.code === error.PERMISSION_DENIED
          ? 'No diste permiso para usar tu ubicación. Puedes activarlo en el candado de la barra de direcciones.'
          : 'No pudimos obtener tu ubicación. Inténtalo de nuevo.');
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  }

  // Botón bajo los controles de zoom
  const ControlUbicar = L.Control.extend({
    options: { position: 'topleft' },
    onAdd() {
      const barra = L.DomUtil.create('div', 'leaflet-bar');
      boton = L.DomUtil.create('a', 'sm-ubicar', barra);
      boton.href = '#';
      boton.title = 'Ir a mi ubicación';
      boton.setAttribute('role', 'button');
      boton.setAttribute('aria-label', 'Ir a mi ubicación');
      boton.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2.5" fill="currentColor"/><path d="M12 1v4M12 19v4M1 12h4M19 12h4"/></svg>';
      L.DomEvent.disableClickPropagation(barra);
      L.DomEvent.on(boton, 'click', (evento) => {
        L.DomEvent.preventDefault(evento);
        ubicar(false);
      });
      return barra;
    },
  });
  mapa.addControl(new ControlUbicar());

  // En la lista de canchas, centra solo si el permiso ya estaba concedido (nunca pide permiso al cargar)
  if (!contenedor.classList.contains('sm-mapa--ficha') && navigator.permissions) {
    navigator.permissions.query({ name: 'geolocation' })
      .then((permiso) => { if (permiso.state === 'granted') ubicar(true); })
      .catch(() => {});
  }
});
