// URL pública de la app: enlaces de correos (confirmación, recuperación, invitaciones), retorno de pagos y de Google.
// Orden: APP_URL si está definida; en Vercel, el dominio de producción del proyecto (variable de sistema que
// Vercel entrega sola); si no, localhost. Así un despliegue en Vercel sin APP_URL no manda a localhost.

const sinBarraFinal = (url) => url.replace(/\/+$/, '');

function urlApp() {
  if (process.env.APP_URL) return sinBarraFinal(process.env.APP_URL);
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return `http://localhost:${process.env.PORT || 3000}`;
}

/** Hosts propios de la app: el de urlApp() y, en Vercel, los de producción, de la rama y del despliegue. */
function hostsPropios() {
  const hosts = new Set([new URL(urlApp()).host]);
  ['VERCEL_PROJECT_PRODUCTION_URL', 'VERCEL_BRANCH_URL', 'VERCEL_URL'].forEach((variable) => {
    if (process.env[variable]) hosts.add(process.env[variable]);
  });
  return hosts;
}

/**
 * Origen (https://host) de la petición si es un host propio; si no, null.
 * Google debe volver al mismo host desde el que se inició: ahí quedó la cookie del verificador PKCE.
 */
function origenPropio(req) {
  const host = req.get('host');
  if (!hostsPropios().has(host)) return null;
  // Vercel termina el HTTPS antes de la app: la petición llega como http aunque el usuario esté en https.
  const protocolo = process.env.VERCEL ? 'https' : req.protocol;
  return `${protocolo}://${host}`;
}

module.exports = { urlApp, origenPropio };
