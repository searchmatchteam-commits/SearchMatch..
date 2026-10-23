// controllers/canchasController.js
// Canchas para los usuarios (Fase 3). Solo se ven canchas ACTIVAS de recintos ACTIVOS.
//  GET /canchas      → DE-002 buscar por nombre de cancha o recinto · DE-003 lista o mapa
//                      DE-004 filtro región/comuna · DE-005 filtro modalidad (todos combinables)
//  GET /canchas/:id  → ficha: datos, teléfono del recinto y DE-006 disponibilidad horaria

const canchaModel = require('../models/canchaModel');
const disponibilidadModel = require('../models/disponibilidadModel');
const ubicacionModel = require('../models/ubicacionModel');
const { idValido } = require('../middlewares/validadoresAdmin');
const { DIAS_SEMANA, LARGO_MINIMO_BUSQUEDA, DIAS_DISPONIBILIDAD, ZONA_HORARIA } = require('../config/canchas');

/** Filtros de la URL, limpios. La búsqueda por nombre se ignora si es muy corta (DE-002). */
function leerFiltros(query) {
  const textoIngresado = String(query.texto || '').trim().slice(0, 100);
  return {
    textoIngresado,
    texto: textoIngresado.length >= LARGO_MINIMO_BUSQUEDA ? textoIngresado : '',
    terminoCorto: textoIngresado.length > 0 && textoIngresado.length < LARGO_MINIMO_BUSQUEDA,
    idRegion: idValido(query.id_region),
    idComuna: idValido(query.id_comuna),
    idModalidad: idValido(query.id_modalidad),
    // DE-003: el mapa se muestra de entrada (con la lista debajo); "lista" deja solo la lista.
    vista: query.vista === 'lista' ? 'lista' : 'mapa',
  };
}

/** Recintos con coordenadas para los marcadores del mapa (DE-003), con sus canchas filtradas. */
function recintosParaMapa(canchas) {
  const porRecinto = new Map();
  canchas.forEach((cancha) => {
    if (cancha.latitud === null || cancha.longitud === null) return;
    if (!porRecinto.has(cancha.id_recinto)) {
      porRecinto.set(cancha.id_recinto, {
        nombre: cancha.recinto,
        comuna: cancha.comuna,
        direccion: cancha.direccion,
        latitud: cancha.latitud,
        longitud: cancha.longitud,
        canchas: [],
      });
    }
    porRecinto.get(cancha.id_recinto).canchas.push({ id: cancha.id, nombre: cancha.nombre, modalidad: cancha.modalidad, precio: cancha.precio });
  });
  return [...porRecinto.values()];
}

// GET /canchas
async function listar(req, res, next) {
  const filtros = leerFiltros(req.query);
  try {
    const [regiones, modalidades] = await Promise.all([
      ubicacionModel.listarRegionesConComunas(),
      canchaModel.listarModalidades(),
    ]);
    // DE-004: si la comuna no es de la región elegida, se usa solo la región.
    if (filtros.idComuna && filtros.idRegion) {
      const region = regiones.find((r) => r.id === filtros.idRegion);
      if (!region || !region.comunas.some((c) => c.id === filtros.idComuna)) filtros.idComuna = null;
    }
    const [canchas, hayCanchas] = await Promise.all([canchaModel.buscarCanchas(filtros), canchaModel.hayCanchasVisibles()]);
    const parametros = new URLSearchParams();
    ['textoIngresado:texto', 'idRegion:id_region', 'idComuna:id_comuna', 'idModalidad:id_modalidad'].forEach((par) => {
      const [clave, nombre] = par.split(':');
      if (filtros[clave]) parametros.set(nombre, filtros[clave]);
    });

    return res.render('canchas/index', {
      titulo: 'Canchas',
      pagina: 'equipo',
      canchas,
      hayCanchas,
      regiones,
      modalidades,
      filtros,
      hayFiltros: Boolean(filtros.textoIngresado || filtros.idRegion || filtros.idComuna || filtros.idModalidad),
      largoMinimo: LARGO_MINIMO_BUSQUEDA,
      // Enlaces "Mapa" y "Lista" que conservan los filtros
      urlMapa: `/canchas?${parametros.toString()}`,
      urlLista: `/canchas?${parametros.toString()}${parametros.toString() ? '&' : ''}vista=lista`,
      recintosMapa: recintosParaMapa(canchas),
    });
  } catch (err) {
    return next(err);
  }
}

/** Fecha de hoy en Chile y los siguientes días: [{ fecha: 'AAAA-MM-DD', clave: 'lunes', etiqueta: 'lun 27 oct' }]. */
function proximosDias(cantidad) {
  const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: ZONA_HORARIA }).format(new Date());
  const [anio, mes, dia] = hoy.split('-').map(Number);
  const formato = new Intl.DateTimeFormat('es-CL', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
  return Array.from({ length: cantidad }, (_, i) => {
    const fecha = new Date(Date.UTC(anio, mes - 1, dia + i));
    const isodow = fecha.getUTCDay() === 0 ? 7 : fecha.getUTCDay();
    return {
      fecha: fecha.toISOString().slice(0, 10),
      clave: DIAS_SEMANA.find((d) => d.isodow === isodow).clave,
      etiqueta: i === 0 ? 'Hoy' : formato.format(fecha),
    };
  });
}

// GET /canchas/:id
async function ficha(req, res, next) {
  const idCancha = idValido(req.params.id);
  try {
    const cancha = idCancha ? await canchaModel.obtenerFichaCancha(idCancha) : null;
    if (!cancha) {
      return res.status(404).render('canchas/no-disponible', { titulo: 'Cancha no disponible', pagina: 'equipo' });
    }
    const [bloques, reservas] = await Promise.all([
      disponibilidadModel.listarBloques(idCancha),
      canchaModel.reservasConfirmadasProximas(idCancha, DIAS_DISPONIBILIDAD - 1),
    ]);
    // DE-006: horario semanal (días sin bloques = cerrado) y los próximos días con sus bloques ocupados.
    const horario = DIAS_SEMANA.map((d) => ({ ...d, bloques: bloques.filter((b) => b.dia === d.clave) }));
    const dias = proximosDias(DIAS_DISPONIBILIDAD).map((d) => ({
      ...d,
      abierto: horario.find((h) => h.clave === d.clave).bloques,
      ocupados: reservas.filter((r) => r.fecha === d.fecha),
    }));
    return res.render('canchas/ficha', {
      titulo: cancha.nombre,
      pagina: 'equipo',
      cancha,
      horario,
      dias,
    });
  } catch (err) {
    return next(err);
  }
}

module.exports = { listar, ficha };
