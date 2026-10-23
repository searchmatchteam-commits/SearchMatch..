// scripts/seed-canchas-osm.js
// Carga única de recintos de fútbol ARRENDABLES de la Región Metropolitana desde OpenStreetMap (Overpass API):
// complejos deportivos (leisure=sports_centre) y canchas que cobran (leisure=pitch + fee=yes) o cuyo nombre
// indica arriendo ("Complejo", "Sintética", "Baby", "F7", "Arriendo"). Las canchas de barrio quedan fuera.
// Búsqueda de rescate: además, cualquier lugar cuyo NOMBRE sugiera fútbol/arriendo aunque no tenga esas etiquetas
// (locales comerciales mal etiquetados), descartando colegios, lugares privados, calles y canchas de otros deportes.
// Crea por cada recinto: direccion → recinto_deportivo (con latitud/longitud) → cancha(s), igual que AD-001.
// El frontend NO llama a Overpass: el mapa sigue leyendo de la base.
//
// Uso:
//   node scripts/seed-canchas-osm.js              → simulación: consulta OSM y muestra qué insertaría (no escribe)
//   node scripts/seed-canchas-osm.js --confirmar  → inserta en la base (DATABASE_URL del .env), en UNA transacción
//
// Duplicados: se omite un recinto si ya existe uno con la misma referencia OSM (se guarda en direccion.referencias),
// a menos de 60 m, o con el mismo nombre en la misma comuna. Por eso se puede volver a ejecutar sin repetir datos.

const { pool } = require('../config/db');

const CONFIRMAR = process.argv.includes('--confirmar');

// Servidores públicos de Overpass (si uno falla o limita, se prueba el siguiente)
const SERVIDORES_OVERPASS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];
const REINTENTOS_POR_SERVIDOR = 3;

// Precio: se lee de las etiquetas charge/fee si traen un monto; si no, uno referencial (editable, AD-009)
const PRECIO_HORA_REFERENCIAL = 25000;
const PRECIO_HORA_VALIDO = { min: 1000, max: 1000000 };
const DISTANCIA_DUPLICADO_M = 60;   // recintos a menos de esto se consideran el mismo
const DISTANCIA_AGRUPAR_M = 250;    // canchas con el mismo nombre a menos de esto son un mismo recinto

// Palabras del nombre que indican un recinto de arriendo (regex de Overpass, sin distinguir mayúsculas)
const NOMBRE_COMPLEJO = 'f[uú]tbol|complejo|sint[eé]tic|baby|arriendo|f ?7';
const NOMBRE_CANCHA_ARRIENDO = 'complejo|sint[eé]tic|baby|arriendo|f ?7';
const NOMBRE_RESCATE = 'futbolito|complejo|sint[eé]tic|cancha|arriendo|f[uú]tbol';

// Búsqueda 1 = etiquetas de OSM; búsqueda 2 = solo por nombre. El paréntesis ( ...; ...; ) las une y Overpass
// entrega cada elemento una sola vez aunque calce con varias líneas. ["clave"!="valor"] deja pasar también a los
// elementos que no tienen esa clave (así se excluyen colegios y lugares privados sin exigir las etiquetas).
// Se busca UNA vez en toda la RM (->.todo) y luego se reparte por comuna: "nwr.todo(area.comuna)" solo filtra
// lo ya encontrado, así que es barato (repetir la búsqueda por nombre en cada comuna excede el tiempo de Overpass).
// Cada comuna sale seguida de sus recintos. "out bb": los polígonos traen su caja (centro = medio de la caja).
const CONSULTA = `
[out:json][timeout:600];
area["boundary"="administrative"]["admin_level"="4"]["name"~"Metropolitana"]->.rm;
(
  nwr["leisure"="sports_centre"]["sport"~"soccer"]["amenity"!="school"](area.rm);
  nwr["leisure"="sports_centre"]["name"~"${NOMBRE_COMPLEJO}",i]["amenity"!="school"](area.rm);
  nwr["leisure"="pitch"]["sport"~"soccer"]["fee"="yes"]["amenity"!="school"](area.rm);
  nwr["leisure"="pitch"]["sport"~"soccer"]["name"~"${NOMBRE_CANCHA_ARRIENDO}",i]["amenity"!="school"](area.rm);
  nw["name"~"${NOMBRE_RESCATE}",i]["amenity"!="school"]["access"!="private"](area.rm);
)->.todo;
rel["boundary"="administrative"]["admin_level"="8"](area.rm);
map_to_area->.comunas;
foreach.comunas->.comuna(
  .comuna out tags;
  nwr.todo(area.comuna);
  out bb tags;
);`;

const espera = (ms) => new Promise((resolver) => setTimeout(resolver, ms));

/** POST a Overpass con reintentos (429 = límite de uso, 504 = servidor ocupado) y cambio de servidor. */
async function consultarOverpass() {
  for (const servidor of SERVIDORES_OVERPASS) {
    for (let intento = 1; intento <= REINTENTOS_POR_SERVIDOR; intento += 1) {
      try {
        console.log(`🌐 Consultando ${servidor} (intento ${intento})...`);
        const respuesta = await fetch(servidor, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'SearchMatch-seed/1.0' },
          body: new URLSearchParams({ data: CONSULTA }),
          signal: AbortSignal.timeout(660000),
        });
        if (respuesta.ok) {
          const datos = await respuesta.json();
          // Si la consulta se corta (tiempo o memoria), Overpass responde 200 con datos PARCIALES y un "remark"
          if (!datos.remark) return datos;
          console.warn(`   ⚠️  Respuesta incompleta (${datos.remark.trim().slice(0, 120)}); reintento en ${20 * intento}s`);
          await espera(20000 * intento);
          continue;
        }
        if (respuesta.status !== 429 && respuesta.status < 500) {
          throw new Error(`Overpass respondió ${respuesta.status}: ${(await respuesta.text()).slice(0, 200)}`);
        }
        const segundos = Number(respuesta.headers.get('retry-after')) || 15 * intento;
        console.warn(`   ⏳ ${respuesta.status === 429 ? 'Límite de uso' : `Error ${respuesta.status}`}; reintento en ${segundos}s`);
        await espera(segundos * 1000);
      } catch (err) {
        if (err.message.startsWith('Overpass respondió')) throw err;
        console.warn(`   ⚠️  Error de red: ${err.message}; reintento en ${10 * intento}s`);
        await espera(10000 * intento);
      }
    }
  }
  throw new Error('Ningún servidor de Overpass respondió. Prueba de nuevo en unos minutos.');
}

/** "Ñuñoa" → "nunoa" (para comparar los nombres de OSM con la tabla comunas). */
const normalizar = (texto) => texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** Distancia aproximada en metros entre dos puntos (suficiente a escala de ciudad). */
function distanciaM(a, b) {
  const rad = Math.PI / 180;
  const x = (b.longitud - a.longitud) * rad * Math.cos(((a.latitud + b.latitud) / 2) * rad);
  const y = (b.latitud - a.latitud) * rad;
  return Math.sqrt(x * x + y * y) * 6371000;
}

/** Modalidad según el nombre ("fútbol 7", "baby") o el tamaño del polígono; por defecto Futbol 7. */
function estimarModalidad(tags, caja) {
  const nombre = normalizar(tags.name || '');
  const enNombre = nombre.match(/futbol\s*(5|7|11)\b|\bf\s*(5|7|11)\b/);
  if (enNombre) return Number(enNombre[1] || enNombre[2]);
  if (/baby|futbolito/.test(nombre)) return 5;
  if (caja) {
    const largo = Math.max(
      distanciaM({ latitud: caja.minlat, longitud: caja.minlon }, { latitud: caja.maxlat, longitud: caja.minlon }),
      distanciaM({ latitud: caja.minlat, longitud: caja.minlon }, { latitud: caja.minlat, longitud: caja.maxlon }),
    );
    if (largo >= 85) return 11;
    if (largo < 50) return 5;
  }
  return 7;
}

/** Monto por hora de las etiquetas charge/fee ("20000 CLP/hour", "$25.000"), o null si no traen uno. */
function precioOsm(tags) {
  for (const clave of ['charge:hour', 'charge', 'fee']) {
    const monto = (tags[clave] || '').match(/\d[\d.,]*/);
    const precio = monto && Number(monto[0].replace(/[.,]/g, ''));
    if (precio >= PRECIO_HORA_VALIDO.min && precio <= PRECIO_HORA_VALIDO.max) return precio;
  }
  return null;
}

/**
 * Basura típica de la búsqueda por nombre: calles y paraderos ("Pasaje La Cancha"), estacionamientos,
 * barrios o industrias ("Complejo Industrial") y canchas de otros deportes ("Cancha de Tenis").
 */
function noEsCancha(tags) {
  if (tags.highway || tags.railway || tags.public_transport || tags.place) return true;
  if (['parking', 'parking_entrance', 'school', 'college', 'university'].includes(tags.amenity)) return true;
  if (['residential', 'industrial', 'commercial', 'retail'].includes(tags.landuse) || tags.leisure === 'golf_course') return true;
  if (tags.access === 'private' || tags.fee === 'no') return true; // gratis o privado: no se arrienda
  return Boolean(tags.sport) && !/soccer|futsal|multi/.test(tags.sport);
}

/** Recorre la respuesta (comuna, sus elementos, comuna, ...) y arma una lista de complejos y canchas con su comuna. */
function leerCanchas(elementos) {
  const canchas = [];
  const vistas = new Set();
  let comuna = null;
  for (const el of elementos) {
    if (el.type === 'area') {
      comuna = el.tags.name;
      continue;
    }
    const latitud = el.lat ?? (el.bounds && (el.bounds.minlat + el.bounds.maxlat) / 2);
    const longitud = el.lon ?? (el.bounds && (el.bounds.minlon + el.bounds.maxlon) / 2);
    const osm = `${el.type}/${el.id}`;
    if (latitud === undefined || vistas.has(osm)) continue; // una cancha en el borde puede salir en dos comunas
    vistas.add(osm);
    const tags = el.tags || {};
    if (noEsCancha(tags)) continue;
    const telefono = (tags.phone || tags['contact:phone'] || '').split(';')[0].trim();
    canchas.push({
      osm,
      rescate: !['sports_centre', 'pitch'].includes(tags.leisure) || (tags.leisure === 'pitch' && tags.fee !== 'yes'
        && !new RegExp(NOMBRE_CANCHA_ARRIENDO, 'i').test(tags.name || '')),
      complejo: tags.leisure === 'sports_centre',
      caja: el.bounds,
      comuna,
      latitud,
      longitud,
      nombre: (tags.name || '').trim(),
      sintetica: tags.surface === 'artificial_turf',
      calle: (tags['addr:street'] || '').trim(),
      numero: (tags['addr:housenumber'] || '').trim().slice(0, 20),
      telefono: telefono.length <= 20 ? telefono : '',
      // La caja de un complejo es la de todo el recinto, no sirve para estimar la cancha
      jugadores: estimarModalidad(tags, tags.leisure === 'sports_centre' ? null : el.bounds),
      precio: precioOsm(tags),
    });
  }
  return canchas;
}

/** ¿El punto cae dentro de la caja del complejo? */
const dentroDe = (caja, punto) => caja && punto.latitud >= caja.minlat && punto.latitud <= caja.maxlat
  && punto.longitud >= caja.minlon && punto.longitud <= caja.maxlon;

/**
 * Cada complejo es un recinto y se queda con las canchas que están dentro de él.
 * Las canchas sueltas se juntan si tienen el mismo nombre y están cerca; las sin nombre van solas.
 */
function agruparEnRecintos(elementos) {
  const recintos = [];
  // Complejos primero, para que sus canchas se les asignen
  const ordenados = [...elementos].sort((a, b) => Number(b.complejo) - Number(a.complejo));
  for (const cancha of ordenados) {
    const recinto = cancha.complejo ? null : recintos.find((r) => r.comuna === cancha.comuna && (
      dentroDe(r.caja, cancha)
      || (cancha.nombre && r.nombre === cancha.nombre && distanciaM(r, cancha) <= DISTANCIA_AGRUPAR_M)));
    if (recinto) {
      if (recinto.soloComplejo) recinto.canchas = []; // el complejo deja de contar como cancha propia
      recinto.soloComplejo = false;
      recinto.canchas.push({ ...cancha, precio: cancha.precio ?? recinto.precio }); // hereda el precio del complejo
    } else {
      const generico = cancha.complejo ? 'Complejo Deportivo' : cancha.sintetica ? 'Cancha Sintética' : 'Cancha de Fútbol';
      recintos.push({
        nombre: (cancha.nombre || `${generico} ${cancha.comuna}`).slice(0, 150),
        comuna: cancha.comuna,
        latitud: cancha.latitud,
        longitud: cancha.longitud,
        osm: cancha.osm,
        caja: cancha.complejo ? cancha.caja : null,
        soloComplejo: cancha.complejo, // sin canchas propias en OSM: se crea "Cancha 1" con sus datos
        conNombre: Boolean(cancha.nombre), // los nombres genéricos no cuentan para detectar duplicados
        calle: cancha.calle || 'Dirección no informada en OpenStreetMap',
        numero: cancha.numero,
        telefono: cancha.telefono,
        precio: cancha.precio,
        canchas: [cancha],
      });
    }
  }
  // Nombres de cancha únicos dentro del recinto (índice ux_cancha_nombre_por_recinto)
  for (const recinto of recintos) {
    recinto.canchas.forEach((cancha, i) => {
      cancha.nombreCancha = recinto.canchas.length === 1 ? 'Cancha 1' : `Cancha ${i + 1}`;
    });
  }
  return recintos;
}

async function sembrar() {
  const { elements: elementos } = await consultarOverpass();
  const canchas = leerCanchas(elementos);
  const recintos = agruparEnRecintos(canchas);
  const complejos = canchas.filter((c) => c.complejo).length;
  const rescatados = canchas.filter((c) => c.rescate).length;
  console.log(`📍 OSM: ${complejos} complejos y ${canchas.length - complejos} canchas (${rescatados} solo por nombre) → ${recintos.length} recintos.`);

  const cliente = await pool.connect();
  try {
    // Comunas y modalidades de la base
    const comunas = new Map((await cliente.query(
      `SELECT c.id, c.nombre FROM comunas c JOIN region r ON r.id = c.id_region
        WHERE r.nombre ILIKE '%Metropolitana%'`
    )).rows.map((c) => [normalizar(c.nombre), c.id]));
    const modalidades = new Map((await cliente.query('SELECT id, cantidad_de_jugadores FROM modalidad')).rows
      .map((m) => [m.cantidad_de_jugadores, m.id]));

    // Recintos existentes, para no duplicar
    const existentes = (await cliente.query(
      `SELECT rd.nombre, rd.latitud, rd.longitud, d.referencias, d.id_comunas
         FROM recinto_deportivo rd JOIN direccion d ON d.id = rd.id_direccion`
    )).rows.map((r) => ({ ...r, latitud: Number(r.latitud), longitud: Number(r.longitud) }));

    const omitidos = { comuna: 0, duplicado: 0 };
    const nuevos = [];
    for (const recinto of recintos) {
      const idComuna = comunas.get(normalizar(recinto.comuna || ''));
      if (!idComuna) { omitidos.comuna += 1; continue; }
      const referencia = `OpenStreetMap ${recinto.osm}`;
      const repetido = [...existentes, ...nuevos].some((e) =>
        e.referencias === referencia
        || (e.latitud && distanciaM(e, recinto) <= DISTANCIA_DUPLICADO_M)
        || (recinto.conNombre && e.id_comunas === idComuna && normalizar(e.nombre) === normalizar(recinto.nombre)));
      if (repetido) { omitidos.duplicado += 1; continue; }
      nuevos.push({ ...recinto, id_comunas: idComuna, referencias: referencia });
    }

    const totalCanchas = nuevos.reduce((suma, r) => suma + r.canchas.length, 0);
    console.log(`➕ Nuevos: ${nuevos.length} recintos con ${totalCanchas} canchas.`);
    console.log(`⏭️  Omitidos: ${omitidos.duplicado} ya existían · ${omitidos.comuna} sin comuna reconocida.`);

    if (!CONFIRMAR) {
      console.table(nuevos.slice(0, 15).map((r) => ({
        recinto: r.nombre, comuna: r.comuna, canchas: r.canchas.length,
        modalidades: r.canchas.map((c) => `F${c.jugadores}`).join(' '),
        precios: r.canchas.map((c) => (c.precio ? `$${c.precio}` : 'ref.')).join(' '),
      })));
      console.log('ℹ️  Simulación: no se escribió nada. Ejecuta con --confirmar para insertar.');
      return;
    }

    await cliente.query('BEGIN');
    for (const r of nuevos) {
      // Un viaje a la base por recinto: dirección → recinto → canchas
      await cliente.query(
        `WITH d AS (
           INSERT INTO direccion (calle, numero, referencias, id_comunas) VALUES ($1, $2, $3, $4) RETURNING id
         ), rd AS (
           INSERT INTO recinto_deportivo (nombre, telefono, latitud, longitud, activo, id_direccion)
           SELECT $5, $6, $7, $8, TRUE, d.id FROM d RETURNING id
         )
         INSERT INTO cancha (nombre, precio_hora, activo, id_recinto_deportivo, id_modalidad)
         SELECT c.nombre, c.precio, TRUE, rd.id, c.id_modalidad
           FROM rd, unnest($9::text[], $10::numeric[], $11::int[]) AS c(nombre, precio, id_modalidad)`,
        [
          r.calle.slice(0, 150), r.numero || null, r.referencias, r.id_comunas,
          r.nombre, r.telefono || null, r.latitud, r.longitud,
          r.canchas.map((c) => c.nombreCancha),
          r.canchas.map((c) => c.precio ?? PRECIO_HORA_REFERENCIAL),
          r.canchas.map((c) => modalidades.get(c.jugadores) ?? modalidades.get(7)),
        ]
      );
    }
    await cliente.query('COMMIT');
    console.log(`✅ Insertados ${nuevos.length} recintos y ${totalCanchas} canchas.`);
  } catch (err) {
    await cliente.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    cliente.release();
  }
}

sembrar()
  .catch((err) => {
    console.error('❌ No se completó la carga (la base quedó como estaba):', err.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
