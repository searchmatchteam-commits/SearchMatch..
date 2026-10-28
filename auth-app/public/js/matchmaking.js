// public/js/matchmaking.js
// Pantalla "Buscar partido" (views/matchmaking.ejs). Los rivales ya llegan del servidor (JSON);
// la búsqueda es una cola simulada:
//  1) Buscando: cronómetro que sube, anillo girando y un texto que cambia cada CAMBIO_TEXTO_MS.
//     Tras DURACION_BUSQUEDA_MS (al azar dentro del rango) revela el siguiente rival.
//  2) Encontrado: flash + tarjeta VS que entra con rebote (clases is-* en matchmaking.css).
//     Primero los más cercanos (EQ-UB: distanciaKm la calcula el servidor; sin ella, al final);
//     a igual distancia, misma comuna y nivel; entre iguales, al azar.
//  3) "Enviar desafío" → POST /mi-equipo/desafios/:id con fetch (JSON); "Buscar otro rival" vuelve a 1.
//     Sin rivales (o todos ya desafiados) muestra la vista "vacio". Escape sale de la pantalla.

const CAMBIO_TEXTO_MS = 2000;
const DURACION_BUSQUEDA_MS = [4000, 6500]; // primera búsqueda
const DURACION_OTRO_MS = [2200, 3600]; // "Buscar otro rival"
const DURACION_FLASH_MS = 700;

(function () {
  const raiz = document.querySelector('[data-matchmaking]');
  if (!raiz) return;

  const idEquipo = raiz.dataset.equipo;
  const zonaPropia = raiz.dataset.zona;
  const nivelPropio = raiz.dataset.nivel;
  let rivales = [];
  try {
    rivales = JSON.parse(raiz.querySelector('[data-rivales]').textContent) || [];
  } catch (err) {
    rivales = [];
  }

  const vistas = {
    buscando: raiz.querySelector('[data-vista="buscando"]'),
    encontrado: raiz.querySelector('[data-vista="encontrado"]'),
    vacio: raiz.querySelector('[data-vista="vacio"]'),
  };
  const reloj = raiz.querySelector('[data-reloj]');
  const texto = raiz.querySelector('[data-texto]');
  const flash = raiz.querySelector('.mm__flash');
  const form = raiz.querySelector('[data-form-desafio]');
  const botonDesafiar = raiz.querySelector('[data-desafiar]');
  const textoDesafiar = raiz.querySelector('[data-desafiar-texto]');
  const resultado = raiz.querySelector('[data-resultado]');
  const verDesafios = raiz.querySelector('[data-ver-desafios]');
  const botonOtro = raiz.querySelector('[data-otro]');

  const textos = [
    'Buscando equipos cerca de ti...',
    nivelPropio ? `Filtrando por nivel ${nivelPropio}...` : 'Filtrando por nivel...',
    'Conectando con capitanes...',
    'Analizando rivales disponibles...',
  ];

  // Orden de la cola: por km (los sin ubicación al final), luego misma comuna y nivel; entre iguales, al azar
  const puntaje = (r) => (r.zona && r.zona === zonaPropia ? 2 : 0) + (r.nivel && r.nivel === nivelPropio ? 1 : 0);
  const km = (r) => (r.distanciaKm === null || r.distanciaKm === undefined ? Infinity : r.distanciaKm);
  const cola = rivales
    .map((r) => ({ r, azar: Math.random() }))
    .sort((a, b) => (km(a.r) - km(b.r) || 0) || puntaje(b.r) - puntaje(a.r) || a.azar - b.azar)
    .map(({ r }) => r);
  const desafiados = new Set();
  let indice = -1;
  let rivalActual = null;
  let temporizadores = [];

  function limpiarTemporizadores() {
    temporizadores.forEach((t) => clearInterval(t));
    temporizadores = [];
  }

  function mostrar(estado) {
    raiz.dataset.estado = estado;
    Object.entries(vistas).forEach(([nombre, vista]) => { vista.hidden = nombre !== estado; });
  }

  function formatoReloj(segundos) {
    return `${String(Math.floor(segundos / 60)).padStart(2, '0')}:${String(segundos % 60).padStart(2, '0')}`;
  }

  function cambiarTexto(nuevo) {
    texto.textContent = nuevo;
    texto.classList.remove('is-cambio');
    void texto.offsetWidth; // reinicia la animación
    texto.classList.add('is-cambio');
  }

  function siguienteRival() {
    for (let paso = 1; paso <= cola.length; paso += 1) {
      const i = (indice + paso) % cola.length;
      if (!desafiados.has(cola[i].id)) {
        indice = i;
        return cola[i];
      }
    }
    return null;
  }

  function buscar([minimo, maximo]) {
    limpiarTemporizadores();
    mostrar('buscando');
    const inicio = Date.now();
    let paso = 0;
    reloj.textContent = '00:00';
    cambiarTexto(textos[0]);

    temporizadores.push(setInterval(() => {
      reloj.textContent = formatoReloj(Math.floor((Date.now() - inicio) / 1000));
    }, 250));
    temporizadores.push(setInterval(() => {
      paso = (paso + 1) % textos.length;
      cambiarTexto(textos[paso]);
    }, CAMBIO_TEXTO_MS));
    temporizadores.push(setTimeout(() => {
      limpiarTemporizadores();
      const rival = siguienteRival();
      if (rival) revelar(rival);
      else mostrar('vacio');
    }, minimo + Math.random() * (maximo - minimo)));
  }

  // "A 400 m" bajo 1 km; si no, "A 1,2 km"
  function textoDistancia(distanciaKm) {
    if (distanciaKm < 1) return `A ${Math.max(100, Math.round(distanciaKm * 10) * 100)} m de distancia`;
    return `A ${distanciaKm.toLocaleString('es-CL')} km de distancia`;
  }

  function iniciales(nombre) {
    return nombre.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase();
  }

  function pintarRival(rival) {
    const img = raiz.querySelector('[data-rival-img]');
    const conEscudo = Boolean(rival.escudo);
    img.hidden = !conEscudo;
    if (conEscudo) img.src = rival.escudo;
    else img.removeAttribute('src');
    raiz.querySelector('[data-rival-placeholder]').hidden = conEscudo;
    const ini = raiz.querySelector('[data-rival-iniciales]');
    ini.hidden = conEscudo;
    ini.textContent = iniciales(rival.nombre);

    raiz.querySelector('[data-rival-nombre]').textContent = rival.nombre;
    const distancia = raiz.querySelector('[data-rival-distancia]');
    const conDistancia = typeof rival.distanciaKm === 'number';
    distancia.hidden = !conDistancia;
    distancia.textContent = conDistancia ? textoDistancia(rival.distanciaKm) : '';
    const nivel = raiz.querySelector('[data-rival-nivel]');
    nivel.hidden = !rival.nivel;
    nivel.textContent = rival.nivel ? `Nivel: ${rival.nivel}` : '';
    const zona = raiz.querySelector('[data-rival-zona]');
    zona.hidden = !rival.zona;
    zona.querySelector('span').textContent = rival.zona && rival.zona === zonaPropia ? `${rival.zona} · Tu comuna` : rival.zona || '';
    const modalidad = raiz.querySelector('[data-rival-modalidad]');
    modalidad.hidden = !rival.modalidad;
    modalidad.textContent = rival.modalidad || '';

    form.action = `/mi-equipo/desafios/${rival.id}?equipo=${idEquipo}`;
    botonDesafiar.disabled = false;
    botonDesafiar.classList.remove('is-enviado');
    textoDesafiar.textContent = 'Enviar desafío';
    resultado.textContent = '';
    resultado.classList.remove('is-error');
    verDesafios.hidden = true;
    botonOtro.disabled = false;
  }

  function revelar(rival) {
    rivalActual = rival;
    pintarRival(rival);
    mostrar('encontrado');
    flash.classList.remove('is-activo');
    vistas.encontrado.classList.remove('is-entrando');
    void flash.offsetWidth;
    flash.classList.add('is-activo');
    vistas.encontrado.classList.add('is-entrando');
    temporizadores.push(setTimeout(() => flash.classList.remove('is-activo'), DURACION_FLASH_MS));
    if (navigator.vibrate) navigator.vibrate([60, 40, 120]);
    botonDesafiar.focus({ preventScroll: true });
  }

  form.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    if (!rivalActual || botonDesafiar.disabled) return;
    botonDesafiar.disabled = true;
    botonOtro.disabled = true;
    textoDesafiar.textContent = 'Enviando...';
    resultado.classList.remove('is-error');
    resultado.textContent = '';
    try {
      const respuesta = await fetch(form.action, {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(),
      });
      const datos = await respuesta.json().catch(() => ({}));
      if (!respuesta.ok || !datos.resultado) throw new Error(datos.error || 'No se pudo enviar el desafío. Inténtalo de nuevo.');

      if (datos.resultado === 'enviado' || datos.resultado === 'pendiente') {
        desafiados.add(rivalActual.id);
        botonDesafiar.classList.add('is-enviado');
        textoDesafiar.textContent = 'Desafío enviado ✓';
        verDesafios.hidden = false;
        resultado.textContent = datos.mensaje || '';
        botonOtro.disabled = false;
      } else {
        throw new Error(datos.mensaje || 'No se pudo enviar el desafío.');
      }
    } catch (err) {
      botonDesafiar.disabled = false;
      botonOtro.disabled = false;
      textoDesafiar.textContent = 'Enviar desafío';
      resultado.classList.add('is-error');
      resultado.textContent = err.message;
    }
  });

  botonOtro.addEventListener('click', () => buscar(DURACION_OTRO_MS));

  document.addEventListener('keydown', (evento) => {
    if (evento.key === 'Escape') window.location.href = raiz.querySelector('.mm__cerrar').href;
  });

  buscar(DURACION_BUSQUEDA_MS);
}());
