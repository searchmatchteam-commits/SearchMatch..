const partidoModel = require('../models/partidoModel');
const torneoModel = require('../models/torneoModel');
const { ahoraEnChile } = require('../middlewares/validadoresPartido');
const { idValido } = require('../middlewares/validadoresAdmin');

const COOKIE_EQUIPO_INICIO = 'sm_equipo_inicio';
const UN_ANIO_MS = 365 * 24 * 60 * 60 * 1000;
const NOMBRES_MES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

function leerMes(texto) {
  const hoy = ahoraEnChile().fecha.slice(0, 7);
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(texto || '')) return hoy;
  return texto;
}

function moverMes(mes, delta) {
  const [anio, numero] = mes.split('-').map(Number);
  const fecha = new Date(Date.UTC(anio, numero - 1 + delta, 1));
  return fecha.toISOString().slice(0, 7);
}

function celdasDelMes(mes) {
  const [anio, numero] = mes.split('-').map(Number);
  const primero = new Date(Date.UTC(anio, numero - 1, 1));
  const dias = new Date(Date.UTC(anio, numero, 0)).getUTCDate();
  const vacias = (primero.getUTCDay() + 6) % 7;
  return [...Array(vacias).fill(null), ...Array.from({ length: dias }, (_, i) => `${mes}-${String(i + 1).padStart(2, '0')}`)];
}

async function agenda(req, res, next) {
  const mes = leerMes(req.query.mes);
  const lista = req.query.lista === 'pasados' ? 'pasados' : 'proximos';
  try {
    const celdas = celdasDelMes(mes);
    const ultimo = celdas[celdas.length - 1];
    const [delMes, listado, torneosDelMes] = await Promise.all([
      partidoModel.listarDeCuentaEntre(req.usuario.idAuth, `${mes}-01`, ultimo),
      partidoModel.listarDeCuenta(req.usuario.idAuth, lista === 'proximos'),
      torneoModel.eventosCalendario(`${mes}-01`, ultimo, req.usuario.idAuth),
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
      diasConTorneo: new Set(torneosDelMes.map((t) => t.fecha)),
      torneosDelDia: dia ? torneosDelMes.filter((t) => t.fecha === dia) : [],
      hayEnElMes: delMes.length > 0 || torneosDelMes.length > 0,
      lista,
      listado,
    });
  } catch (err) {
    return next(err);
  }
}

// ---------------------------------------------------------------
// GET /api/calendario/eventos?desde=AAAA-MM-DD&hasta=AAAA-MM-DD → JSON para los calendarios
// Torneos con fecha de inicio (todos; "mio" si juega un equipo de la cuenta) y partidos de la cuenta.
// Sin rango: el mes actual (hora de Chile). Máximo 366 días.
// ---------------------------------------------------------------
const MAX_DIAS_RANGO = 366;

function leerDia(texto) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(texto || '')) return null;
  const fecha = new Date(`${texto}T00:00:00Z`);
  return !Number.isNaN(fecha.getTime()) && fecha.toISOString().slice(0, 10) === texto ? fecha : null;
}

async function eventos(req, res, next) {
  if (!req.usuario) return res.status(401).json({ ok: false, mensaje: 'Debes iniciar sesión.' });
  const mes = ahoraEnChile().fecha.slice(0, 7);
  const celdas = celdasDelMes(mes);
  const desde = req.query.desde || `${mes}-01`;
  const hasta = req.query.hasta || celdas[celdas.length - 1];
  const inicio = leerDia(desde);
  const fin = leerDia(hasta);
  if (!inicio || !fin || fin < inicio || (fin - inicio) / 86400000 > MAX_DIAS_RANGO) {
    return res.status(400).json({ ok: false, mensaje: `Usa desde y hasta con formato AAAA-MM-DD (máximo ${MAX_DIAS_RANGO} días).` });
  }
  try {
    const [torneos, partidos] = await Promise.all([
      torneoModel.eventosCalendario(desde, hasta, req.usuario.idAuth),
      partidoModel.listarDeCuentaEntre(req.usuario.idAuth, desde, hasta),
    ]);
    const deLosPartidos = partidos.map((p) => ({
      tipo: 'partido',
      id: p.id,
      titulo: `${p.desafiante} vs ${p.desafiado}`,
      fecha: p.fecha,
      hora: p.hora,
      estado: p.cancelado ? 'cancelado' : 'programado',
      estadoTexto: p.cancelado ? 'Cancelado' : 'Programado',
      detalle: p.cancha,
      mio: true,
      url: `/partidos/${p.id}`,
    }));
    const lista = [...torneos, ...deLosPartidos]
      .sort((a, b) => a.fecha.localeCompare(b.fecha) || (a.hora || '99').localeCompare(b.hora || '99'));
    return res.json({ ok: true, desde, hasta, eventos: lista });
  } catch (err) {
    return next(err);
  }
}

async function datosEquipoInicio(req, misEquipos) {
  if (!misEquipos || misEquipos.length === 0) return null;
  const elegido = idValido(req.cookies[COOKIE_EQUIPO_INICIO]);
  const equipo = misEquipos.find((e) => e.id === elegido) || misEquipos[0];
  const proximo = await partidoModel.proximoDeEquipo(equipo.id).catch(() => null);
  return { equipos: misEquipos, equipo, proximo };
}

function elegirEquipo(req, res) {
  const id = idValido(req.query.id);
  if (id) res.cookie(COOKIE_EQUIPO_INICIO, String(id), { httpOnly: true, sameSite: 'lax', maxAge: UN_ANIO_MS });
  return res.redirect('/dashboard#equipo-inicio');
}

module.exports = { agenda, eventos, datosEquipoInicio, elegirEquipo };
