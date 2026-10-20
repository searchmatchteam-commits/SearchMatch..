// app.js
// Punto de entrada de la aplicación.
// Orden de configuración:
//   1) variables de entorno  2) Express  3) motor de vistas  4) middlewares globales
//   5) rutas  6) 404 + middleware de errores (al final)  7) servidor + prueba de conexión

require('dotenv').config();

const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');

const { probarConexion } = require('./config/db');
const authRoutes = require('./routes/authRoutes');
const indexRoutes = require('./routes/indexRoutes');
const { cargarSesion } = require('./middlewares/authMiddleware');
const { noEncontrado, manejarErrores } = require('./middlewares/errorHandler');

const app = express();
const PORT = process.env.PORT || 3000;

// Detrás de un proxy con HTTPS (Render, Railway...) para que las cookies "secure" funcionen.
if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

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
// index: false → "/" lo responde la landing en EJS, no un index.html.
app.use(express.static(path.join(__dirname, 'public'), { index: false }));

// Habilita el parseo de formularios HTML (application/x-www-form-urlencoded).
app.use(express.urlencoded({ extended: false }));

// Lee las cookies httpOnly donde guardamos los tokens de Supabase.
app.use(cookieParser());

// Verifica la sesión de Supabase y deja el usuario en req.usuario y en
// res.locals.usuario (disponible en TODAS las vistas).
app.use(cargarSesion);

// ---------------------------------------------------------------
// 3) Rutas (solo definen caminos y llaman a controladores)
// ---------------------------------------------------------------
app.use('/', indexRoutes);      // landing y /dashboard
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
