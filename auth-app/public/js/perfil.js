// public/js/perfil.js
// Página /perfil (carta de jugador). La foto se sube en /perfil/editar (editar-perfil.js).
//  1) "Descargar carta": dibuja la carta (con la foto guardada) en un <canvas> y la descarga como PNG.
//  2) "Compartir carta": comparte el PNG con el menú nativo del dispositivo
//     (Web Share); si el navegador no lo permite, la descarga.

const ANCHO = 600;
const ALTO = 900;
const CORTE = 40;              // corte de las esquinas (las de abajo miden el doble)
const VERDE = '#39ff14';

/** Contorno de la carta: esquinas superiores cortadas y las inferiores, más grandes. */
function trazarContorno(ctx, x, y, ancho, alto, corte) {
  const abajo = corte * 2;
  ctx.beginPath();
  ctx.moveTo(x + corte, y);
  ctx.lineTo(x + ancho - corte, y);
  ctx.lineTo(x + ancho, y + corte);
  ctx.lineTo(x + ancho, y + alto - abajo);
  ctx.lineTo(x + ancho - abajo, y + alto);
  ctx.lineTo(x + abajo, y + alto);
  ctx.lineTo(x, y + alto - abajo);
  ctx.lineTo(x, y + corte);
  ctx.closePath();
}

function dibujarBandera(ctx, x, y, ancho) {
  const alto = (ancho * 2) / 3;
  ctx.fillStyle = '#fff';
  ctx.fillRect(x, y, ancho, alto / 2);
  ctx.fillStyle = '#d52b1e';
  ctx.fillRect(x, y + alto / 2, ancho, alto / 2);
  ctx.fillStyle = '#0039a6';
  ctx.fillRect(x, y, ancho / 3, alto / 2);
  // Estrella de 5 puntas
  const cx = x + ancho / 6;
  const cy = y + alto / 4;
  const r = alto / 6;
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const radio = i % 2 === 0 ? r : r * 0.4;
    const angulo = -Math.PI / 2 + (i * Math.PI) / 5;
    ctx.lineTo(cx + radio * Math.cos(angulo), cy + radio * Math.sin(angulo));
  }
  ctx.fill();
}

/** Foto circular (recorte "cover") o la silueta por defecto. */
function dibujarFoto(ctx, foto, cx, cy, radio) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, radio, 0, Math.PI * 2);
  ctx.fillStyle = '#151915';
  ctx.fill();
  ctx.clip();

  if (foto) {
    const escala = Math.max((radio * 2) / foto.naturalWidth, (radio * 2) / foto.naturalHeight);
    const w = foto.naturalWidth * escala;
    const h = foto.naturalHeight * escala;
    ctx.drawImage(foto, cx - w / 2, cy - h / 2, w, h);
  } else {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(cx, cy - radio * 0.18, radio * 0.32, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy + radio * 0.85, radio * 0.62, Math.PI, 0);
    ctx.stroke();
  }
  ctx.restore();

  ctx.beginPath();
  ctx.arc(cx, cy, radio, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(57, 255, 20, 0.6)';
  ctx.lineWidth = 4;
  ctx.stroke();
}

/** Dibuja la carta completa y devuelve el canvas. */
async function dibujarCarta(datos, foto) {
  // La fuente Inter debe estar cargada antes de escribir en el canvas.
  if (document.fonts) {
    await Promise.all([document.fonts.load('900 64px Inter'), document.fonts.load('700 28px Inter')]).catch(() => {});
  }

  const canvas = document.createElement('canvas');
  canvas.width = ANCHO;
  canvas.height = ALTO;
  const ctx = canvas.getContext('2d');

  // Marco: degradado verde con brillo en las esquinas
  const marco = ctx.createLinearGradient(0, 0, ANCHO, ALTO);
  marco.addColorStop(0, VERDE);
  marco.addColorStop(0.42, '#0c3804');
  marco.addColorStop(0.6, '#0c3804');
  marco.addColorStop(1, VERDE);
  trazarContorno(ctx, 0, 0, ANCHO, ALTO, CORTE);
  ctx.fillStyle = marco;
  ctx.fill();

  // Cuerpo oscuro con resplandor superior
  const borde = 6;
  trazarContorno(ctx, borde, borde, ANCHO - borde * 2, ALTO - borde * 2, CORTE - 2);
  ctx.save();
  ctx.clip();
  ctx.fillStyle = '#070807';
  ctx.fillRect(0, 0, ANCHO, ALTO);
  const resplandor = ctx.createRadialGradient(ANCHO / 2, 0, 0, ANCHO / 2, 0, ALTO * 0.6);
  resplandor.addColorStop(0, 'rgba(57, 255, 20, 0.2)');
  resplandor.addColorStop(1, 'rgba(57, 255, 20, 0)');
  ctx.fillStyle = resplandor;
  ctx.fillRect(0, 0, ANCHO, ALTO);
  ctx.restore();

  // Columna izquierda: media, posición, bandera
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  ctx.shadowColor = 'rgba(57, 255, 20, 0.55)';
  ctx.shadowBlur = 24;
  ctx.fillStyle = VERDE;
  ctx.font = '900 128px Inter, system-ui, sans-serif';
  ctx.fillText(String(datos.media), 52, 168);
  ctx.shadowBlur = 0;

  ctx.fillStyle = '#f2f5f2';
  ctx.font = '800 38px Inter, system-ui, sans-serif';
  ctx.fillText(datos.posicion, 58, 222);
  dibujarBandera(ctx, 58, 250, 60);

  // Foto
  dibujarFoto(ctx, foto, 375, 220, 150);

  // Nombre
  ctx.textAlign = 'center';
  ctx.fillStyle = '#f2f5f2';
  ctx.font = '900 64px Inter, system-ui, sans-serif';
  let nombre = datos.nombre.toUpperCase();
  while (ctx.measureText(nombre).width > ANCHO - 100 && nombre.length > 3) nombre = nombre.slice(0, -1);
  ctx.fillText(nombre, ANCHO / 2, 480);

  ctx.strokeStyle = 'rgba(57, 255, 20, 0.35)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(70, 515);
  ctx.lineTo(ANCHO - 70, 515);
  ctx.stroke();

  // Estadísticas: dos columnas de tres (RIT TIR PAS | REG DEF FIS)
  ctx.textAlign = 'left';
  datos.estadisticas.forEach(([sigla, valor], i) => {
    const columna = Math.floor(i / 3);
    const fila = i % 3;
    const x = columna === 0 ? 120 : 340;
    const y = 590 + fila * 72;
    ctx.fillStyle = '#f2f5f2';
    ctx.font = '900 50px Inter, system-ui, sans-serif';
    ctx.fillText(String(valor), x, y);
    ctx.fillStyle = '#a2aaa2';
    ctx.font = '700 30px Inter, system-ui, sans-serif';
    ctx.fillText(sigla, x + 72, y);
  });
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
  ctx.beginPath();
  ctx.moveTo(ANCHO / 2, 548);
  ctx.lineTo(ANCHO / 2, 750);
  ctx.stroke();

  // Marca
  ctx.textAlign = 'center';
  ctx.fillStyle = VERDE;
  ctx.font = '900 22px Inter, system-ui, sans-serif';
  ctx.fillText('SEARCHMATCH', ANCHO / 2, 820);

  return canvas;
}

function aBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('No se pudo generar la imagen.'))), 'image/png');
  });
}

function descargarBlob(blob, nombreArchivo) {
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = nombreArchivo;
  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

document.addEventListener('DOMContentLoaded', () => {
  const carta = document.querySelector('[data-carta]');
  if (!carta) return;

  const datos = JSON.parse(carta.dataset.carta);
  const estado = document.querySelector('[data-estado]');
  const preview = carta.querySelector('[data-foto-preview]');
  const nombreArchivo = `carta-${datos.nombre.toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-')}.png`;

  function avisar(mensaje) {
    estado.textContent = mensaje;
  }

  async function generarImagen() {
    const foto = preview.hidden ? null : preview;
    if (foto && !foto.complete) {
      await new Promise((resolve) => {
        foto.addEventListener('load', resolve, { once: true });
        foto.addEventListener('error', resolve, { once: true });
      });
    }
    // Si la foto no cargó (naturalWidth 0) se dibuja la silueta
    return aBlob(await dibujarCarta(datos, foto && foto.naturalWidth ? foto : null));
  }

  /* ---------- 1) Descargar ---------- */
  document.querySelector('[data-descargar]').addEventListener('click', async () => {
    try {
      descargarBlob(await generarImagen(), nombreArchivo);
      avisar('Carta descargada.');
    } catch (err) {
      avisar('No pudimos generar la imagen de tu carta. Inténtalo de nuevo.');
    }
  });

  /* ---------- 2) Compartir ---------- */
  document.querySelector('[data-compartir]').addEventListener('click', async () => {
    try {
      const blob = await generarImagen();
      const archivo = new File([blob], nombreArchivo, { type: 'image/png' });

      if (navigator.canShare && navigator.canShare({ files: [archivo] })) {
        await navigator.share({
          files: [archivo],
          title: 'Mi carta de SearchMatch',
          text: `Mi carta de jugador en SearchMatch: ${datos.media} ${datos.posicion}. ¿Jugamos?`,
        });
        avisar('¡Carta compartida!');
      } else {
        descargarBlob(blob, nombreArchivo);
        avisar('Tu navegador no permite compartir imágenes directamente: descargamos la carta para que la compartas.');
      }
    } catch (err) {
      // AbortError = el usuario cerró el menú de compartir: no es un error.
      if (err.name !== 'AbortError') avisar('No pudimos compartir tu carta. Prueba con "Descargar carta".');
    }
  });
});
