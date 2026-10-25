const CENTRO_SANTIAGO = [-33.45, -70.66];
const ZOOM_INICIAL = 11;

document.addEventListener('DOMContentLoaded', () => {
  const contenedor = document.getElementById('mapa-canchas');
  const datos = document.getElementById('datos-mapa');
  if (!contenedor || !datos || typeof L === 'undefined') return;

  const recintos = JSON.parse(datos.textContent);
  const pesos = new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 });

  const mapa = L.map(contenedor).setView(CENTRO_SANTIAGO, ZOOM_INICIAL);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; colaboradores de OpenStreetMap',
  }).addTo(mapa);

  function globo(recinto) {
    const caja = document.createElement('div');
    const titulo = document.createElement('strong');
    titulo.textContent = recinto.nombre;
    const direccion = document.createElement('p');
    direccion.textContent = `${recinto.direccion}, ${recinto.comuna}`;
    const lista = document.createElement('ul');
    recinto.canchas.forEach((cancha) => {
      const item = document.createElement('li');
      const enlace = document.createElement('a');
      enlace.href = `/canchas/${cancha.id}`;
      enlace.textContent = `${cancha.nombre} · ${cancha.modalidad} · ${pesos.format(cancha.precio)}/h`;
      item.append(enlace);
      lista.append(item);
    });
    caja.append(titulo, direccion, lista);
    return caja;
  }

  const marcadores = recintos.map((recinto) => L.marker([recinto.latitud, recinto.longitud]).bindPopup(globo(recinto)).addTo(mapa));

  if (marcadores.length > 0) {
    mapa.fitBounds(L.featureGroup(marcadores).getBounds(), { padding: [40, 40], maxZoom: 15 });
  }
});
