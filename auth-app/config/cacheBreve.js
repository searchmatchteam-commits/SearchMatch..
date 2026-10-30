// Caché breve en memoria para datos públicos que cambian poco. Nunca datos de una cuenta.
// Pasado el plazo entrega lo guardado y lo renueva en segundo plano: nadie espera la consulta salvo el primero.

/**
 * @param {number} plazoMs - Vigencia de lo guardado.
 * @param {() => Promise<*>} cargar - La consulta. Si falla no se guarda nada y se reintenta en la siguiente lectura.
 * @returns {() => Promise<*>} Lector. El valor es compartido: quien lo recibe no debe modificarlo.
 */
function cacheBreve(plazoMs, cargar) {
  let valor;
  let vence = 0;
  let enCurso = null;

  function renovar() {
    if (!enCurso) {
      enCurso = cargar()
        .then((nuevo) => {
          valor = nuevo;
          vence = Date.now() + plazoMs;
          return nuevo;
        })
        .finally(() => { enCurso = null; });
    }
    return enCurso;
  }

  return async function leer() {
    if (vence === 0) return renovar();
    if (Date.now() >= vence) {
      renovar().catch((err) => console.error('⚠️  No se pudo renovar la caché:', err.message));
    }
    return valor;
  };
}

module.exports = { cacheBreve };
