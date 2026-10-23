// public/js/calendario.js
// Calendario del dashboard: solo la vista del mes (lunes a domingo). Las flechas cambian de mes y el día de hoy
// va resaltado. Se puede seleccionar un día (solo se marca; todavía no muestra partidos ni lee datos de la base).

document.addEventListener('DOMContentLoaded', () => {
  const calendario = document.querySelector('[data-calendario]');
  if (!calendario) return;

  const titulo = calendario.querySelector('[data-calendario-titulo]');
  const dias = calendario.querySelector('[data-calendario-dias]');
  const nombreMes = new Intl.DateTimeFormat('es-CL', { month: 'long', year: 'numeric' });
  const hoy = new Date();
  let mes = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
  let seleccionado = null; // "AAAA-M-D" del día elegido (se mantiene al cambiar de mes)

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
      casilla.dataset.fecha = `${anio}-${numeroMes}-${dia}`;
      casilla.setAttribute('aria-pressed', String(casilla.dataset.fecha === seleccionado));
      if (esMesActual && dia === hoy.getDate()) {
        casilla.classList.add('sm-cal__dia--hoy');
        casilla.setAttribute('aria-current', 'date');
      }
      casillas.push(casilla);
    }
    dias.replaceChildren(...casillas);
  }

  calendario.addEventListener('click', (evento) => {
    const dia = evento.target.closest('.sm-cal__dia');
    if (dia) {
      // Un clic elige el día; otro clic en el mismo lo deselecciona
      seleccionado = dia.dataset.fecha === seleccionado ? null : dia.dataset.fecha;
      dias.querySelectorAll('.sm-cal__dia').forEach((casilla) => {
        casilla.setAttribute('aria-pressed', String(casilla.dataset.fecha === seleccionado));
      });
      return;
    }
    const flecha = evento.target.closest('[data-calendario-mover]');
    if (!flecha) return;
    mes = new Date(mes.getFullYear(), mes.getMonth() + Number(flecha.dataset.calendarioMover), 1);
    pintar();
  });

  pintar();
});
