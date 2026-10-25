const ANCHO = 600;
const ALTO = 862;
const ESCALA = ANCHO / 320;
const VERDE = '#39ff14';

const ESCUDO = new Path2D('M14 6 L2 24 L2 300 C2 372 72 424 160 452 C248 424 318 372 318 300 L318 24 L306 6 C262 6 214 22 160 22 C106 22 58 6 14 6 Z');

function conSilueta(ctx, dibujar) {
  ctx.save();
  ctx.scale(ESCALA, ESCALA);
  dibujar();
  ctx.restore();
}

function dibujarBandera(ctx, x, y, ancho) {
  const alto = (ancho * 2) / 3;
  ctx.fillStyle = '#fff';
  ctx.fillRect(x, y, ancho, alto / 2);
  ctx.fillStyle = '#d52b1e';
  ctx.fillRect(x, y + alto / 2, ancho, alto / 2);
  ctx.fillStyle = '#0039a6';
  ctx.fillRect(x, y, ancho / 3, alto / 2);
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

async function dibujarCarta(datos, foto) {
  if (document.fonts) {
    await Promise.all([document.fonts.load('900 64px Inter'), document.fonts.load('700 28px Inter')]).catch(() => {});
  }

  const canvas = document.createElement('canvas');
  canvas.width = ANCHO;
  canvas.height = ALTO;
  const ctx = canvas.getContext('2d');

  conSilueta(ctx, () => {
    const fondo = ctx.createLinearGradient(0, 0, 0, 460);
    fondo.addColorStop(0, '#0f1a0f');
    fondo.addColorStop(0.55, '#080b08');
    fondo.addColorStop(1, '#030403');
    ctx.fillStyle = fondo;
    ctx.fill(ESCUDO);

    ctx.save();
    ctx.clip(ESCUDO);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.035)';
    ctx.lineWidth = 2;
    for (let d = -460; d < 320; d += 7) {
      ctx.beginPath();
      ctx.moveTo(d, 460);
      ctx.lineTo(d + 460, 0);
      ctx.stroke();
    }
    ctx.restore();

    const borde = ctx.createLinearGradient(0, 0, 0, 460);
    borde.addColorStop(0, VERDE);
    borde.addColorStop(1, '#0d5c05');
    ctx.strokeStyle = borde;
    ctx.lineWidth = 3.5;
    ctx.lineJoin = 'round';
    ctx.stroke(ESCUDO);

    ctx.translate(10.5, 15.5);
    ctx.scale(0.934, 0.934);
    ctx.strokeStyle = 'rgba(57, 255, 20, 0.45)';
    ctx.lineWidth = 1;
    ctx.stroke(ESCUDO);
  });

  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  ctx.shadowColor = 'rgba(57, 255, 20, 0.55)';
  ctx.shadowBlur = 24;
  ctx.fillStyle = VERDE;
  ctx.font = '900 128px Inter, system-ui, sans-serif';
  ctx.fillText(String(datos.media), 52, 150);
  ctx.shadowBlur = 0;

  ctx.fillStyle = '#f2f5f2';
  ctx.font = '800 38px Inter, system-ui, sans-serif';
  ctx.fillText(datos.posicion, 58, 202);
  dibujarBandera(ctx, 58, 226, 60);

  dibujarFoto(ctx, foto, 380, 205, 140);

  ctx.textAlign = 'center';
  ctx.fillStyle = '#f2f5f2';
  ctx.font = '900 64px Inter, system-ui, sans-serif';
  let nombre = datos.nombre.toUpperCase();
  while (ctx.measureText(nombre).width > ANCHO - 100 && nombre.length > 3) nombre = nombre.slice(0, -1);
  ctx.fillText(nombre, ANCHO / 2, 398);

  ctx.strokeStyle = 'rgba(57, 255, 20, 0.35)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(70, 422);
  ctx.lineTo(ANCHO - 70, 422);
  ctx.stroke();

  ctx.textAlign = 'left';
  datos.estadisticas.forEach(([sigla, valor], i) => {
    const columna = Math.floor(i / 3);
    const fila = i % 3;
    const x = columna === 0 ? 120 : 340;
    const y = 468 + fila * 44;
    ctx.fillStyle = '#f2f5f2';
    ctx.font = '900 50px Inter, system-ui, sans-serif';
    ctx.fillText(String(valor), x, y);
    ctx.fillStyle = '#a2aaa2';
    ctx.font = '700 30px Inter, system-ui, sans-serif';
    ctx.fillText(sigla, x + 72, y);
  });
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
  ctx.beginPath();
  ctx.moveTo(ANCHO / 2, 432);
  ctx.lineTo(ANCHO / 2, 562);
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.fillStyle = VERDE;
  ctx.font = '900 22px Inter, system-ui, sans-serif';
  ctx.fillText('SEARCHMATCH', ANCHO / 2, 730);

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
    return aBlob(await dibujarCarta(datos, foto && foto.naturalWidth ? foto : null));
  }

  document.querySelector('[data-descargar]').addEventListener('click', async () => {
    try {
      descargarBlob(await generarImagen(), nombreArchivo);
      avisar('Carta descargada.');
    } catch (err) {
      avisar('No pudimos generar la imagen de tu carta. Inténtalo de nuevo.');
    }
  });

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
      if (err.name !== 'AbortError') avisar('No pudimos compartir tu carta. Prueba con "Descargar carta".');
    }
  });
});
