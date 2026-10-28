// models/tareasProgramadas.js
// Tareas con plazo (SA-7): un único job que app.js corre cada minuto. Cada tarea es idempotente (correrla dos
// veces no cambia nada) y además las lecturas comprueban los plazos por su cuenta (comprobación perezosa), así
// que si el servidor estuvo apagado nada queda en un estado equivocado.
//  - TO-005 c4: cerrar inscripciones vencidas que cumplen el cupo mínimo (si no, queda una alerta del panel).
// Las fases siguientes suman aquí: expirar reservas de 15 min (TO-018), retiros de 48 h (TO-024), anuncios (AP-021).

const torneoModel = require('./torneoModel');

const INTERVALO_MS = 60 * 1000;

let corriendo = false;

/** Corre todas las tareas una vez. Un error en una no detiene a las demás (solo se registra en consola). */
async function correr() {
  if (corriendo) return; // si una vuelta tarda más de un minuto, la siguiente no se superpone
  corriendo = true;
  try {
    const { cerrados } = await torneoModel.cerrarVencidos();
    if (cerrados.length > 0) console.log(`⏱️  Inscripciones cerradas por fecha límite: torneos ${cerrados.join(', ')}.`);
  } catch (err) {
    console.error('⚠️  Tarea programada de torneos falló:', err.message);
  } finally {
    corriendo = false;
  }
}

/** Arranca el job (lo llama app.js al iniciar el servidor). */
function iniciar() {
  setTimeout(correr, 5000);
  const id = setInterval(correr, INTERVALO_MS);
  id.unref();
  return id;
}

module.exports = { correr, iniciar, INTERVALO_MS };
