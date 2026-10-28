// public/js/calendario.js
// Calendario del dashboard: vista del mes (lunes a domingo). Las flechas cambian de mes y el día de hoy
// va resaltado. Cada mes pide sus eventos a /api/calendario/eventos (inicio de torneos y partidos de mis
// equipos) y marca esos días con un punto; al elegir un día, debajo aparecen sus eventos con enlace.

document.addEventListener('DOMContentLoaded', () => {
  const calendario = document.querySelector('[data-calendario]');
  if (!calendario) return;

  const titulo = calendario.querySelector('[data-calendario-titulo]');
  const dias = calendario.querySelector('[data-calendario-dias]');
  const listaEventos = calendario.querySelector('[data-calendario-eventos]');
  const nombreMes = new Intl.DateTimeFormat('es-CL', { month: 'long', year: 'numeric' });
  const hoy = new Date();
  let mes = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
  let seleccionado = null; // "AAAA-MM-DD" del día elegido (se mantiene al cambiar de mes)
  let eventosPorDia = new Map(); // "AAAA-MM-DD" → eventos del mes que se ve

  const dosDigitos = (n) => String(n).padStart(2, '0');
  const claveDia = (anio, numeroMes, dia) => `${anio}-${dosDigitos(numeroMes + 1)}-${dosDigitos(dia)}`;

  /** Dibuja el mes guardado en "mes": casillas vacías hasta el primer día y luego los números. */
  function pintar() {
    const anio = mes.getFullYear();
    const numeroMes = mes.getMonth();
    titulo.textContent = nombreMes.format(mes).replace(' de ', ' '); // "octubre 2026" (la mayúscula la pone el CSS)

    const vacias = (new Date(anio, numeroMes, 1).getDay() + 6) % 7; // getDay(): 0 = domingo; aquí 0 = lunes
    const totalDias = new Date(anio, numeroMes + 1, 0).getDate();
    const esMesActual = anio === hoy.getFullYear() && numeroMes === hoy.getMonth();

    const casillas = [];
    for (let i = 0; i < vacias; i += 1) casillas.push(document.createElement('span'));
    for (let dia = 1; dia <= totalDias; dia += 1) {
      const casilla = document.createElement('button');
      casilla.type = 'button';
      casilla.className = 'sm-cal__dia';
      casilla.textContent = dia;
      casilla.dataset.fecha = claveDia(anio, numeroMes, dia);
      casilla.setAttribute('aria-pressed', String(casilla.dataset.fecha === seleccionado));
      const delDia = eventosPorDia.get(casilla.dataset.fecha);
      if (delDia) {
        // Un torneo pesa más que un partido para el color del punto
        casilla.dataset.eventos = delDia.some((e) => e.tipo === 'torneo') ? 'torneo' : 'partido';
        casilla.setAttribute('aria-label', `${dia}: ${delDia.map((e) => e.titulo).join(', ')}`);
      }
      if (esMesActual && dia === hoy.getDate()) {
        casilla.classList.add('sm-cal__dia--hoy');
        casilla.setAttribute('aria-current', 'date');
      }
      casillas.push(casilla);
    }
    dias.replaceChildren(...casillas);
    mostrarEventos();
  }

  /** Lista bajo el calendario: los eventos del día elegido (vacía si no hay día o no tiene eventos). */
  function mostrarEventos() {
    if (!listaEventos) return;
    const delDia = (seleccionado && eventosPorDia.get(seleccionado)) || [];
    listaEventos.replaceChildren(...delDia.map((e) => {
      const enlace = document.createElement('a');
      enlace.className = `sm-cal__evento sm-cal__evento--${e.tipo}`;
      enlace.href = e.url;
      const nombre = document.createElement('strong');
      nombre.textContent = `${e.tipo === 'torneo' ? '🏆 ' : '⚽ '}${e.titulo}`;
      const detalle = document.createElement('small');
      detalle.textContent = [e.hora ? `${e.hora} hrs` : (e.tipo === 'torneo' ? 'Hora por confirmar' : ''), e.detalle, e.mio && e.tipo === 'torneo' ? 'Tu equipo juega' : '']
        .filter(Boolean).join(' · ');
      enlace.append(nombre, detalle);
      return enlace;
    }));
  }

  /** Pide los eventos del mes que se ve; si falla, el calendario sigue funcionando sin puntos. */
  async function cargarEventos() {
    const anio = mes.getFullYear();
    const numeroMes = mes.getMonth();
    const desde = claveDia(anio, numeroMes, 1);
    const hasta = claveDia(anio, numeroMes, new Date(anio, numeroMes + 1, 0).getDate());
    try {
      const respuesta = await fetch(`/api/calendario/eventos?desde=${desde}&hasta=${hasta}`, { headers: { Accept: 'application/json' } });
      const datos = respuesta.ok ? await respuesta.json() : null;
      if (!datos || desde !== claveDia(mes.getFullYear(), mes.getMonth(), 1)) return; // ya se cambió de mes
      eventosPorDia = new Map();
      datos.eventos.forEach((e) => {
        if (!eventosPorDia.has(e.fecha)) eventosPorDia.set(e.fecha, []);
        eventosPorDia.get(e.fecha).push(e);
      });
      pintar();
    } catch (err) {
      // Sin conexión: se queda el mes sin marcas.
    }
  }

  calendario.addEventListener('click', (evento) => {
    const dia = evento.target.closest('.sm-cal__dia');
    if (dia) {
      // Un clic elige el día; otro clic en el mismo lo deselecciona
      seleccionado = dia.dataset.fecha === seleccionado ? null : dia.dataset.fecha;
      dias.querySelectorAll('.sm-cal__dia').forEach((casilla) => {
        casilla.setAttribute('aria-pressed', String(casilla.dataset.fecha === seleccionado));
      });
      mostrarEventos();
      return;
    }
    const flecha = evento.target.closest('[data-calendario-mover]');
    if (!flecha) return;
    mes = new Date(mes.getFullYear(), mes.getMonth() + Number(flecha.dataset.calendarioMover), 1);
    eventosPorDia = new Map();
    pintar();
    cargarEventos();
  });

  pintar();
  cargarEventos();
});
