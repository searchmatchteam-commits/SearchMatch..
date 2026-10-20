// config/dashboardEjemplo.js
// Canchas y equipos de EJEMPLO para el dashboard (/dashboard).
// Las tablas cancha y equipo aún no tienen datos ni pantallas de reserva/solicitud;
// cuando existan, pageController.dashboard debe leerlos desde sus modelos.

const CANCHAS = [
  { nombre: 'Monumental', comuna: 'Macul', tipo: 'Fútbol 7 · Pasto sintético', horario: 'Hoy · 20:00', precio: 28000 },
  { nombre: 'El Potrero', comuna: 'Ñuñoa', tipo: 'Fútbol 5 · Techada', horario: 'Hoy · 21:00', precio: 22000 },
  { nombre: 'Complejo Los Andes', comuna: 'La Florida', tipo: 'Fútbol 11 · Pasto natural', horario: 'Mañana · 19:00', precio: 45000 },
];

// "tono" es el matiz (0-360) del escudo con las iniciales.
const EQUIPOS = [
  { nombre: 'Deportivo Recoleta', comuna: 'Recoleta', modalidad: 'Fútbol 7', nivel: 'Intermedio', busca: ['Defensa', 'Arquero'], tono: 140 },
  { nombre: 'Halcones del Sur', comuna: 'San Miguel', modalidad: 'Fútbol 5', nivel: 'Avanzado', busca: ['Delantero'], tono: 205 },
  { nombre: 'Real Pichanga', comuna: 'Providencia', modalidad: 'Fútbol 7', nivel: 'Principiante', busca: ['Mediocampista'], tono: 32 },
];

module.exports = { CANCHAS, EQUIPOS };
