const path = require('path');
const express = require('express');

const app = express();

// Three.js se sirve desde este mismo sitio (ver el import de public/js/ball.js)
app.use('/vendor/three-0.160.0', express.static(path.join(__dirname, 'node_modules/three/build')));
app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor en http://localhost:${PORT}`));
