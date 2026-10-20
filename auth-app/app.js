<<<<<<< HEAD
const path = require('path');
const express = require('express');

const app = express();

// Three.js se sirve desde este mismo sitio (ver el import de public/js/ball.js)
app.use('/vendor/three-0.160.0', express.static(path.join(__dirname, 'node_modules/three/build')));
app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor en http://localhost:${PORT}`));
=======
// app.js
// Punto de entrada de la aplicación.
// Orden de configuración:
//   1) variables de entorno  2) Express  3) motor de vistas  4) middlewares globales
//   5) rutas  6) 404 + middleware de errores (al final)  7) servidor + prueba de conexión

require('dotenv').config();

const path = require('path');
const express = require('express');
const session = require('express-session');

const { probarConexion } = require('./config/db');
const authRoutes = require('./routes/authRoutes');
const indexRoutes = require('./routes/indexRoutes');
const { noEncontrado, manejarErrores } = require('./middlewares/errorHandler');

const app = express();
const PORT = process.env.PORT || 3000;

// ---------------------------------------------------------------
// 1) Motor de vistas: EJS
//    Los archivos viven en /views y los partials se incluyen con include().
// ---------------------------------------------------------------
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// ---------------------------------------------------------------
// 2) Middlewares globales
// ---------------------------------------------------------------
// Archivos estáticos: CSS, JS e imágenes del navegador (carpeta /public).
app.use(express.static(path.join(__dirname, 'public')));

// Habilita el parseo de formularios HTML (application/x-www-form-urlencoded).
app.use(express.urlencoded({ extended: false }));

// Sesiones con express-session:
//  - secret: firma la cookie para que no se pueda manipular desde el cliente.
//  - resave/saveUninitialized: no re-guardar sesiones vacías.
//  - cookie httpOnly: la cookie no es accesible desde JavaScript del navegador.
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'clave_secreta_temporal_sin_produccion',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      maxAge: 1000 * 60 * 60, // 1 hora de duración
    },
  })
);

// Hacemos disponible el usuario de la sesión en TODAS las vistas.
app.use((req, res, next) => {
  res.locals.usuario = req.session.usuario || null;
  next();
});

// ---------------------------------------------------------------
// 3) Rutas (solo definen caminos y llaman a controladores)
// ---------------------------------------------------------------
app.use('/', indexRoutes);      // raíz y /dashboard
app.use('/', authRoutes);       // /login, /registro, /logout

// ---------------------------------------------------------------
// 4) Middlewares de errores: SIEMPRE al final, después de las rutas
// ---------------------------------------------------------------
app.use(noEncontrado);     // cualquier ruta no definida → 404
app.use(manejarErrores);   // errores de aplicación → 404/500

// ---------------------------------------------------------------
// 5) Arranque del servidor + prueba de conexión a Supabase
//    Si la BD falla, solo se muestra un mensaje en consola (no se rompe el arranque).
// ---------------------------------------------------------------
app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
  // Probamos la conexión a PostgreSQL/Supabase de forma asíncrona.
  probarConexion();
});
>>>>>>> c112832366ed12990104ce0e708e9a299ba5e591
