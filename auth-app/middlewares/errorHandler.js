function noEncontrado(req, res, next) {
  const error = new Error(`Ruta no encontrada: ${req.originalUrl}`);
  error.statusCode = 404;
  next(error);
}

function manejarErrores(err, req, res, next) {
  if (res.headersSent) {
    return next(err);
  }

  const statusCode = err.statusCode || err.status || 500;

  if (statusCode !== 404) {
    const detalle = err.message || err.detail || err.code || 'sin detalle';
    console.error('💥 Error capturado por el middleware de errores:');
    console.error('   Status:', statusCode);
    console.error('   Mensaje:', detalle);
    if (process.env.NODE_ENV !== 'production' && err.stack) {
      console.error(err.stack);
    }
  }

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
