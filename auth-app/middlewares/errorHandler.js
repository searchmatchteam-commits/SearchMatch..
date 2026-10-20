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

  const statusCode = err.statusCode || err.status || 500;

  // En consola dejamos el detalle completo para depurar (los 404 no ensucian el log).
  // Nota: algunos errores de pg (AggregateError) traen .message vacío,
  // por eso caemos a err.detail / código.
  if (statusCode !== 404) {
    const detalle = err.message || err.detail || err.code || 'sin detalle';
    console.error('💥 Error capturado por el middleware de errores:');
    console.error('   Status:', statusCode);
    console.error('   Mensaje:', detalle);
    if (process.env.NODE_ENV !== 'production' && err.stack) {
      console.error(err.stack);
    }
  }

  // Al usuario solo le mostramos un mensaje genérico, nunca el detalle interno.
  const mensajes = {
    400: 'La solicitud no es válida.',
    404: 'La página que buscas no existe.',
  };

  return res.status(statusCode).render('error', {
    titulo: 'Error',
    codigo: statusCode,
    mensaje: mensajes[statusCode] || 'Ocurrió un error inesperado. Inténtalo de nuevo más tarde.',
  });
}

module.exports = { noEncontrado, manejarErrores };
