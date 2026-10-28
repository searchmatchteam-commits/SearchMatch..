// routes/indexRoutes.js
// Rutas de las páginas del sitio: landing, selección de rol y dashboard protegido.
// Solo llaman a los controladores; sin lógica de negocio.

const express = require('express');
const router = express.Router();

const pageController = require('../controllers/pageController');
const rolController = require('../controllers/rolController');
const jugadorController = require('../controllers/jugadorController');
const equipoController = require('../controllers/equipoController');
const { requireAuth, requireRol } = require('../middlewares/authMiddleware');
const {
  validarPerfilJugador,
  validarEdicionPerfil,
  validarEquipo,
  validarDesafio,
  validarSolicitudUnion,
} = require('../middlewares/validators');

// Cuerpo binario de la foto. Pesa ~100 KB tras reducirla; el tope evita cargas enormes.
const subirImagen = express.raw({ type: ['image/jpeg', 'image/png', 'image/webp'], limit: '2mb' });

// GET / → landing page.
router.get('/', pageController.landing);

// GET/POST /select-role → "¿Cómo quieres empezar?" (solo con sesión).
router.get('/select-role', requireAuth, (req, res, next) => (req.usuario.esSuperAdmin ? res.redirect('/admin/super') : next()), rolController.mostrarSeleccion);
router.post('/select-role', requireAuth, rolController.guardarSeleccion);

// Rol "jugador": wizard para crear el perfil, la carta resultante y el editor.
router.get('/perfil-jugador', requireAuth, requireRol, jugadorController.mostrarWizard);
router.post('/perfil-jugador', requireAuth, requireRol, validarPerfilJugador, jugadorController.guardarWizard);
router.get('/perfil', requireAuth, requireRol, jugadorController.mostrarPerfil);
router.get('/perfil/editar', requireAuth, requireRol, jugadorController.mostrarEditor);
router.post('/perfil/editar', requireAuth, requireRol, validarEdicionPerfil, jugadorController.guardarEditor);
// Foto de la carta: el cuerpo es la imagen (ya reducida en el navegador por editar-perfil.js).
router.get('/perfil/foto', requireAuth, jugadorController.servirFoto);
router.post('/perfil/foto', requireAuth, requireRol, subirImagen, jugadorController.subirFoto);
router.post('/perfil/foto/eliminar', requireAuth, requireRol, jugadorController.eliminarFoto);
// Foto de la carta de cualquier jugador (las cartas del plantel en /mi-equipo).
router.get('/jugadores/:id/foto', requireAuth, jugadorController.servirFotoJugador);

// Equipos: wizard para crear el equipo, panel del capitán, mis equipos y directorio con solicitudes.
// Cualquier cuenta puede crear su equipo (queda como capitán); desafiar lo comprueba el modelo.
router.get('/crear-equipo', requireAuth, requireRol, equipoController.mostrarCrear);
router.post('/crear-equipo', requireAuth, requireRol, validarEquipo, equipoController.crear);
router.get('/crear-equipo/listo', requireAuth, requireRol, equipoController.confirmacion);
router.get('/mi-equipo', requireAuth, requireRol, equipoController.panel);
router.post('/mi-equipo/solicitudes/:id/:accion', requireAuth, requireRol, equipoController.responder);
// Perfil (carta, datos y mensaje) de quien pidió unirse; solo el capitán que creó ese equipo.
router.get('/mi-equipo/solicitudes/:id', requireAuth, requireRol, equipoController.verSolicitud);
router.get('/mi-equipo/solicitudes/:id/foto', requireAuth, requireRol, equipoController.fotoSolicitud);
router.post('/mi-equipo/desafios/:id', requireAuth, requireRol, validarDesafio, equipoController.desafiar);
// Pantalla "Buscar partido": cola simulada y revelación de un rival (solo capitanes).
router.get('/matchmaking', requireAuth, requireRol, equipoController.matchmaking);
// Modal "Invitar jugador +": solo el capitán que creó el equipo (lo comprueba el modelo).
router.post('/equipos/:id/invitaciones/:idJugador', requireAuth, requireRol, equipoController.invitar);
// Panel "Invitaciones" del dashboard: el jugador invitado acepta o rechaza (lo comprueba el modelo).
router.post('/invitaciones/:id/:accion', requireAuth, requireRol, equipoController.responderInvitacion);
router.get('/mis-equipos', requireAuth, requireRol, equipoController.misEquipos);
router.get('/equipos', requireAuth, requireRol, equipoController.directorio);
router.post('/equipos/:id/unirme', requireAuth, requireRol, validarSolicitudUnion, equipoController.unirse);
// Alineación, tipos de fútbol y escudo: solo el capitán que creó el equipo (lo comprueba el modelo).
router.post('/equipos/:id/alineacion', requireAuth, requireRol, equipoController.guardarAlineacion);
router.post('/equipos/:id/modalidades', requireAuth, requireRol, equipoController.actualizarModalidades);
// Salida del plantel: el capitán saca a un jugador; el jugador sale de un equipo (no si es su capitán).
router.post('/equipos/:id/plantel/:idJugador/sacar', requireAuth, requireRol, equipoController.sacar);
router.post('/equipos/:id/salir', requireAuth, requireRol, equipoController.salir);
router.get('/equipos/:id/escudo', requireAuth, equipoController.servirEscudo);
router.post('/equipos/:id/escudo', requireAuth, requireRol, subirImagen, equipoController.subirEscudo);
// Dirección antigua del paso de equipo (enlaces o marcadores guardados).
router.get('/registro-equipo', (req, res) => res.redirect('/mi-equipo'));

// GET /dashboard → página protegida: requireAuth verifica la sesión y
// requireRol manda a /select-role a quien aún no eligió rol.
router.get('/dashboard', requireAuth, requireRol, pageController.dashboard);

module.exports = router;
