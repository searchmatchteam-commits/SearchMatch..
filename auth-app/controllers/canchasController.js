const canchaModel = require('../models/canchaModel');
const disponibilidadModel = require('../models/disponibilidadModel');
const ubicacionModel = require('../models/ubicacionModel');
const { idValido } = require('../middlewares/validadoresAdmin');
const {
  DIAS_SEMANA, LARGO_MINIMO_BUSQUEDA, CANCHAS_POR_LOTE, DIAS_DISPONIBILIDAD, ZONA_HORARIA, franjasDelDia,
} = require('../config/canchas');
const { cacheBreve } = require('../config/cacheBreve');

// /canchas sin filtros: catálogo público e igual para todos. Son más de mil filas, lo más pesado del dock.
// Un cambio del panel se ve aquí en un par de minutos; la ficha de cada cancha y las búsquedas con filtros son en vivo.
const PLAZO_CATALOGO_MS = 60 * 1000;
const leerRegiones = cacheBreve(PLAZO_CATALOGO_MS, () => ubicacionModel.listarRegionesConComunas());
const leerModalidades = cacheBreve(PLAZO_CATALOGO_MS, () => canchaModel.listarModalidades());
const leerHayCanchas = cacheBreve(PLAZO_CATALOGO_MS, () => canchaModel.hayCanchasVisibles());
const leerCanchasSinFiltros = cacheBreve(PLAZO_CATALOGO_MS, () => canchaModel.buscarCanchas());

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

/**
 * Recintos del mapa en formato compacto (con miles de recintos pesa menos de la mitad que los objetos):
 *   { m: [modalidades], c: [comunas], r: [[lat, lon, nombre, dirección, iComuna, id, nombre, iModalidad, precio, ...]] }
 * Cada recinto lleva sus canchas en fila de a 4 valores; comunas y modalidades van una sola vez y se citan por
 * índice. Las coordenadas se redondean a 5 decimales (~1 m). Lo arma de vuelta canchas-mapa.js.
 * Va como texto JSON listo para un <script type="application/json"> (sin "<" que cierre la etiqueta).
 */
function mapaCompacto(recintos) {
  const indices = { m: new Map(), c: new Map() };
  const indice = (tipo, valor) => {
    if (!indices[tipo].has(valor)) indices[tipo].set(valor, indices[tipo].size);
    return indices[tipo].get(valor);
  };
  const redondear = (n) => Math.round(n * 1e5) / 1e5;
  const r = recintos.map((recinto) => [
    redondear(recinto.latitud), redondear(recinto.longitud), recinto.nombre, recinto.direccion, indice('c', recinto.comuna),
    ...recinto.canchas.flatMap((cancha) => [cancha.id, cancha.nombre, indice('m', cancha.modalidad), cancha.precio]),
  ]);
  return JSON.stringify({ m: [...indices.m.keys()], c: [...indices.c.keys()], r }).replace(/</g, '\\u003c');
}

// El mapa sin filtros (todo Chile) se arma y serializa una vez por plazo, no en cada visita.
const leerMapaSinFiltros = cacheBreve(PLAZO_CATALOGO_MS, async () => {
  const recintos = recintosParaMapa(await leerCanchasSinFiltros());
  return { total: recintos.length, json: mapaCompacto(recintos) };
});

async function listar(req, res, next) {
  const filtros = leerFiltros(req.query);
  try {
    // Las tarjetas solo se dibujan con al menos un filtro aplicado (un texto muy corto no cuenta).
    const conFiltros = () => Boolean(filtros.texto || filtros.idRegion || filtros.idComuna || filtros.idModalidad);
    // Sin filtros la lista no muestra tarjetas: solo el mapa necesita la búsqueda completa.
    const buscarCanchas = () => {
      if (conFiltros()) return canchaModel.buscarCanchas(filtros);
      return filtros.vista === 'mapa' ? leerCanchasSinFiltros() : [];
    };
    // Solo la comuna depende de las regiones: sin ella, la búsqueda va junto con el resto de las consultas.
    const [regiones, modalidades, hayCanchas, canchasSinComuna] = await Promise.all([
      leerRegiones(),
      leerModalidades(),
      leerHayCanchas(),
      filtros.idComuna ? null : buscarCanchas(),
    ]);
    if (filtros.idComuna && filtros.idRegion) {
      const region = regiones.find((r) => r.id === filtros.idRegion);
      if (!region || !region.comunas.some((c) => c.id === filtros.idComuna)) filtros.idComuna = null;
    }
    const canchas = canchasSinComuna || await buscarCanchas();
    const hayFiltrosActivos = conFiltros();
    let mapa = null;
    if (filtros.vista === 'mapa' && req.query.parcial !== '1') {
      if (hayFiltrosActivos) {
        const recintos = recintosParaMapa(canchas);
        mapa = { total: recintos.length, json: mapaCompacto(recintos) };
      } else {
        mapa = await leerMapaSinFiltros();
      }
    }

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
      mapa,
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

/** Minutos transcurridos hoy en Chile (para no ofrecer franjas que ya empezaron). */
function minutoActualChile() {
  const [h, m] = new Intl.DateTimeFormat('en-GB', { timeZone: ZONA_HORARIA, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .format(new Date()).split(':').map(Number);
  return h * 60 + m;
}

async function ficha(req, res, next) {
  const idCancha = idValido(req.params.id);
  try {
    const cancha = idCancha ? await canchaModel.obtenerFichaCancha(idCancha) : null;
    if (!cancha) {
      return res.status(404).render('canchas/no-disponible', { titulo: 'Cancha no disponible', pagina: 'equipo' });
    }
    const [{ bloques, referencial }, reservas] = await Promise.all([
      disponibilidadModel.horarioPublico(idCancha),
      canchaModel.reservasConfirmadasProximas(idCancha, DIAS_DISPONIBILIDAD - 1),
    ]);
    const horario = DIAS_SEMANA.map((d) => ({ ...d, bloques: bloques.filter((b) => b.dia === d.clave) }));
    const minuto = minutoActualChile();
    const dias = proximosDias(DIAS_DISPONIBILIDAD).map((d, i) => {
      const abierto = horario.find((h) => h.clave === d.clave).bloques;
      const ocupados = reservas.filter((r) => r.fecha === d.fecha);
      const franjas = franjasDelDia(abierto, ocupados, i === 0 ? minuto : null);
      return { ...d, abierto, ocupados, franjas, libres: franjas.filter((f) => f.estado === 'libre').length };
    });
    return res.render('canchas/ficha', {
      titulo: cancha.nombre,
      pagina: 'equipo',
      cancha,
      horario,
      referencial,
      dias,
    });
  } catch (err) {
    return next(err);
  }
}

module.exports = { listar, ficha, recintosParaMapa, mapaCompacto, proximosDias, minutoActualChile };
