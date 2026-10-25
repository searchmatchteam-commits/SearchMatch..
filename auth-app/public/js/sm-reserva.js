document.addEventListener('DOMContentLoaded', () => {
  const formulario = document.querySelector('form[data-costo-por-hora]');
  if (!formulario) return;
  const precioHora = Number(formulario.dataset.costoPorHora);
  const salida = formulario.querySelector('[data-costo-estimado]');
  const pesos = new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 });

  const aMinutos = (hora) => {
    const [h, m] = hora.split(':').map(Number);
    return h * 60 + m;
  };

  function actualizar() {
    const inicio = formulario.elements.inicio.value;
    const fin = formulario.elements.fin.value;
    const duracion = inicio && fin ? aMinutos(fin) - aMinutos(inicio) : 0;
    salida.textContent = duracion > 0
      ? `${pesos.format(Math.round(precioHora * (duracion / 60)))} (${duracion / 60} h)`
      : '—';
  }

  formulario.elements.inicio.addEventListener('input', actualizar);
  formulario.elements.fin.addEventListener('input', actualizar);
  actualizar();
});
