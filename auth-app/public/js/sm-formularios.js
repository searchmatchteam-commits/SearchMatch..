const SM_REGEX_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;


/**
 * Deja en el select de comunas solo las de la región elegida. Guarda todas las comunas (los <optgroup> con
 * data-region) la primera vez y en cada cambio rearma las opciones. Si la comuna marcada es de otra región
 * se limpia; si hay comuna pero no región (datos antiguos), se elige su región.
 * @param {{ sinRegion: 'todas'|'ninguna' }} opciones - Sin región: mostrar todas (filtros) o ninguna (formularios).
 */
function comunasDeRegion(selectRegion, selectComuna, { sinRegion = 'ninguna' } = {}) {
  const vacio = selectComuna.querySelector('option[value=""]');
  const textoVacio = vacio ? vacio.textContent : 'Elige la comuna';
  const grupos = Array.from(selectComuna.querySelectorAll('optgroup')).map((g) => ({
    region: g.dataset.region,
    etiqueta: g.label,
    comunas: Array.from(g.querySelectorAll('option')).map((o) => ({ valor: o.value, texto: o.textContent })),
  }));
  const regionDe = (valor) => (grupos.find((g) => g.comunas.some((c) => c.valor === valor)) || {}).region || '';

  if (!selectRegion.value && selectComuna.value) selectRegion.value = regionDe(selectComuna.value);

  function rearmar() {
    const region = selectRegion.value;
    const anterior = selectComuna.value;
    const opcionVacia = document.createElement('option');
    opcionVacia.value = '';
    opcionVacia.textContent = !region && sinRegion === 'ninguna' ? 'Primero elige la región' : textoVacio;
    const nuevas = [opcionVacia];
    grupos.forEach((g) => {
      if (region ? g.region !== region : sinRegion === 'ninguna') return;
      const contenedor = region ? null : document.createElement('optgroup');
      if (contenedor) contenedor.label = g.etiqueta;
      g.comunas.forEach((c) => {
        const opcion = document.createElement('option');
        opcion.value = c.valor;
        opcion.textContent = c.texto;
        (contenedor || { append: (o) => nuevas.push(o) }).append(opcion);
      });
      if (contenedor) nuevas.push(contenedor);
    });
    selectComuna.replaceChildren(...nuevas);
    // Si la comuna anterior no quedó en la lista (es de otra región), vuelve a "Elige la comuna"
    selectComuna.value = anterior;
    if (!selectComuna.value) selectComuna.selectedIndex = 0;
    selectComuna.disabled = !region && sinRegion === 'ninguna';
  }

  selectRegion.addEventListener('change', rearmar);
  rearmar();
}

document.addEventListener('DOMContentLoaded', () => {

  function marcar(campo, mensaje) {
    const contenedor = campo.closest('.campo');
    if (!contenedor) return;
    contenedor.classList.toggle('campo--error', Boolean(mensaje));
    campo.setAttribute('aria-invalid', mensaje ? 'true' : 'false');
    const error = contenedor.querySelector('.campo__error');
    if (error) error.textContent = mensaje || '';
  }

  function revisar(campo) {
    const valor = campo.value.trim();
    if (campo.required && !valor) return campo.dataset.mensaje || 'Este campo es obligatorio.';
    if (valor && campo.type === 'email' && !SM_REGEX_CORREO.test(valor)) return 'El formato del correo no es válido.';
    if (valor && campo.minLength > 0 && valor.length < campo.minLength) return `Debe tener al menos ${campo.minLength} caracteres.`;
    if (valor && campo.type === 'number') {
      const numero = Number(valor);
      if (campo.min !== '' && numero < Number(campo.min)) return `Debe ser mayor o igual a ${campo.min}.`;
      if (campo.max !== '' && numero > Number(campo.max)) return `Debe ser menor o igual a ${campo.max}.`;
    }
    return null;
  }

  document.querySelectorAll('form[data-sm-validar]').forEach((formulario) => {
    const campos = Array.from(formulario.querySelectorAll('input[name], select[name], textarea[name]'))
      .filter((campo) => campo.type !== 'hidden' && campo.type !== 'checkbox');

    formulario.addEventListener('submit', (evento) => {
      let primero = null;
      campos.forEach((campo) => {
        if (campo.disabled) return;
        const mensaje = revisar(campo);
        marcar(campo, mensaje);
        if (mensaje && !primero) primero = campo;
      });
      if (primero) {
        evento.preventDefault();
        primero.focus();
        return;
      }
      const boton = formulario.querySelector('button[type="submit"]');
      if (boton) setTimeout(() => { if (!evento.defaultPrevented) boton.disabled = true; });
    });

    campos.forEach((campo) => campo.addEventListener('input', () => {
      if (campo.closest('.campo--error') && !revisar(campo)) marcar(campo, null);
    }));
  });

  // AP-003: listas que se aplican al elegir (ej. "Por página"); sin JS queda el botón [data-sin-js].
  document.querySelectorAll('select[data-enviar-al-cambiar]').forEach((lista) => {
    const boton = lista.form && lista.form.querySelector('[data-sin-js]');
    if (boton) boton.hidden = true;
    lista.addEventListener('change', () => lista.form.requestSubmit());
  });

  document.querySelectorAll('form[data-confirmar]').forEach((formulario) => {
    formulario.addEventListener('submit', async (evento) => {
      if (formulario.dataset.confirmado === 'si') return;
      if (evento.defaultPrevented) return;
      evento.preventDefault();
      if (typeof confirmarAccion !== 'function') return formulario.submit();
      const confirmado = await confirmarAccion({
        titulo: formulario.dataset.confirmarTitulo || '¿Estás seguro?',
        texto: formulario.dataset.confirmar,
        confirmar: formulario.dataset.confirmarBoton || 'Confirmar',
      });
      if (!confirmado) return;
      formulario.dataset.confirmado = 'si';
      formulario.requestSubmit();
    });
  });

  document.querySelectorAll('form[data-requiere-aceptar]').forEach((formulario) => {
    const casilla = formulario.querySelector('[data-casilla-aceptar]');
    const boton = formulario.querySelector('[data-boton-aceptar]');
    const aviso = formulario.querySelector('[data-aviso-aceptar]');
    if (!casilla || !boton) return;
    const actualizar = () => {
      boton.disabled = !casilla.checked;
      if (aviso) aviso.hidden = casilla.checked;
    };
    casilla.addEventListener('change', actualizar);
    actualizar();
  });

  if (!document.body.classList.contains('pagina-auth')) {
    document.querySelectorAll('[data-ver-password]').forEach((boton) => {
      boton.addEventListener('click', () => {
        const input = document.getElementById(boton.getAttribute('aria-controls'));
        const mostrar = input.type === 'password';
        input.type = mostrar ? 'text' : 'password';
        boton.setAttribute('aria-pressed', String(mostrar));
        boton.setAttribute('aria-label', mostrar ? 'Ocultar contraseña' : 'Mostrar contraseña');
      });
    });
  }

  // Región → comunas (partials/sm-ubicacion). En formularios obligatorios no hay comunas hasta elegir región;
  // en los filtros ("Todas las regiones") se ven todas.
  document.querySelectorAll('select[data-sm-region]').forEach((selectRegion) => {
    const selectComuna = document.getElementById(selectRegion.dataset.smRegion);
    if (!selectComuna) return;
    comunasDeRegion(selectRegion, selectComuna, { sinRegion: selectRegion.required ? 'ninguna' : 'todas' });
  });

  // Posiciones (partials/sm-posiciones): la principal elegida no se puede marcar también como alternativa.
  document.querySelectorAll('[data-posiciones]').forEach((grupo) => {
    const radios = grupo.querySelectorAll('input[name="posicion_principal"]');
    const casillas = grupo.querySelectorAll('input[name="posicion_alternativa"]');
    const sincronizar = () => {
      const elegida = Array.from(radios).find((r) => r.checked);
      casillas.forEach((c) => {
        c.disabled = Boolean(elegida) && c.value === elegida.value;
        if (c.disabled) c.checked = false;
      });
    };
    radios.forEach((r) => r.addEventListener('change', sincronizar));
  });

  // Equipación del partido (partidos/programar): si las dos camisetas elegidas son del mismo color, alerta al
  // instante y no deja enviar (el servidor lo vuelve a revisar). Misma medida que config/coloresEquipo.js.
  const parecidos = (a, b) => {
    const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
    const [r1, g1, b1] = rgb(a);
    const [r2, g2, b2] = rgb(b);
    const media = (r1 + r2) / 2;
    return Math.sqrt((2 + media / 256) * (r1 - r2) ** 2 + 4 * (g1 - g2) ** 2 + (2 + (255 - media) / 256) * (b1 - b2) ** 2) < 120;
  };
  document.querySelectorAll('[data-equipacion]').forEach((grupo) => {
    const formulario = grupo.closest('form');
    const alerta = grupo.parentElement.querySelector('[data-alerta-choque]');
    const enviar = formulario && formulario.querySelector('button[type="submit"]');
    const revisar = () => {
      const elegida = (lado) => grupo.querySelector(`input[name="camiseta_${lado}"]:checked`);
      const a = elegida('desafiante');
      const b = elegida('desafiado');
      // Si todas las combinaciones chocan (data-permitir-choque) no se bloquea: usarán petos
      const choque = a && b && a.dataset.color && b.dataset.color && parecidos(a.dataset.color, b.dataset.color)
        && grupo.dataset.permitirChoque !== 'si';
      if (alerta) {
        alerta.textContent = grupo.dataset.mensajeChoque;
        alerta.hidden = !choque;
      }
      if (enviar) enviar.disabled = Boolean(choque);
    };
    grupo.addEventListener('change', revisar);
    revisar();
  });

  // Paleta rápida (partials/sm-colores-equipo): una muestra pone ese color en el selector de su fila.
  document.querySelectorAll('[data-paleta]').forEach((paleta) => {
    const entrada = paleta.querySelector('input[type="color"]');
    const otro = paleta.querySelector('.sm-paleta__otro');
    const muestras = [...paleta.querySelectorAll('[data-color]')];
    const marcar = () => {
      const valor = entrada.value.toLowerCase();
      let enPaleta = false;
      muestras.forEach((m) => {
        const igual = m.dataset.color === valor;
        if (igual) enPaleta = true;
        m.setAttribute('aria-pressed', String(igual));
      });
      otro.classList.toggle('sm-paleta__otro--activo', !enPaleta);
    };
    muestras.forEach((m) => m.addEventListener('click', () => {
      entrada.value = m.dataset.color;
      entrada.dispatchEvent(new Event('input', { bubbles: true }));
      marcar();
    }));
    entrada.addEventListener('input', marcar);
  });

  // Colores del equipo (partials/sm-colores-equipo): la vista previa de la carta y las camisetas sigue a cada selector.
  document.querySelectorAll('[data-colores-equipo]').forEach((grupo) => {
    grupo.addEventListener('input', (evento) => {
      const variable = evento.target.dataset.var;
      if (variable) grupo.style.setProperty(variable, evento.target.value);
    });
  });
});
