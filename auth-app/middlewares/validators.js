// middlewares/validators.js
// Validación en el servidor de los formularios de registro y login.
// Si hay errores, re-renderiza la vista con los mensajes y los datos ya escritos
// (nunca las contraseñas). Si todo está bien, deja los datos limpios en
// req.datosFormulario para el controlador.

// Expresión regular sencilla para validar un correo.
const REGEX_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// Celular chileno: 9 + 8 dígitos, con o sin +56 delante.
const REGEX_CELULAR_CL = /^(?:\+?56)?(9\d{8})$/;

const { POSICIONES, NIVELES, ESTADISTICAS, STAT_RANGO } = require('../config/perfilJugador');
const { MODALIDADES } = require('../config/equipo');
const cuentaModel = require('../models/cuentaModel');

const LONGITUD_MINIMA_PASSWORD = 8;
const LONGITUD_MAXIMA_NOMBRE = 100; // jugador.nombre_apodo / jugador.apellido
const LONGITUD_MAXIMA_APODO = 20; // jugador.apodo (lo que cabe en la carta)
const LONGITUD_MAXIMA_CORREO = 150; // usuario.correo / equipo.correo_contacto
const LONGITUD_MAXIMA_ZONA = 100; // equipo.zona
const LONGITUD_MAXIMA_MENSAJE_DESAFIO = 200; // lo que escribe el capitán en desafio.mensaje
const LONGITUD_MAXIMA_MENSAJE_SOLICITUD = 200; // solicitud_union_equipo.mensaje (sección Z de sql/seed.sql)
const DIAS_MAXIMOS_DESAFIO = 365; // la fecha tentativa no puede estar a más de un año

// Rango de edad aceptado al registrarse (jugador.fecha_nacimiento).
const EDAD_MINIMA = 18;
const EDAD_MAXIMA = 100;

// Rangos aceptados en el perfil deportivo.
const ALTURA_CM = { min: 120, max: 230 };
const PESO_KG = { min: 35, max: 200 };

/**
 * Edad en años cumplidos a partir de una fecha "AAAA-MM-DD" (la que envía <input type="date">).
 * @returns {number|null} La edad, o null si la fecha no existe (ej: 2024-02-30) o tiene otro formato.
 */
function calcularEdad(valor) {
  const partes = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valor);
  if (!partes) return null;
  const [anio, mes, dia] = partes.slice(1).map(Number);

  // Date corrige fechas imposibles (30 de febrero → 1 de marzo): si cambió, no existe.
  const fecha = new Date(Date.UTC(anio, mes - 1, dia));
  if (fecha.getUTCFullYear() !== anio || fecha.getUTCMonth() !== mes - 1 || fecha.getUTCDate() !== dia) {
    return null;
  }

  const hoy = new Date();
  let edad = hoy.getFullYear() - anio;
  // Aún no cumple años este año
  if (hoy.getMonth() + 1 < mes || (hoy.getMonth() + 1 === mes && hoy.getDate() < dia)) edad -= 1;
  return edad;
}

/**
 * Valida la fecha de nacimiento (obligatoria, real y con edad entre EDAD_MINIMA y EDAD_MAXIMA).
 * @returns {string|null} El mensaje de error o null si es válida.
 */
function validarFechaNacimiento(fechaNacimiento) {
  const edad = calcularEdad(fechaNacimiento);
  if (!fechaNacimiento) return 'La fecha de nacimiento es obligatoria.';
  if (edad === null) return 'La fecha de nacimiento no es válida.';
  if (edad < 0) return 'La fecha de nacimiento no puede estar en el futuro.';
  if (edad < EDAD_MINIMA) return `Debes tener al menos ${EDAD_MINIMA} años para registrarte.`;
  if (edad > EDAD_MAXIMA) return 'Revisa la fecha de nacimiento: el año parece incorrecto.';
  return null;
}

/**
 * Convierte un número entero dentro de [min, max]; acepta coma decimal ("70,5" → 71).
 * @returns {number|null} El número redondeado, o null si no es válido o está fuera de rango.
 */
function enteroEnRango(valor, { min, max }) {
  const numero = Math.round(Number(String(valor || '').trim().replace(',', '.')));
  if (!String(valor || '').trim() || !Number.isFinite(numero) || numero < min || numero > max) return null;
  return numero;
}

/**
 * Normaliza un teléfono chileno a "+569XXXXXXXX".
 * Acepta espacios, guiones y paréntesis: "+56 9 1234 5678", "9 1234-5678"...
 * @returns {string|null} El número normalizado o null si no es válido.
 */
function normalizarTelefono(valor) {
  const limpio = String(valor || '').replace(/[\s\-().]/g, '');
  const coincidencia = limpio.match(REGEX_CELULAR_CL);
  return coincidencia ? `+56${coincidencia[1]}` : null;
}

/**
 * CORRECCIÓN: contraseña segura (la pantalla ya pedía "letras y números", pero solo se revisaba el largo).
 * Regla única de la plataforma: la usan el registro, recuperar contraseña (AR-008) y cambiarla (AR-009).
 * @returns {string|null} El mensaje de error o null si cumple.
 */
function errorPasswordSegura(password) {
  if (!password) return 'La contraseña es obligatoria.';
  if (password.length < LONGITUD_MINIMA_PASSWORD) return `La contraseña debe tener al menos ${LONGITUD_MINIMA_PASSWORD} caracteres.`;
  if (!/[A-Za-zÁÉÍÓÚÑáéíóúñ]/.test(password) || !/\d/.test(password)) {
    return 'La contraseña debe combinar letras y números.';
  }
  return null;
}

/**
 * Valida el formulario de REGISTRO.
 */
async function validarRegistro(req, res, next) {
  const nombre = (req.body.nombre || '').trim();
  const apellido = (req.body.apellido || '').trim();
  const correo = (req.body.correo || '').trim().toLowerCase();
  const correoSecundario = (req.body.correo_secundario || '').trim().toLowerCase();
  const telefonoIngresado = (req.body.telefono || '').trim();
  const fechaNacimiento = (req.body.fecha_nacimiento || '').trim();
  const password = req.body.password || '';
  const confirmarPassword = req.body.confirmar_password || '';

  const errores = [];

  if (!nombre) {
    errores.push('El nombre es obligatorio.');
  } else if (nombre.length > LONGITUD_MAXIMA_NOMBRE) {
    errores.push(`El nombre no puede superar los ${LONGITUD_MAXIMA_NOMBRE} caracteres.`);
  }

  if (!apellido) {
    errores.push('El apellido es obligatorio.');
  } else if (apellido.length > LONGITUD_MAXIMA_NOMBRE) {
    errores.push(`El apellido no puede superar los ${LONGITUD_MAXIMA_NOMBRE} caracteres.`);
  }

  if (!correo) {
    errores.push('El correo es obligatorio.');
  } else if (!REGEX_CORREO.test(correo) || correo.length > LONGITUD_MAXIMA_CORREO) {
    errores.push('El formato del correo no es válido.');
  }

  // AR-001 — correo secundario opcional: formato, distinto del principal y libre en otras cuentas.
  if (correoSecundario) {
    if (!REGEX_CORREO.test(correoSecundario) || correoSecundario.length > LONGITUD_MAXIMA_CORREO) {
      errores.push('El formato del correo secundario no es válido.');
    } else if (correoSecundario === correo) {
      errores.push('El correo secundario debe ser distinto del principal.');
    } else {
      try {
        if (await cuentaModel.correoUsadoPorOtraCuenta(correoSecundario, null)) {
          errores.push('El correo secundario ya está registrado en otra cuenta.');
        }
      } catch (err) {
        return next(err);
      }
    }
  }

  const telefono = normalizarTelefono(telefonoIngresado);
  if (!telefonoIngresado) {
    errores.push('El teléfono es obligatorio.');
  } else if (!telefono) {
    errores.push('El teléfono debe ser un celular chileno, por ejemplo +56 9 1234 5678.');
  }

  const errorFecha = validarFechaNacimiento(fechaNacimiento);
  if (errorFecha) errores.push(errorFecha);

  const errorPassword = errorPasswordSegura(password); // CORRECCIÓN: contraseña segura
  if (errorPassword) errores.push(errorPassword);

  if (password && confirmarPassword !== password) {
    errores.push('Las contraseñas no coinciden.');
  }

  // NUEVO: AR-011 — sin aceptar los términos y la privacidad no se crea la cuenta.
  const aceptoTerminos = req.body.acepto_terminos === 'si';
  if (!aceptoTerminos) errores.push('Debes aceptar los términos y condiciones y la política de privacidad.');

  // Valores para el controlador (teléfono ya normalizado) y para re-pintar el formulario.
  req.datosFormulario = { nombre, apellido, correo, correoSecundario: correoSecundario || null, telefono, fechaNacimiento };
  const datos = {
    nombre,
    apellido,
    correo,
    correo_secundario: correoSecundario,
    telefono: telefonoIngresado,
    fecha_nacimiento: fechaNacimiento,
    acepto_terminos: aceptoTerminos, // NUEVO: AR-011 (la casilla sigue marcada si hay otros errores)
  };

  if (errores.length > 0) {
    return res.status(400).render('registro', {
      pagina: 'auth',
      titulo: 'Crear cuenta',
      errores,
      datos,
    });
  }

  return next();
}

/**
 * Valida el formulario de LOGIN (campos obligatorios y formato del correo).
 */
function validarLogin(req, res, next) {
  const correo = (req.body.correo || '').trim().toLowerCase();
  const password = req.body.password || '';

  const errores = [];

  if (!correo) {
    errores.push('El correo es obligatorio.');
  } else if (!REGEX_CORREO.test(correo)) {
    errores.push('El formato del correo no es válido.');
  }

  if (!password) {
    errores.push('La contraseña es obligatoria.');
  }

  req.datosFormulario = { correo };

  if (errores.length > 0) {
    return res.status(400).render('login', {
      pagina: 'auth',
      titulo: 'Iniciar sesión',
      errores,
      datos: req.datosFormulario,
      aviso: null,
    });
  }

  return next();
}

/**
 * Limpia y valida los datos del perfil deportivo (los comparten el wizard y el editor).
 * Nombre y apellido no van aquí: se piden solo al crear la cuenta (validarRegistro).
 * @returns {{ datos: object, paso2: string[], paso3: string[] }}
 *          paso2 = errores de datos personales, paso3 = errores del perfil deportivo.
 */
function revisarDatosPerfil(body) {
  // Lo único que muestra la carta como nombre; espacios repetidos se juntan (va en una sola línea)
  const apodo = (body.apodo || '').trim().replace(/\s+/g, ' ');
  const fechaNacimiento = (body.fecha_nacimiento || '').trim();
  const altura = enteroEnRango(body.altura, ALTURA_CM);
  const peso = enteroEnRango(body.peso, PESO_KG);
  // Casillas "posicion": urlencoded entrega un texto (una marcada) o un arreglo (varias).
  const posicionesEnviadas = [].concat(body.posicion || []);
  // Orden del catálogo, sin repetidas: la primera es la principal (la que muestra la carta).
  const posiciones = Object.keys(POSICIONES).filter((clave) => posicionesEnviadas.includes(clave));

  const paso2 = [];
  const paso3 = [];

  if (!apodo) paso2.push('El apodo es obligatorio: es el nombre que aparece en tu carta.');
  else if (apodo.length > LONGITUD_MAXIMA_APODO) paso2.push(`El apodo no puede superar los ${LONGITUD_MAXIMA_APODO} caracteres.`);

  const errorFecha = validarFechaNacimiento(fechaNacimiento);
  if (errorFecha) paso2.push(errorFecha);

  if (altura === null) paso2.push(`La altura debe estar entre ${ALTURA_CM.min} y ${ALTURA_CM.max} cm.`);
  if (peso === null) paso2.push(`El peso debe estar entre ${PESO_KG.min} y ${PESO_KG.max} kg.`);

  if (posiciones.length === 0 || posiciones.length !== new Set(posicionesEnviadas).size) {
    paso3.push('Elige al menos una posición en la cancha.');
  }

  return { datos: { apodo, fechaNacimiento, altura, peso, posiciones }, paso2, paso3 };
}

// Roles del paso 4 del wizard de jugador: "capitan" agrega el paso 5 (crear equipo).
const ROLES_WIZARD = ['jugador', 'capitan'];

/**
 * Valida el wizard de PERFIL DE JUGADOR (pasos 2 a 5).
 *  2 datos personales · 3 perfil deportivo · 4 rol (jugador o capitán) · 5 crear equipo (solo capitán).
 * No corta la petición: deja los datos limpios en req.datosFormulario (con .rol y .equipo) y los
 * errores en req.erroresPerfil = { errores: [...], paso } (paso = el primero con error),
 * para que jugadorController vuelva a pintar el wizard en ese paso.
 */
function validarPerfilJugador(req, res, next) {
  const { datos, paso2, paso3 } = revisarDatosPerfil(req.body);
  const rol = ROLES_WIZARD.includes(req.body.rol) ? req.body.rol : null;
  const paso4 = rol ? [] : ['Elige si te registras como jugador o como capitán.'];
  // El correo y la zona del equipo los completa jugadorController (correo de la cuenta y nombre de la comuna).
  const equipo = rol === 'capitan' ? revisarDatosEquipo(req.body, { conContacto: false }) : null;
  const paso5 = equipo ? [...equipo.paso1, ...equipo.paso2] : [];

  req.datosFormulario = { ...datos, rol, equipo: equipo ? equipo.datos : null };
  const porPaso = [[2, paso2], [3, paso3], [4, paso4], [5, paso5]];
  const primero = porPaso.find(([, errores]) => errores.length > 0);
  req.erroresPerfil = {
    errores: porPaso.flatMap(([, errores]) => errores),
    paso: primero ? primero[0] : 2,
  };
  return next();
}

/**
 * Valida el EDITOR DE PERFIL (/perfil/editar): los datos del wizard más las
 * 6 estadísticas (stat_ritmo, stat_tiro... entre STAT_RANGO.min y STAT_RANGO.max).
 * No corta la petición: deja req.datosFormulario (con .stats) y req.erroresPerfil = { errores }.
 * Las estadísticas inválidas quedan en null para que el editor re-pinte lo que había.
 */
function validarEdicionPerfil(req, res, next) {
  const { datos, paso2, paso3 } = revisarDatosPerfil(req.body);
  const erroresStats = [];
  const stats = {};

  // PE-002: nombre y apellido también se editan aquí (obligatorios, máx. LONGITUD_MAXIMA_NOMBRE).
  const nombre = (req.body.nombre || '').trim().replace(/\s+/g, ' ');
  const apellido = (req.body.apellido || '').trim().replace(/\s+/g, ' ');
  const erroresNombre = [];
  if (!nombre) erroresNombre.push('El nombre es obligatorio.');
  else if (nombre.length > LONGITUD_MAXIMA_NOMBRE) erroresNombre.push(`El nombre no puede superar los ${LONGITUD_MAXIMA_NOMBRE} caracteres.`);
  if (!apellido) erroresNombre.push('El apellido es obligatorio.');
  else if (apellido.length > LONGITUD_MAXIMA_NOMBRE) erroresNombre.push(`El apellido no puede superar los ${LONGITUD_MAXIMA_NOMBRE} caracteres.`);

  ESTADISTICAS.forEach(({ clave, nombre }) => {
    stats[clave] = enteroEnRango(req.body[`stat_${clave}`], STAT_RANGO);
    if (stats[clave] === null) erroresStats.push(`${nombre} debe estar entre ${STAT_RANGO.min} y ${STAT_RANGO.max}.`);
  });

  req.datosFormulario = { ...datos, nombre, apellido, stats };
  req.erroresPerfil = { errores: [...erroresNombre, ...paso2, ...paso3, ...erroresStats] };
  return next();
}

/**
 * Valida el wizard de CREAR EQUIPO (paso 1: nombre y correo; paso 2: nivel, zona y tipo de fútbol).
 * No corta la petición: deja los datos limpios en req.datosFormulario y los errores en
 * req.erroresEquipo = { errores: [...], paso } (paso = el primero con error),
 * para que equipoController vuelva a pintar el wizard en ese paso.
 */
/**
 * Tipos de fútbol marcados (casillas name="modalidad": llega un valor o una lista).
 * @returns {number[]} Cantidades de jugadores válidas (5, 7, 11), sin repetir y de menor a mayor.
 */
function leerModalidades(valor) {
  const lista = Array.isArray(valor) ? valor : [valor];
  return [...new Set(lista.map(Number))].filter((n) => MODALIDADES[n]).sort((a, b) => a - b);
}

/**
 * Limpia y valida los datos de un equipo nuevo (los comparten /crear-equipo y el paso "Crear equipo"
 * del wizard de jugador). Con conContacto: false no se piden correo ni zona (el wizard los completa
 * con el correo de la cuenta y el nombre de la comuna).
 * @returns {{ datos: object, paso1: string[], paso2: string[] }}
 *          paso1 = identidad (nombre y correo), paso2 = configuración (nivel, zona, comuna, tipos de fútbol).
 */
// PE-012: la edición del equipo usa conZona: false (la zona sale de la comuna) y conModalidades: false
// (los tipos de fútbol se cambian aparte, en el panel del capitán).
function revisarDatosEquipo(body, { conContacto = true, conZona = conContacto, conModalidades = true } = {}) {
  const nombre = (body.nombre_equipo || '').trim();
  const correo = (body.correo_contacto || '').trim().toLowerCase();
  const nivel = body.nivel || '';
  const zona = (body.zona || '').trim();
  const modalidades = leerModalidades(body.modalidad);

  const paso1 = [];
  const paso2 = [];

  if (!nombre) paso1.push('El nombre de la escuadra es obligatorio.');
  else if (nombre.length > LONGITUD_MAXIMA_NOMBRE) paso1.push(`El nombre no puede superar los ${LONGITUD_MAXIMA_NOMBRE} caracteres.`);

  if (conContacto) {
    if (!correo) paso1.push('El correo de contacto es obligatorio.');
    else if (!REGEX_CORREO.test(correo) || correo.length > LONGITUD_MAXIMA_CORREO) paso1.push('El formato del correo no es válido.');
  }

  if (!NIVELES[nivel]) paso2.push('Elige el nivel de juego del equipo.');

  if (conZona) {
    if (!zona) paso2.push('Escribe la zona habitual de juego.');
    else if (zona.length > LONGITUD_MAXIMA_ZONA) paso2.push(`La zona no puede superar los ${LONGITUD_MAXIMA_ZONA} caracteres.`);
  }

  if (conModalidades && modalidades.length === 0) paso2.push('Elige al menos un tipo de fútbol.');

  // CORRECCIÓN: regla 11 — comuna de la lista (para filtrar y recomendar rivales por ubicación).
  // Que exista la revisa el controlador con ubicacionModel.obtenerComuna.
  const idComuna = Number(body.id_comuna);
  const comunaValida = Number.isInteger(idComuna) && idComuna > 0;
  if (!comunaValida) paso2.push('Elige la región y la comuna de tu equipo.');

  return {
    datos: {
      nombre, correo, nivel, zona, modalidades,
      idComuna: comunaValida ? idComuna : null, // CORRECCIÓN: regla 11
      idRegion: Number(body.id_region) || null, // CORRECCIÓN: regla 11 (solo para re-pintar el formulario)
    },
    paso1,
    paso2,
  };
}

/**
 * EQ-UB: ubicación opcional del equipo (dónde suele jugar). Las dos vacías = sin ubicación;
 * si no, deben ser números de latitud y longitud válidos. El modelo la redondea a ~100 m.
 * @returns {{ubicacion: {lat: number, lng: number}|null, error: string|null}}
 */
function leerUbicacion(latTexto, lngTexto) {
  const lat = String(latTexto ?? '').trim();
  const lng = String(lngTexto ?? '').trim();
  if (!lat && !lng) return { ubicacion: null, error: null };
  const latitud = Number(lat);
  const longitud = Number(lng);
  if (!lat || !lng || !Number.isFinite(latitud) || !Number.isFinite(longitud)
    || Math.abs(latitud) > 90 || Math.abs(longitud) > 180) {
    return { ubicacion: null, error: 'La ubicación marcada no es válida: vuelve a marcarla en el mapa.' };
  }
  return { ubicacion: { lat: latitud, lng: longitud }, error: null };
}

function validarEquipo(req, res, next) {
  const { datos, paso1, paso2 } = revisarDatosEquipo(req.body);
  // EQ-UB: paso 3 del wizard (opcional)
  const { ubicacion, error } = leerUbicacion(req.body.latitud, req.body.longitud);
  const paso3 = error ? [error] : [];
  req.datosFormulario = { ...datos, ubicacion };
  req.erroresEquipo = {
    errores: [...paso1, ...paso2, ...paso3],
    paso: paso1.length > 0 ? 1 : paso2.length > 0 ? 2 : 3,
  };
  return next();
}

/**
 * PE-012 — Valida EDITAR EQUIPO (/equipos/:id/editar): nombre, correo de contacto, nivel y comuna.
 * No corta la petición: deja req.datosFormulario y req.erroresEquipo = { errores: [...] }.
 */
function validarEdicionEquipo(req, res, next) {
  const { datos, paso1, paso2 } = revisarDatosEquipo(req.body, { conZona: false, conModalidades: false });
  req.datosFormulario = datos;
  req.erroresEquipo = { errores: [...paso1, ...paso2] };
  return next();
}

/**
 * DE-007 — Filtros de región y comuna de los rivales (GET /mi-equipo?id_region=&id_comuna=).
 * Solo revisa el formato: que la comuna sea de la región lo comprueba el controlador con ubicacionModel.
 * Deja req.filtrosRivales = { idRegion, idComuna } (null = sin filtro).
 */
function leerFiltrosRivales(req, res, next) {
  const id = (valor) => (/^[1-9]\d{0,8}$/.test(String(valor || '')) ? Number(valor) : null);
  req.filtrosRivales = { idRegion: id(req.query.id_region), idComuna: id(req.query.id_comuna) };
  return next();
}

/** Fecha de hoy en Chile como AAAA-MM-DD (para comparar con el input type="date"). */
function hoyEnChile() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(new Date());
}

/**
 * Desafío a otro equipo (modal del panel): fecha y hora tentativas y mensaje, todo opcional.
 * Deja en req.datosDesafio.mensaje el texto para desafio.mensaje, por ejemplo
 * "Fecha tentativa: 25/10/2026 a las 20:00. ¿Jugamos en La Florida?" (o null),
 * y los errores en req.erroresDesafio.
 */
function validarDesafio(req, res, next) {
  const fecha = (req.body.fecha || '').trim();
  const hora = (req.body.hora || '').trim();
  const mensaje = (req.body.mensaje || '').trim();
  const errores = [];

  let textoFecha = '';
  if (fecha) {
    // Ida y vuelta: "2027-02-31" se convierte en 3 de marzo, así que no vuelve igual y se rechaza.
    const fechaDate = new Date(`${fecha}T00:00:00Z`);
    const valida = /^\d{4}-\d{2}-\d{2}$/.test(fecha) && !Number.isNaN(fechaDate.getTime())
      && fechaDate.toISOString().slice(0, 10) === fecha;
    const limite = new Date(Date.now() + DIAS_MAXIMOS_DESAFIO * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    if (!valida) errores.push('La fecha tentativa no es válida.');
    else if (fecha < hoyEnChile()) errores.push('La fecha tentativa no puede ser anterior a hoy.');
    else if (fecha > limite) errores.push('La fecha tentativa no puede estar a más de un año.');
    else {
      const [anio, mes, dia] = fecha.split('-');
      textoFecha = `Fecha tentativa: ${dia}/${mes}/${anio}`;
    }
  }
  if (hora) {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(hora)) errores.push('La hora tentativa no es válida.');
    else if (!fecha) errores.push('Elige también la fecha para la hora tentativa.');
    else if (textoFecha) textoFecha += ` a las ${hora}`;
  }
  if (mensaje.length > LONGITUD_MAXIMA_MENSAJE_DESAFIO) {
    errores.push(`El mensaje no puede superar los ${LONGITUD_MAXIMA_MENSAJE_DESAFIO} caracteres.`);
  }

  const partes = [textoFecha && `${textoFecha}.`, mensaje].filter(Boolean);
  req.datosDesafio = { mensaje: partes.length > 0 ? partes.join(' ') : null };
  req.erroresDesafio = errores;
  return next();
}

/**
 * Mensaje de "Solicitar unirme" (POST /equipos/:id/unirme). En el directorio es obligatorio
 * (el modal lo pide); aquí solo se limpia y se limita: sin JavaScript la solicitud llega sin mensaje.
 * Deja req.datosSolicitud = { mensaje: string|null } y req.erroresSolicitud = [].
 */
function validarSolicitudUnion(req, res, next) {
  // Espacios y saltos de línea repetidos cuentan como uno (el capitán lo lee en una tarjeta)
  const mensaje = (req.body.mensaje || '').replace(/\s+/g, ' ').trim();
  const errores = [];
  if (mensaje.length > LONGITUD_MAXIMA_MENSAJE_SOLICITUD) {
    errores.push(`El mensaje no puede superar los ${LONGITUD_MAXIMA_MENSAJE_SOLICITUD} caracteres.`);
  }
  req.datosSolicitud = { mensaje: mensaje || null };
  req.erroresSolicitud = errores;
  return next();
}

module.exports = {
  validarRegistro,
  validarLogin,
  validarPerfilJugador,
  validarEdicionPerfil,
  validarEquipo,
  validarEdicionEquipo,
  leerFiltrosRivales,
  leerModalidades,
  validarDesafio,
  validarSolicitudUnion,
  leerUbicacion, // EQ-UB (wizard y POST /equipos/:id/ubicacion)
  errorPasswordSegura, // CORRECCIÓN: contraseña segura (la reutilizan AR-008 y AR-009)
  REGEX_CORREO, // NUEVO: AR-012 (y otros formularios nuevos)
  LONGITUD_MAXIMA_MENSAJE_SOLICITUD,
  normalizarTelefono,
  calcularEdad,
  ALTURA_CM,
  PESO_KG,
};
