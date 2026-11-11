// public/js/sm-reserva.js
// Reservar una cancha (/canchas/:id/reservar):
//  - Costo estimado según las horas elegidas.
//  - Selector de horarios: al elegir la fecha muestra las franjas del día (libres, ocupadas o ya pasadas)
//    con los datos de #agenda-cancha. Un toque elige una franja; tocar la siguiente (o la anterior) libre
//    alarga la reserva. Los campos "Desde" y "Hasta" siguen funcionando a mano y el servidor revalida todo.
document.addEventListener('DOMContentLoaded', () => {
  const formulario = document.querySelector('form[data-costo-por-hora]');
  if (!formulario) return;
  const precioHora = Number(formulario.dataset.costoPorHora);
  const salida = formulario.querySelector('[data-costo-estimado]');
  const pesos = new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 });
  const campoFecha = formulario.elements.fecha;
  const campoInicio = formulario.elements.inicio;
  const campoFin = formulario.elements.fin;

  const aMinutos = (hora) => {
    const [h, m] = String(hora).split(':').map(Number);
    return h * 60 + m;
  };
  const aHora = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

  function actualizarCosto() {
    const duracion = campoInicio.value && campoFin.value ? aMinutos(campoFin.value) - aMinutos(campoInicio.value) : 0;
    salida.textContent = duracion > 0
      ? `${pesos.format(Math.round(precioHora * (duracion / 60)))} (${duracion / 60} h)`
      : '—';
  }

  // ---------- Selector de franjas ----------
  const nodoDatos = document.getElementById('agenda-cancha');
  const selector = formulario.querySelector('[data-selector-franjas]');
  let agenda = null;
  try { agenda = nodoDatos ? JSON.parse(nodoDatos.textContent) : null; } catch (e) { agenda = null; }

  function franjasDe(fecha) {
    const dia = agenda.dias.find((d) => d.fecha === fecha);
    if (!dia) return null; // fuera del rango con datos
    const bloques = agenda.horario[dia.clave] || [];
    const ocupados = (agenda.ocupados[fecha] || []).map(([i, f]) => [aMinutos(i), aMinutos(f === '00:00' ? '24:00' : f)]);
    const lista = [];
    bloques.forEach(([apertura, cierre]) => {
      const fin = aMinutos(cierre === '00:00' ? '24:00' : cierre);
      for (let ini = aMinutos(apertura); ini + agenda.franja <= fin; ini += agenda.franja) {
        let estado = 'libre';
        if (ocupados.some(([oi, of]) => oi < ini + agenda.franja && of > ini)) estado = 'ocupado';
        else if (fecha === agenda.hoy && ini <= agenda.minutoHoy) estado = 'pasado';
        lista.push({ ini, fin: ini + agenda.franja, estado });
      }
    });
    return { dia, lista };
  }

  function pintar() {
    if (!agenda || !selector) return;
    const datos = campoFecha.value ? franjasDe(campoFecha.value) : null;
    const lista = selector.querySelector('[data-selector-lista]');
    selector.hidden = !datos;
    if (!datos) return;
    selector.querySelector('[data-selector-dia]').textContent = datos.dia.etiqueta === 'Hoy' ? '(hoy)' : `(${datos.dia.etiqueta})`;
    lista.replaceChildren();
    if (datos.lista.length === 0) {
      const p = document.createElement('p');
      p.className = 'sm-horario__cerrado';
      p.textContent = 'La cancha está cerrada ese día. Elige otra fecha.';
      lista.append(p);
      return;
    }
    const ini = campoInicio.value ? aMinutos(campoInicio.value) : null;
    const fin = campoFin.value ? aMinutos(campoFin.value) : null;
    datos.lista.forEach((f) => {
      const boton = document.createElement('button');
      boton.type = 'button';
      boton.className = `sm-franja sm-franja--${f.estado}`;
      boton.textContent = aHora(f.ini);
      const elegida = ini !== null && fin !== null && f.ini >= ini && f.fin <= fin;
      if (elegida) boton.classList.add('sm-franja--elegida');
      boton.setAttribute('aria-pressed', String(elegida));
      if (f.estado !== 'libre') {
        boton.disabled = true;
        boton.title = f.estado === 'ocupado' ? 'Ocupado' : 'Ya pasó';
        boton.setAttribute('aria-label', `${aHora(f.ini)} ${boton.title.toLowerCase()}`);
      } else {
        boton.setAttribute('aria-label', `Elegir de ${aHora(f.ini)} a ${aHora(f.fin)}`);
        boton.addEventListener('click', () => elegir(f, datos.lista));
      }
      lista.append(boton);
    });
  }

  /** Elige una franja; si es contigua a la selección actual y todo lo de en medio está libre, la alarga. */
  function elegir(f, lista) {
    const ini = campoInicio.value ? aMinutos(campoInicio.value) : null;
    const fin = campoFin.value ? aMinutos(campoFin.value) : null;
    let nuevoIni = f.ini;
    let nuevoFin = f.fin;
    if (ini !== null && fin !== null && fin > ini) {
      const desde = Math.min(ini, f.ini);
      const hasta = Math.max(fin, f.fin);
      const tramo = lista.filter((x) => x.ini >= desde && x.fin <= hasta);
      const continuo = tramo.length * agenda.franja === hasta - desde && tramo.every((x) => x.estado === 'libre');
      const yaDentro = f.ini >= ini && f.fin <= fin;
      if (continuo && !yaDentro && (f.ini === fin || f.fin === ini)) { nuevoIni = desde; nuevoFin = hasta; }
    }
    campoInicio.value = aHora(nuevoIni);
    campoFin.value = aHora(nuevoFin === 1440 ? 0 : nuevoFin);
    [campoInicio, campoFin].forEach((c) => c.closest('.campo').classList.remove('campo--error'));
    actualizarCosto();
    pintar();
  }

  campoFecha.addEventListener('input', pintar);
  campoFecha.addEventListener('change', pintar);
  campoInicio.addEventListener('input', () => { actualizarCosto(); pintar(); });
  campoFin.addEventListener('input', () => { actualizarCosto(); pintar(); });
  // Sin fecha elegida, se propone hoy (o el primer día con horarios libres).
  if (agenda && !campoFecha.value) {
    const primero = agenda.dias.find((d) => (franjasDe(d.fecha).lista || []).some((f) => f.estado === 'libre'));
    if (primero) campoFecha.value = primero.fecha;
  }
  actualizarCosto();
  pintar();
});
