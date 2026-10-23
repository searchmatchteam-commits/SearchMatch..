// public/js/canchas-lista.js
// Lista de canchas por lotes: "Cargar más canchas" pide al servidor el siguiente lote de tarjetas
// (GET /canchas?...&parcial=1&desde=N, ya escapado por EJS) y lo agrega al final de la lista.
// Sin JavaScript el botón es un enlace normal (?mostrar=N) y la página se recarga con más tarjetas.

document.addEventListener('DOMContentLoaded', () => {
  const boton = document.getElementById('cargar-mas-canchas');
  const lista = document.getElementById('lista-canchas');
  if (!boton || !lista || !window.fetch) return;

  const total = Number(boton.dataset.total);
  const mostradas = document.querySelector('#resultados-canchas [data-mostradas]');
  let cargando = false;

  boton.addEventListener('click', async (evento) => {
    evento.preventDefault();
    if (cargando) return;
    cargando = true;
    boton.setAttribute('aria-busy', 'true');
    boton.textContent = 'Cargando…';

    const desde = lista.children.length;
    const url = new URL(boton.href, window.location.href);
    url.hash = '';
    url.searchParams.delete('mostrar');
    url.searchParams.set('parcial', '1');
    url.searchParams.set('desde', desde);

    try {
      const respuesta = await fetch(url, { headers: { Accept: 'text/html' }, credentials: 'same-origin' });
      if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`);
      lista.insertAdjacentHTML('beforeend', await respuesta.text());

      const cantidad = lista.children.length;
      if (mostradas) mostradas.textContent = cantidad;
      // Foco en la primera tarjeta nueva (teclado y lectores de pantalla siguen donde iban)
      const primeraNueva = lista.children[desde];
      if (primeraNueva) primeraNueva.focus({ preventScroll: true });

      if (cantidad >= total || cantidad === desde) {
        boton.parentElement.remove();
        if (mostradas) mostradas.parentElement.textContent = `${total} ${total === 1 ? 'cancha encontrada' : 'canchas encontradas'}`;
        return;
      }
      // El enlace de respaldo (sin JS o si falla la próxima carga) sigue desde donde quedó la lista
      const siguiente = new URL(boton.href, window.location.href);
      siguiente.searchParams.set('mostrar', cantidad + Number(boton.dataset.lote));
      siguiente.hash = `tarjeta-${cantidad + 1}`;
      boton.href = siguiente.toString();
      boton.textContent = 'Cargar más canchas';
    } catch (error) {
      // Si falla, el enlace normal recarga la página con el siguiente lote
      window.location.href = boton.href;
      return;
    } finally {
      cargando = false;
      boton.removeAttribute('aria-busy');
    }
  });
});
