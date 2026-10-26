// public/js/perfil.js
// Página /perfil (carta de jugador). La foto se sube en /perfil/editar (editar-perfil.js).
//  1) "Descargar carta": dibuja la carta (con la foto guardada) en un <canvas> y la descarga como PNG.
//  2) "Compartir carta": comparte el PNG con el menú nativo del dispositivo
//     (Web Share); si el navegador no lo permite, la descarga.

// La carta descargada tiene la proporción de la silueta (320x520): 600 x 975 px.
const ANCHO = 600;
const ALTO = 975;
const ESCALA = ANCHO / 320;
const VERDE = '#39ff14';

// Silueta de cresta angular: el mismo path que svg.carta-jugador__silueta (views/partials/carta-jugador.ejs).
const ESCUDO = new Path2D('M160 16 L194 2 L288 2 L318 32 L318 160 L308 172 L318 184 L318 404 L236 476 L178 494 L160 518 L142 494 L84 476 L2 404 L2 184 L12 172 L2 160 L2 32 L32 2 L126 2 Z');
const FILOS = new Path2D('M146 28 L160 36 L174 28 M142 458 L160 472 L178 458 M18 172 H30 M290 172 H302');
// Inter, como en la página: números y nombre en 800, siglas en 600
const fuente = (tamano, peso = 800) => `${peso} ${tamano}px Inter, system-ui, sans-serif`;
// El apodo, igual que en la página: Oswald 700
const fuenteApodo = (tamano) => `700 ${tamano}px Oswald, "Arial Narrow", Impact, sans-serif`;

/** Rellena o traza la silueta en coordenadas del viewBox 320x520. */
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
  // Las fuentes deben estar cargadas antes de escribir en el canvas.
  if (document.fonts) {
    await Promise.all([
      document.fonts.load(fuente(64)),
      document.fonts.load(fuente(26, 600)),
      document.fonts.load(fuenteApodo(64)),
    ]).catch(() => {});
  }

  const canvas = document.createElement('canvas');
  canvas.width = ANCHO;
  canvas.height = ALTO;
  const ctx = canvas.getContext('2d');

  // Silueta igual a la de la página: fondo con degradado, rayas a 45° y borde doble
  conSilueta(ctx, () => {
    const fondo = ctx.createLinearGradient(0, 0, 0, 520);
    fondo.addColorStop(0, '#0f1a0f');
    fondo.addColorStop(0.55, '#080b08');
    fondo.addColorStop(1, '#030403');
    ctx.fillStyle = fondo;
    ctx.fill(ESCUDO);

    ctx.save();
    ctx.clip(ESCUDO);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.035)';
    ctx.lineWidth = 2;
    for (let d = -520; d < 320; d += 7) {
      ctx.beginPath();
      ctx.moveTo(d, 520);
      ctx.lineTo(d + 520, 0);
      ctx.stroke();
    }
    ctx.restore();

    const borde = ctx.createLinearGradient(0, 0, 0, 520);
    borde.addColorStop(0, VERDE);
    borde.addColorStop(1, '#0d5c05');
    ctx.strokeStyle = borde;
    ctx.lineWidth = 3.5;
    ctx.lineJoin = 'miter';
    ctx.stroke(ESCUDO);

    ctx.strokeStyle = 'rgba(57, 255, 20, 0.7)';
    ctx.lineWidth = 2;
    ctx.lineCap = 'square';
    ctx.stroke(FILOS);

    ctx.translate(9.6, 15.6);
    ctx.scale(0.94, 0.94);
    ctx.strokeStyle = 'rgba(57, 255, 20, 0.45)';
    ctx.lineWidth = 1;
    ctx.stroke(ESCUDO);
  });

  // Columna izquierda: media, posición, bandera
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  ctx.shadowColor = 'rgba(57, 255, 20, 0.55)';
  ctx.shadowBlur = 24;
  ctx.fillStyle = VERDE;
  ctx.font = fuente(124);
  ctx.fillText(String(datos.media), 56, 168);
  ctx.shadowBlur = 0;

  ctx.fillStyle = '#f2f5f2';
  ctx.font = fuente(34, 700);
  ctx.fillText(datos.posicion, 62, 212);
  dibujarBandera(ctx, 58, 226, 60);

  // Foto
  dibujarFoto(ctx, foto, 380, 205, 140);

  // Nombre
  ctx.textAlign = 'center';
  ctx.fillStyle = '#f2f5f2';
  ctx.font = fuenteApodo(92);
  let nombre = datos.nombre.toUpperCase();
  while (ctx.measureText(nombre).width > ANCHO - 100 && nombre.length > 3) nombre = nombre.slice(0, -1);
  ctx.fillText(nombre, ANCHO / 2, 470);

  ctx.strokeStyle = 'rgba(57, 255, 20, 0.35)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(70, 518);
  ctx.lineTo(ANCHO - 70, 518);
  ctx.stroke();

  // Estadísticas: dos columnas de tres (RIT TIR PAS | REG DEF FIS)
  ctx.textAlign = 'left';
  datos.estadisticas.forEach(([sigla, valor], i) => {
    const columna = Math.floor(i / 3);
    const fila = i % 3;
    const x = columna === 0 ? 120 : 340;
    const y = 584 + fila * 72;
    ctx.fillStyle = '#f2f5f2';
    ctx.font = fuente(46, 800);
    ctx.fillText(String(valor), x, y);
    const anchoValor = ctx.measureText(String(valor)).width;
    ctx.fillStyle = VERDE;
    ctx.font = fuente(22, 600);
    ctx.fillText(sigla, x + anchoValor + 12, y - 2);
  });
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
  ctx.beginPath();
  ctx.moveTo(ANCHO / 2, 540);
  ctx.lineTo(ANCHO / 2, 744);
  ctx.stroke();

  // Marca
  ctx.textAlign = 'center';
  ctx.fillStyle = VERDE;
  ctx.font = fuente(22);
  ctx.fillText('SEARCHMATCH', ANCHO / 2, 830); // sobre el chevron de la punta

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
