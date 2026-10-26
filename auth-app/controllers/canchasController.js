const canchaModel = require('../models/canchaModel');
const disponibilidadModel = require('../models/disponibilidadModel');
const ubicacionModel = require('../models/ubicacionModel');
const { idValido } = require('../middlewares/validadoresAdmin');
const { DIAS_SEMANA, LARGO_MINIMO_BUSQUEDA, CANCHAS_POR_LOTE, DIAS_DISPONIBILIDAD, ZONA_HORARIA } = require('../config/canchas');

/** Entero >= 0 de la URL (desde / mostrar); cualquier otra cosa da 0. */
function enteroNoNegativo(valor) {
  const numero = Number.parseInt(valor, 10);
  return Number.isInteger(numero) && numero > 0 ? numero : 0;
}

function leerFiltros(query) {
  const textoIngresado = String(query.texto || '').trim().slice(0, 100);
  return {
    textoIngresado,
    texto: textoIngresado.length >= LARGO_MINIMO_BUSQUEDA ? textoIngresado : '',
    terminoCorto: textoIngresado.length > 0 && textoIngresado.length < LARGO_MINIMO_BUSQUEDA,
    idRegion: idValido(query.id_region),
    idComuna: idValido(query.id_comuna),
    idModalidad: idValido(query.id_modalidad),
    vista: query.vista === 'lista' ? 'lista' : 'mapa',
  };
}

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

async function listar(req, res, next) {
  const filtros = leerFiltros(req.query);
  try {
    const [regiones, modalidades] = await Promise.all([
      ubicacionModel.listarRegionesConComunas(),
      canchaModel.listarModalidades(),
    ]);
    if (filtros.idComuna && filtros.idRegion) {
      const region = regiones.find((r) => r.id === filtros.idRegion);
      if (!region || !region.comunas.some((c) => c.id === filtros.idComuna)) filtros.idComuna = null;
    }
    // Las tarjetas solo se dibujan con al menos un filtro aplicado (un texto muy corto no cuenta).
    const hayFiltrosActivos = Boolean(filtros.texto || filtros.idRegion || filtros.idComuna || filtros.idModalidad);
    // Sin filtros la lista no muestra tarjetas: solo el mapa necesita la búsqueda completa.
    const buscar = hayFiltrosActivos || filtros.vista === 'mapa';
    const [canchas, hayCanchas] = await Promise.all([
      buscar ? canchaModel.buscarCanchas(filtros) : [],
      canchaModel.hayCanchasVisibles(),
    ]);

    // "Cargar más canchas" con JavaScript: devuelve solo el siguiente lote de tarjetas (sin la página).
    if (req.query.parcial === '1') {
      const desde = enteroNoNegativo(req.query.desde);
      const lote = hayFiltrosActivos ? canchas.slice(desde, desde + CANCHAS_POR_LOTE) : [];
      return res.render('canchas/_tarjetas', { canchas: lote, inicio: desde });
    }

    const parametros = new URLSearchParams();
    ['textoIngresado:texto', 'idRegion:id_region', 'idComuna:id_comuna', 'idModalidad:id_modalidad'].forEach((par) => {
      const [clave, nombre] = par.split(':');
      if (filtros[clave]) parametros.set(nombre, filtros[clave]);
    });

    // Sin JavaScript, "Cargar más" recarga la página con ?mostrar=N (siempre en múltiplos del lote).
    const mostrar = Math.max(CANCHAS_POR_LOTE, Math.ceil(enteroNoNegativo(req.query.mostrar) / CANCHAS_POR_LOTE) * CANCHAS_POR_LOTE);
    const visibles = hayFiltrosActivos ? canchas.slice(0, mostrar) : [];
    const parametrosMas = new URLSearchParams(parametros);
    parametrosMas.set('vista', filtros.vista);
    parametrosMas.set('mostrar', visibles.length + CANCHAS_POR_LOTE);

    return res.render('canchas/index', {
      titulo: 'Canchas',
      pagina: 'equipo',
      canchas,
      visibles,
      totalCanchas: canchas.length,
      porLote: CANCHAS_POR_LOTE,
      hayFiltrosActivos,
      // El ancla #tarjeta-N deja la vista en la primera tarjeta nueva
      urlMas: `/canchas?${parametrosMas.toString()}#tarjeta-${visibles.length + 1}`,
      hayCanchas,
      regiones,
      modalidades,
      filtros,
      hayFiltros: Boolean(filtros.textoIngresado || filtros.idRegion || filtros.idComuna || filtros.idModalidad),
      largoMinimo: LARGO_MINIMO_BUSQUEDA,
      urlMapa: `/canchas?${parametros.toString()}`,
      urlLista: `/canchas?${parametros.toString()}${parametros.toString() ? '&' : ''}vista=lista`,
      recintosMapa: recintosParaMapa(canchas),
    });
  } catch (err) {
    return next(err);
  }
}

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
