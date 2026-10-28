// public/js/calendario.js
// Calendario del dashboard: vista del mes (lunes a domingo). Las flechas cambian de mes.
//  - Hoy: anillo verde con resplandor, un silbato bajo el número y una estela verde hacia el día siguiente.
//  - Días con eventos (/api/calendario/eventos: inicio de torneos y partidos de mis equipos): anillo verde y
//    un balón bajo el número; si es un torneo que empieza en 7 días o menos, el anillo "respira".
//  - Tarjeta inferior: el próximo evento (desde hoy) o, con un día elegido, los eventos de ese día.

document.addEventListener('DOMContentLoaded', () => {
  const calendario = document.querySelector('[data-calendario]');
  if (!calendario) return;

  const titulo = calendario.querySelector('[data-calendario-titulo]');
  const dias = calendario.querySelector('[data-calendario-dias]');
  const tarjeta = calendario.querySelector('[data-calendario-eventos]');
  const etiqueta = calendario.querySelector('[data-calendario-etiqueta]');
  const lista = calendario.querySelector('[data-calendario-lista]');
  const nombreMes = new Intl.DateTimeFormat('es-CL', { month: 'long', year: 'numeric' });
  const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const DIAS_PROXIMO = 7;
  const DIAS_BUSCAR_PROXIMO = 365;

  const dosDigitos = (n) => String(n).padStart(2, '0');
  const claveDia = (anio, numeroMes, dia) => `${anio}-${dosDigitos(numeroMes + 1)}-${dosDigitos(dia)}`;
  const claveDe = (fecha) => claveDia(fecha.getFullYear(), fecha.getMonth(), fecha.getDate());
  const sumarDias = (fecha, n) => new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate() + n);

  const hoy = new Date();
  const hoyClave = claveDe(hoy);
  const limiteProximoClave = claveDe(sumarDias(hoy, DIAS_PROXIMO));
  let mes = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
  let seleccionado = null; // "AAAA-MM-DD" del día elegido (se mantiene al cambiar de mes)
  let eventosPorDia = new Map(); // "AAAA-MM-DD" → eventos del mes que se ve
  let proximo = null; // primer evento desde hoy (para la tarjeta cuando no hay día elegido)
  let proximoCargado = false;

  // Íconos de trazo (toman el color del texto): silbato (hoy), balón (eventos) y flecha del botón
  const ICONOS = {
    silbato: '<path d="M3.5 13.5a5 5 0 1 0 10 0 5 5 0 0 0-10 0z" /><path d="M8.5 8.5H19a1.5 1.5 0 0 1 1.5 1.5v1.2l-7.3 2" /><circle cx="8.5" cy="13.5" r="1.6" />',
    balon: '<circle cx="12" cy="12" r="8.5" /><path d="M12 7.6l3.6 2.6-1.4 4.2H9.8l-1.4-4.2z" /><path d="M12 3.5v4.1M20.1 9.4l-4.5.8M16.9 18.9l-2.7-4.5M7.1 18.9l2.7-4.5M3.9 9.4l4.5.8" />',
    flecha: '<path d="m9 6 6 6-6 6" />',
  };

  function icono(nombre, clase) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', clase);
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    svg.innerHTML = ICONOS[nombre];
    return svg;
  }

  function crear(etiquetaHtml, clase, texto) {
    const el = document.createElement(etiquetaHtml);
    if (clase) el.className = clase;
    if (texto !== undefined) el.textContent = texto;
    return el;
  }

  /** '2026-10-30' → '30 OCT' */
  function fechaCorta(clave) {
    const [, numeroMes, dia] = clave.split('-').map(Number);
    return `${dia} ${MESES_CORTOS[numeroMes - 1].toUpperCase()}`;
  }

  /** Dibuja el mes guardado en "mes": casillas vacías hasta el primer día y luego los números. */
  function pintar() {
    const anio = mes.getFullYear();
    const numeroMes = mes.getMonth();
    titulo.textContent = nombreMes.format(mes).replace(' de ', ' '); // "octubre 2026" (la mayúscula la pone el CSS)

    const vacias = (new Date(anio, numeroMes, 1).getDay() + 6) % 7; // getDay(): 0 = domingo; aquí 0 = lunes
    const totalDias = new Date(anio, numeroMes + 1, 0).getDate();

    const casillas = [];
    for (let i = 0; i < vacias; i += 1) casillas.push(document.createElement('span'));
    for (let dia = 1; dia <= totalDias; dia += 1) {
      const fecha = claveDia(anio, numeroMes, dia);
      const delDia = eventosPorDia.get(fecha);
      const esHoy = fecha === hoyClave;
      const casilla = crear('button', 'sm-cal__dia');
      casilla.type = 'button';
      casilla.dataset.fecha = fecha;
      casilla.setAttribute('aria-pressed', String(fecha === seleccionado));
      casilla.append(crear('span', 'sm-cal__num', dia));

      if (delDia) {
        // Un torneo pesa más que un partido para la clase (y para "respirar" si es pronto)
        const tipo = delDia.some((e) => e.tipo === 'torneo') ? 'torneo' : 'partido';
        casilla.classList.add('sm-cal__dia--evento', `sm-cal__dia--${tipo}`);
        if (tipo === 'torneo' && fecha >= hoyClave && fecha <= limiteProximoClave) casilla.classList.add('sm-cal__dia--proximo');
        casilla.append(icono('balon', 'sm-cal__icono'));
        casilla.setAttribute('aria-label', `${dia}: ${delDia.map((e) => e.titulo).join(', ')}`);
      } else if (esHoy) {
        casilla.append(icono('silbato', 'sm-cal__icono'));
      }
      if (esHoy) {
        casilla.classList.add('sm-cal__dia--hoy');
        casilla.setAttribute('aria-current', 'date');
      }
      casillas.push(casilla);
    }
    dias.replaceChildren(...casillas);
    pintarTarjeta();
  }

  /** Un evento dentro de la tarjeta: título, estado, hora · fecha · lugar, tipo y botón de detalles. */
  function filaEvento(e) {
    const articulo = crear('article', `sm-cal__ev sm-cal__ev--${e.tipo}`);

    const cabecera = crear('div', 'sm-cal__ev-cabecera');
    cabecera.append(crear('strong', 'sm-cal__ev-titulo', `${e.tipo === 'torneo' ? '🏆' : '⚽'} ${e.titulo}`));
    const cancelado = e.estado === 'cancelado';
    const estado = crear('span', `sm-cal__ev-estado${e.mio && !cancelado ? ' sm-cal__ev-estado--mio' : ''}`);
    estado.append(crear('span', 'sm-cal__ev-punto'), document.createTextNode(cancelado ? 'Cancelado' : e.mio ? 'Tu equipo juega' : e.estadoTexto));
    cabecera.append(estado);

    const datos = crear('p', 'sm-cal__ev-datos');
    datos.append(document.createTextNode(e.hora ? `${e.hora} hrs · ` : 'Hora por confirmar · '), crear('strong', '', fechaCorta(e.fecha)));
    if (e.lugar) datos.append(document.createTextNode(` · ${e.lugar}`));

    const pie = crear('div', 'sm-cal__ev-pie');
    const tipo = crear('span', 'sm-cal__ev-tipo');
    tipo.append(icono('balon', 'sm-cal__ev-icono'), document.createTextNode(e.subtitulo || ''));
    const boton = crear('a', 'sm-cal__cta', e.tipo === 'torneo' ? 'Ver detalles del torneo' : 'Ver detalles del partido');
    boton.href = e.url;
    boton.append(icono('flecha', 'sm-cal__cta-icono'));
    pie.append(tipo, boton);

    articulo.append(cabecera, datos, pie);
    return articulo;
  }

  /** Tarjeta inferior: los eventos del día elegido o, si no hay día elegido, el próximo evento. */
  function pintarTarjeta() {
    if (!tarjeta) return;
    if (seleccionado) {
      const delDia = eventosPorDia.get(seleccionado) || [];
      etiqueta.textContent = `Eventos del ${fechaCorta(seleccionado).toLowerCase()}`;
      lista.replaceChildren(...(delDia.length > 0
        ? delDia.map(filaEvento)
        : [crear('p', 'sm-cal__tarjeta-vacia', 'No hay torneos ni partidos este día.')]));
    } else {
      if (!proximoCargado) { tarjeta.hidden = true; return; } // sin parpadeo de "no hay eventos" mientras carga
      etiqueta.textContent = 'Próximo evento';
      if (proximo) {
        lista.replaceChildren(filaEvento(proximo));
      } else {
        const vacio = crear('p', 'sm-cal__tarjeta-vacia', 'No tienes eventos próximos. ');
        const enlace = crear('a', '', 'Ver torneos');
        enlace.href = '/torneos';
        vacio.append(enlace);
        lista.replaceChildren(vacio);
      }
    }
    tarjeta.hidden = false;
  }

  async function pedirEventos(desde, hasta) {
    const respuesta = await fetch(`/api/calendario/eventos?desde=${desde}&hasta=${hasta}`, { headers: { Accept: 'application/json' } });
    return respuesta.ok ? (await respuesta.json()).eventos : null;
  }

  /** Pide los eventos del mes que se ve; si falla, el calendario sigue funcionando sin marcas. */
  async function cargarMes() {
    const anio = mes.getFullYear();
    const numeroMes = mes.getMonth();
    const desde = claveDia(anio, numeroMes, 1);
    const hasta = claveDia(anio, numeroMes, new Date(anio, numeroMes + 1, 0).getDate());
    try {
      const eventos = await pedirEventos(desde, hasta);
      if (!eventos || desde !== claveDia(mes.getFullYear(), mes.getMonth(), 1)) return; // ya se cambió de mes
      eventosPorDia = new Map();
      eventos.forEach((e) => {
        if (!eventosPorDia.has(e.fecha)) eventosPorDia.set(e.fecha, []);
        eventosPorDia.get(e.fecha).push(e);
      });
      pintar();
    } catch (err) {
      // Sin conexión: se queda el mes sin marcas.
    }
  }

  /** El primer evento vigente desde hoy (no cuenta partidos cancelados ni torneos ya terminados). */
  async function cargarProximo() {
    try {
      const eventos = await pedirEventos(hoyClave, claveDe(sumarDias(hoy, DIAS_BUSCAR_PROXIMO)));
      proximo = (eventos || []).find((e) => e.estado !== 'cancelado' && e.estado !== 'finalizado') || null;
    } catch (err) {
      proximo = null;
    }
    proximoCargado = true;
    pintarTarjeta();
  }

  calendario.addEventListener('click', (evento) => {
    const dia = evento.target.closest('.sm-cal__dia');
    if (dia) {
      // Un clic elige el día; otro clic en el mismo lo deselecciona (y vuelve el próximo evento)
      seleccionado = dia.dataset.fecha === seleccionado ? null : dia.dataset.fecha;
      dias.querySelectorAll('.sm-cal__dia').forEach((casilla) => {
        casilla.setAttribute('aria-pressed', String(casilla.dataset.fecha === seleccionado));
      });
      pintarTarjeta();
      return;
    }
    const flecha = evento.target.closest('[data-calendario-mover]');
    if (!flecha) return;
    mes = new Date(mes.getFullYear(), mes.getMonth() + Number(flecha.dataset.calendarioMover), 1);
    eventosPorDia = new Map();
    pintar();
    cargarMes();
  });

  pintar();
  cargarMes();
  cargarProximo();
});
