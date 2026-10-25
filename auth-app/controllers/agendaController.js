const partidoModel = require('../models/partidoModel');
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

module.exports = { agenda, datosEquipoInicio, elegirEquipo };
