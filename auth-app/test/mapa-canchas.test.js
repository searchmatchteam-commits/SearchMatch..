const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { recintosParaMapa, mapaCompacto } = require('../controllers/canchasController');

// desempacar() es la función del navegador (public/js/canchas-mapa.js): se carga tal cual, sin el DOM.
function desempacarDelNavegador() {
  const contexto = { document: { addEventListener() {} } };
  vm.runInNewContext(`${fs.readFileSync(path.join(__dirname, '../public/js/canchas-mapa.js'), 'utf8')}\nthis.desempacar = desempacar;`, contexto);
  return contexto.desempacar;
}

const fila = (id, idRecinto, extra = {}) => ({
  id, id_recinto: idRecinto, nombre: `Cancha ${id}`, modalidad: 'Fútbol 7', precio: 25000,
  recinto: `Recinto ${idRecinto}`, comuna: 'Ñuñoa', direccion: 'Av. Siempre Viva 742',
  latitud: -33.4543219, longitud: -70.5987654, ...extra,
});

test('el mapa compacto se arma de vuelta en el navegador con los mismos datos', () => {
  const canchas = [
    fila(1, 10), fila(2, 10, { modalidad: 'Fútbol 5', precio: 0 }),
    fila(3, 20, { comuna: 'Temuco', recinto: 'Complejo </script><b>x' }),
    fila(4, 30, { latitud: null, longitud: null }),
  ];
  const json = mapaCompacto(recintosParaMapa(canchas));
  assert.doesNotMatch(json, /</, 'no puede cerrar la etiqueta <script>');

  const recintos = desempacarDelNavegador()(JSON.parse(json));
  assert.equal(recintos.length, 2, 'sin coordenadas no va al mapa');
  assert.deepEqual(JSON.parse(JSON.stringify(recintos[0])), {
    latitud: -33.45432, longitud: -70.59877, nombre: 'Recinto 10', direccion: 'Av. Siempre Viva 742', comuna: 'Ñuñoa',
    canchas: [
      { id: 1, nombre: 'Cancha 1', modalidad: 'Fútbol 7', precio: 25000 },
      { id: 2, nombre: 'Cancha 2', modalidad: 'Fútbol 5', precio: 0 },
    ],
  });
  assert.equal(recintos[1].nombre, 'Complejo </script><b>x');
  assert.equal(recintos[1].comuna, 'Temuco');
});

test('la ficha de una cancha sigue mandando la lista de objetos y pasa igual', () => {
  const lista = [{ nombre: 'R', latitud: 1, longitud: 2, canchas: [] }];
  assert.equal(desempacarDelNavegador()(lista), lista);
});
