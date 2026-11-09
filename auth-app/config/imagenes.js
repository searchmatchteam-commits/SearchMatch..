// Compresión de las imágenes que suben los usuarios, antes de guardarlas en la base de datos.
// Las fotos se guardan siempre en JPEG (calidad 85 con mozjpeg: sin pérdida visible y varias veces más
// livianas). Escudos y logos solo pasan a JPEG si no tienen transparencia (el JPEG la pintaría de negro);
// si la tienen quedan en PNG optimizado. Si la imagen no se puede leer se devuelve tal cual y la
// validación que ya existía decide.
const sharp = require('sharp');

const CALIDAD_JPEG = 85;
const LIMITE_PIXELES = 50 * 1000 * 1000; // protege la memoria del servidor ante imágenes gigantes

/**
 * @param {Buffer} datos - La imagen subida (JPEG, PNG o WebP).
 * @param {object} [opciones]
 * @param {number} [opciones.ladoMaximo=1600] - Lado mayor máximo en píxeles (nunca se agranda).
 * @param {boolean} [opciones.conservarTransparencia=false] - true para escudos y logos.
 * @returns {Promise<{datos: Buffer, tipo: string}|null>} null si no es una imagen legible.
 */
async function comprimirImagen(datos, { ladoMaximo = 1600, conservarTransparencia = false } = {}) {
  try {
    const entrada = sharp(datos, { limitInputPixels: LIMITE_PIXELES });
    const meta = await entrada.metadata();
    // .rotate() endereza las fotos de celular según su EXIF; los metadatos (GPS incluido) no se copian.
    const base = entrada.rotate().resize({ width: ladoMaximo, height: ladoMaximo, fit: 'inside', withoutEnlargement: true });

    const transparente = conservarTransparencia && meta.hasAlpha && !(await sharp(datos).stats()).isOpaque;
    const salida = transparente
      ? { datos: await base.png({ compressionLevel: 9, palette: false }).toBuffer(), tipo: 'image/png' }
      : {
          datos: await base.flatten({ background: '#ffffff' }).jpeg({ quality: CALIDAD_JPEG, mozjpeg: true }).toBuffer(),
          tipo: 'image/jpeg',
        };

    // Si ya venía en ese formato, dentro del tamaño y más liviana, se deja la original (no se vuelve a comprimir).
    const formatoOriginal = { jpeg: 'image/jpeg', png: 'image/png' }[meta.format];
    const ladoOriginal = Math.max(meta.width || 0, meta.height || 0);
    const sinMetadatos = !meta.exif && (!meta.orientation || meta.orientation === 1);
    if (formatoOriginal === salida.tipo && ladoOriginal <= ladoMaximo && sinMetadatos && datos.length <= salida.datos.length) {
      return { datos, tipo: salida.tipo };
    }
    return salida;
  } catch {
    return null;
  }
}

/** Igual que comprimirImagen, pero si falla devuelve la imagen original sin tocar. */
async function comprimirOConservar(datos, tipo, opciones) {
  return (await comprimirImagen(datos, opciones)) || { datos, tipo };
}

module.exports = { comprimirImagen, comprimirOConservar };
