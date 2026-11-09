// scripts/minificar.js
// Minifica en su lugar los .css y .js de una carpeta (por defecto public/). Lo corre Vercel al construir
// (npm run build, ver vercel.json): el repositorio conserva los archivos legibles y comentados, y el sitio
// entrega las versiones livianas. Sin cambiar comportamiento:
//  - JS con transform de esbuild (sin empaquetar): no renombra variables globales ni cambia el orden;
//    ball.js es un módulo (type="module") y se trata como ESM.
//  - CSS con el minificador de esbuild (quita comentarios y espacios; respeta el orden de las reglas).
// Si un archivo falla, el build se detiene: Vercel deja publicada la versión anterior.
//
// Uso: node scripts/minificar.js [carpeta]     (en local, conviene probarlo sobre una copia)

const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');

const MODULOS = new Set(['ball.js']); // se cargan con <script type="module">
const OBJETIVO = ['chrome100', 'firefox100', 'safari15', 'edge100']; // no transpila: solo minifica

async function minificar(carpeta) {
  const archivos = [];
  for (const sub of ['css', 'js']) {
    const dir = path.join(carpeta, sub);
    if (!fs.existsSync(dir)) continue;
    fs.readdirSync(dir).filter((f) => f.endsWith(`.${sub}`)).forEach((f) => archivos.push(path.join(dir, f)));
  }

  let antes = 0;
  let despues = 0;
  for (const archivo of archivos) {
    const codigo = fs.readFileSync(archivo, 'utf8');
    const esCss = archivo.endsWith('.css');
    const { code } = await esbuild.transform(codigo, {
      loader: esCss ? 'css' : 'js',
      minify: true,
      target: OBJETIVO,
      legalComments: 'none',
      ...(esCss ? {} : { format: MODULOS.has(path.basename(archivo)) ? 'esm' : undefined }),
    });
    fs.writeFileSync(archivo, code);
    antes += Buffer.byteLength(codigo);
    despues += Buffer.byteLength(code);
  }
  console.log(`✅ Minificados ${archivos.length} archivos: ${(antes / 1024).toFixed(0)} KB → ${(despues / 1024).toFixed(0)} KB`);
}

// Sin carpeta explícita solo corre en Vercel: así "npm run build" en local no pisa los archivos fuente.
const carpeta = process.argv[2];
if (!carpeta && !process.env.VERCEL) {
  console.log('ℹ️  Minificación omitida: solo se hace al desplegar en Vercel (o pasa una carpeta: node scripts/minificar.js <carpeta>).');
  process.exit(0);
}

minificar(path.resolve(carpeta || path.join(__dirname, '..', 'public'))).catch((err) => {
  console.error('❌ No se pudo minificar:', err.message);
  process.exit(1);
});
