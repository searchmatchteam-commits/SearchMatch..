// middlewares/errorHandler.js
// Manejo centralizado de errores.
// El middleware de 404 y el de errores van AL FINAL de app.js,
// después de montar todas las rutas.

/**
 * Middleware de recurso no encontrado (404).
 * Si ninguna ruta respondió, mostramos la vista de error con código 404.
 */
function noEncontrado(req, res, next) {
  const error = new Error(`Ruta no encontrada: ${req.originalUrl}`);
  error.statusCode = 404;
  next(error);
}

/**
 * Middleware de errores (debe recibir los 4 parámetros para que Express
 * lo reconozca como manejador de errores y lo ejecute solo cuando hay error).
 * Se coloca como ÚLTIMO middleware de app.js.
 */
function manejarErrores(err, req, res, next) {
  // Si Express ya envió una respuesta, delegamos al manejador por defecto.
  if (res.headersSent) {
    return next(err);
  }

  const statusCode = err.statusCode || 500;

  // En consola dejamos el detalle completo para depurar.
  // Nota: algunos errores de pg (AggregateError) traen .message vacío,
  // por eso caemos a err.detail / código antes de rendernos.
  const detalle = err.message || err.detail || err.code || 'sin detalle';
  console.error('💥 Error capturado por el middleware de errores:');
  console.error('   Status:', statusCode);
  console.error('   Mensaje:', detalle);
  if (process.env.NODE_ENV !== 'production' && err.stack) {
    console.error(err.stack);
  }

  // Al usuario solo le mostramos la vista de error con un mensaje claro.
  return res.status(statusCode).render('error', {
    titulo: 'Error',
    codigo: statusCode,
    mensaje:
      statusCode === 404
        ? 'La página que buscas no existe.'
        : 'Ocurrió un error inesperado. Inténtalo de nuevo más tarde.',
    usuario: req.session.usuario || null,
  });
}

module.exports = { noEncontrado, manejarErrores };
