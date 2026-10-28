// public/js/mapa-ubicacion.js
// EQ-UB · Mapa para marcar dónde juega un equipo (Leaflet + OpenStreetMap, oscurecido con .sm-mapa en modulos.css).
// Lo usan equipo-ubicacion.js (panel /mi-equipo) y crear-equipo.js (paso 3 del wizard).
// Tocar el mapa pone el pin (se puede arrastrar); alCambiar(latlng) avisa cada vez que se mueve.
//   const marcador = crearMapaUbicacion(contenedor, { inicial: [lat, lng] | null, alCambiar });
//   marcador.posicion() → L.LatLng | null · marcador.quitar() · await marcador.usarMiUbicacion()

const MAPA_CENTRO_SANTIAGO = [-33.45, -70.66];
const MAPA_ZOOM_SIN_UBICACION = 11;
const MAPA_ZOOM_CON_UBICACION = 15;

function crearMapaUbicacion(contenedor, { inicial = null, alCambiar = () => {} } = {}) {
  const icono = L.divIcon({
    className: 'sm-pin',
    html: '<svg viewBox="0 0 24 32" width="28" height="36" aria-hidden="true"><path d="M12 1C6 1 1.5 5.5 1.5 11.3 1.5 19 12 31 12 31s10.5-12 10.5-19.7C22.5 5.5 18 1 12 1z"/><circle cx="12" cy="11.5" r="4"/></svg>',
    iconSize: [28, 36],
    iconAnchor: [14, 35],
  });

  const mapa = L.map(contenedor).setView(inicial || MAPA_CENTRO_SANTIAGO, inicial ? MAPA_ZOOM_CON_UBICACION : MAPA_ZOOM_SIN_UBICACION);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; colaboradores de OpenStreetMap',
  }).addTo(mapa);

  let pin = null;

  function crearPin(latlng) {
    pin = L.marker(latlng, { icon: icono, draggable: true, keyboard: false }).addTo(mapa);
    pin.on('dragend', () => alCambiar(pin.getLatLng()));
  }

  function poner(latlng) {
    if (pin) pin.setLatLng(latlng);
    else crearPin(latlng);
    alCambiar(pin.getLatLng());
  }

  if (inicial) crearPin(inicial);
  mapa.on('click', (evento) => poner(evento.latlng));

  // Si el contenedor cambia de tamaño (estilos que terminan de cargar, paso que se muestra, giro
  // del celular), Leaflet debe volver a medirlo: si no, el toque cae en otro punto del mapa.
  if ('ResizeObserver' in window) new ResizeObserver(() => mapa.invalidateSize()).observe(contenedor);

  return {
    posicion: () => (pin ? pin.getLatLng() : null),
    quitar() {
      if (pin) pin.remove();
      pin = null;
    },
    /** Centra y pone el pin donde está el navegador; rechaza si no hay permiso o no se puede. */
    usarMiUbicacion() {
      return new Promise((resolver, rechazar) => {
        if (!navigator.geolocation) {
          rechazar(new Error('Tu navegador no permite obtener la ubicación: toca el mapa para marcarla.'));
          return;
        }
        navigator.geolocation.getCurrentPosition((posicion) => {
          const latlng = L.latLng(posicion.coords.latitude, posicion.coords.longitude);
          mapa.setView(latlng, MAPA_ZOOM_CON_UBICACION);
          poner(latlng);
          resolver(latlng);
        }, () => {
          rechazar(new Error('No pudimos obtener tu ubicación (revisa el permiso del navegador). Toca el mapa para marcarla.'));
        }, { enableHighAccuracy: false, timeout: 10000 });
      });
    },
  };
}
