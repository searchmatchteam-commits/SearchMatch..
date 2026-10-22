// controllers/agendaController.js
//  AG-001 GET /agenda?mes=AAAA-MM&dia=AAAA-MM-DD&lista=proximos|pasados
//         Calendario mensual con los días de partido de los equipos de la cuenta, los partidos del día elegido
//         y la lista de Próximos (sin cancelados) o Pasados.
//  IN-005 GET /inicio/equipo?id=  → recuerda (cookie) qué equipo muestra el inicio; datosEquipoInicio arma ese panel.

const partidoModel = require('../models/partidoModel');
const { ahoraEnChile } = require('../middlewares/validadoresPartido');
const { idValido } = require('../middlewares/validadoresAdmin');

const COOKIE_EQUIPO_INICIO = 'sm_equipo_inicio';
const UN_ANIO_MS = 365 * 24 * 60 * 60 * 1000;
const NOMBRES_MES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/** "AAAA-MM" válido o el mes actual de Chile. */
function leerMes(texto) {
  const hoy = ahoraEnChile().fecha.slice(0, 7);
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(texto || '')) return hoy;
  return texto;
}

/** Mes anterior o siguiente: "2026-12" + 1 → "2027-01". */
function moverMes(mes, delta) {
  const [anio, numero] = mes.split('-').map(Number);
  const fecha = new Date(Date.UTC(anio, numero - 1 + delta, 1));
  return fecha.toISOString().slice(0, 7);
}

/** Celdas del calendario (semanas de lunes a domingo; null = celda vacía antes del día 1). */
function celdasDelMes(mes) {
  const [anio, numero] = mes.split('-').map(Number);
  const primero = new Date(Date.UTC(anio, numero - 1, 1));
  const dias = new Date(Date.UTC(anio, numero, 0)).getUTCDate();
  const vacias = (primero.getUTCDay() + 6) % 7; // lunes = 0
  return [...Array(vacias).fill(null), ...Array.from({ length: dias }, (_, i) => `${mes}-${String(i + 1).padStart(2, '0')}`)];
}

// GET /agenda
async function agenda(req, res, next) {
  const mes = leerMes(req.query.mes);
  const lista = req.query.lista === 'pasados' ? 'pasados' : 'proximos';
  try {
    const celdas = celdasDelMes(mes);
    const ultimo = celdas[celdas.length - 1];
    const [delMes, listado] = await Promise.all([
      partidoModel.listarDeCuentaEntre(req.usuario.idAuth, `${mes}-01`, ultimo),
      partidoModel.listarDeCuenta(req.usuario.idAuth, lista === 'proximos'),
    ]);
    const dia = /^\d{4}-\d{2}-\d{2}$/.test(req.query.dia || '') && req.query.dia.startsWith(mes) ? req.query.dia : null;
    return res.render('agenda/index', {
      titulo: 'Agenda',
      pagina: 'equipo',
      mes,
      nombreMes: `${NOMBRES_MES[Number(mes.slice(5)) - 1]} ${mes.slice(0, 4)}`,
      mesAnterior: moverMes(mes, -1),
      mesSiguiente: moverMes(mes, 1),
      celdas,
      hoy: ahoraEnChile().fecha,
      diasConPartido: new Set(delMes.map((p) => p.fecha)),
      dia,
      delDia: dia ? delMes.filter((p) => p.fecha === dia) : [],
      hayEnElMes: delMes.length > 0,
      lista,
      listado,
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * IN-005 · Panel "Mi equipo" del inicio: el equipo elegido (cookie) entre los activos de la cuenta,
 * con su nivel y su próximo partido. Si la cuenta tiene un solo equipo no hay selector.
 * @param {Array|null} misEquipos - Los que ya leyó el dashboard (equipoModel.listarMisEquiposConPlantel).
 */
async function datosEquipoInicio(req, misEquipos) {
  if (!misEquipos || misEquipos.length === 0) return null;
  const elegido = idValido(req.cookies[COOKIE_EQUIPO_INICIO]);
  const equipo = misEquipos.find((e) => e.id === elegido) || misEquipos[0];
  const proximo = await partidoModel.proximoDeEquipo(equipo.id).catch(() => null);
  return { equipos: misEquipos, equipo, proximo };
}

// GET /inicio/equipo?id=  (solo guarda equipos a los que la cuenta pertenece: lo revisa datosEquipoInicio)
function elegirEquipo(req, res) {
  const id = idValido(req.query.id);
  if (id) res.cookie(COOKIE_EQUIPO_INICIO, String(id), { httpOnly: true, sameSite: 'lax', maxAge: UN_ANIO_MS });
  return res.redirect('/dashboard#equipo-inicio');
}

module.exports = { agenda, datosEquipoInicio, elegirEquipo };
