require('dotenv').config();

const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');
const compression = require('compression');

const { probarConexion } = require('./config/db');
const authRoutes = require('./routes/authRoutes');
const indexRoutes = require('./routes/indexRoutes');
const { cargarSesion } = require('./middlewares/authMiddleware');
const cuentaRoutes = require('./routes/cuentaRoutes');
const adminRoutes = require('./routes/adminRoutes');
const canchasRoutes = require('./routes/canchasRoutes');
const { exigirTerminos } = require('./middlewares/terminosMiddleware');
const notificacionRoutes = require('./routes/notificacionRoutes');
const desafioRoutes = require('./routes/desafioRoutes');
const equipoFichaRoutes = require('./routes/equipoFichaRoutes');
const partidoRoutes = require('./routes/partidoRoutes');
const torneoRoutes = require('./routes/torneoRoutes');
const { contadorSinLeer } = require('./controllers/notificacionController');
const { noEncontrado, manejarErrores } = require('./middlewares/errorHandler');
const tareasProgramadas = require('./models/tareasProgramadas');

const app = express();
const PORT = process.env.PORT || 3000;

if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Versión de CSS/JS (?v=): en Vercel, el commit desplegado (igual en todas sus instancias, así el navegador
// los guarda un año y solo los vuelve a pedir tras un despliegue nuevo); en local, la hora de arranque.
app.locals.calcularIMC = require('./config/perfilJugador').calcularIMC; // IMC en la carta, el perfil y el dashboard
app.locals.paletaColores = require('./config/coloresEquipo').PALETA; // muestras rápidas de colores del equipo
app.locals.versionAssets = (process.env.VERCEL_GIT_COMMIT_SHA || '').slice(0, 10) || Date.now().toString(36);
// gzip de HTML, CSS y JS: las hojas de cada página pesan ~250 KB sin comprimir y ~50 KB comprimidas.
app.use(compression());
app.use(express.static(path.join(__dirname, 'public'), {
  index: false,
  maxAge: process.env.NODE_ENV === 'production' ? '7d' : 0,
}));

app.use(express.urlencoded({ extended: false }));
// Express 5 deja req.body en undefined cuando el POST llega sin cuerpo (en Vercel, un fetch con cuerpo
// vacío llega sin Content-Length): "Enviar desafío" de Buscar partido caía en req.body.fecha con un 500.
app.use((req, res, next) => {
  if (req.body === undefined) req.body = {};
  next();
});

app.use(cookieParser());

app.use(cargarSesion);

app.use(exigirTerminos);

app.use(contadorSinLeer);

app.use('/', indexRoutes);
app.use('/', authRoutes);
app.use('/', cuentaRoutes);
app.use('/admin', adminRoutes);
app.use('/canchas', canchasRoutes);
app.use('/notificaciones', notificacionRoutes);
app.use('/desafios', desafioRoutes);
app.use('/torneos', torneoRoutes);
app.use('/', equipoFichaRoutes);
app.use('/', partidoRoutes);

app.use(noEncontrado);
app.use(manejarErrores);

app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
  probarConexion();
  if (process.env.TAREAS_PROGRAMADAS !== 'no') tareasProgramadas.iniciar();
});
