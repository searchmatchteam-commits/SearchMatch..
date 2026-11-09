-- ============================================================
-- sql/regiones_comunas_chile.sql
-- ============================================================
-- Completa las 16 regiones de Chile y sus 346 comunas (división oficial vigente desde 2018, con Ñuble).
-- Solo AGREGA lo que falta: no toca ni renombra las regiones y comunas que ya existen
-- (Región Metropolitana, Valparaíso y Biobío ya estaban cargadas). Se puede ejecutar más de una vez.
--
-- Ejecutar con:  node scripts/ejecutar-sql.js sql/regiones_comunas_chile.sql
-- Después:       node scripts/seed-canchas-osm.js --todo-chile --confirmar

WITH datos(region, comunas, orden) AS (SELECT v.*, row_number() OVER () FROM (VALUES
  ('Arica y Parinacota', ARRAY['Arica', 'Camarones', 'Putre', 'General Lagos']),
  ('Tarapacá', ARRAY['Iquique', 'Alto Hospicio', 'Pozo Almonte', 'Camiña', 'Colchane', 'Huara', 'Pica']),
  ('Antofagasta', ARRAY['Antofagasta', 'Mejillones', 'Sierra Gorda', 'Taltal', 'Calama', 'Ollagüe', 'San Pedro de Atacama',
    'Tocopilla', 'María Elena']),
  ('Atacama', ARRAY['Copiapó', 'Caldera', 'Tierra Amarilla', 'Chañaral', 'Diego de Almagro', 'Vallenar', 'Alto del Carmen',
    'Freirina', 'Huasco']),
  ('Coquimbo', ARRAY['La Serena', 'Coquimbo', 'Andacollo', 'La Higuera', 'Paiguano', 'Vicuña', 'Illapel', 'Canela', 'Los Vilos',
    'Salamanca', 'Ovalle', 'Combarbalá', 'Monte Patria', 'Punitaqui', 'Río Hurtado']),
  ('O''Higgins', ARRAY['Rancagua', 'Codegua', 'Coinco', 'Coltauco', 'Doñihue', 'Graneros', 'Las Cabras', 'Machalí', 'Malloa',
    'Mostazal', 'Olivar', 'Peumo', 'Pichidegua', 'Quinta de Tilcoco', 'Rengo', 'Requínoa', 'San Vicente', 'Pichilemu',
    'La Estrella', 'Litueche', 'Marchigüe', 'Navidad', 'Paredones', 'San Fernando', 'Chépica', 'Chimbarongo', 'Lolol',
    'Nancagua', 'Palmilla', 'Peralillo', 'Placilla', 'Pumanque', 'Santa Cruz']),
  ('Maule', ARRAY['Talca', 'Constitución', 'Curepto', 'Empedrado', 'Maule', 'Pelarco', 'Pencahue', 'Río Claro', 'San Clemente',
    'San Rafael', 'Cauquenes', 'Chanco', 'Pelluhue', 'Curicó', 'Hualañé', 'Licantén', 'Molina', 'Rauco', 'Romeral',
    'Sagrada Familia', 'Teno', 'Vichuquén', 'Linares', 'Colbún', 'Longaví', 'Parral', 'Retiro', 'San Javier', 'Villa Alegre',
    'Yerbas Buenas']),
  ('Ñuble', ARRAY['Chillán', 'Bulnes', 'Chillán Viejo', 'El Carmen', 'Pemuco', 'Pinto', 'Quillón', 'San Ignacio', 'Yungay',
    'Quirihue', 'Cobquecura', 'Coelemu', 'Ninhue', 'Portezuelo', 'Ránquil', 'Treguaco', 'San Carlos', 'Coihueco', 'Ñiquén',
    'San Fabián', 'San Nicolás']),
  ('La Araucanía', ARRAY['Temuco', 'Carahue', 'Cunco', 'Curarrehue', 'Freire', 'Galvarino', 'Gorbea', 'Lautaro', 'Loncoche',
    'Melipeuco', 'Nueva Imperial', 'Padre Las Casas', 'Perquenco', 'Pitrufquén', 'Pucón', 'Saavedra', 'Teodoro Schmidt',
    'Toltén', 'Vilcún', 'Villarrica', 'Cholchol', 'Angol', 'Collipulli', 'Curacautín', 'Ercilla', 'Lonquimay', 'Los Sauces',
    'Lumaco', 'Purén', 'Renaico', 'Traiguén', 'Victoria']),
  ('Los Ríos', ARRAY['Valdivia', 'Corral', 'Lanco', 'Los Lagos', 'Máfil', 'Mariquina', 'Paillaco', 'Panguipulli', 'La Unión',
    'Futrono', 'Lago Ranco', 'Río Bueno']),
  ('Los Lagos', ARRAY['Puerto Montt', 'Calbuco', 'Cochamó', 'Fresia', 'Frutillar', 'Los Muermos', 'Llanquihue', 'Maullín',
    'Puerto Varas', 'Castro', 'Ancud', 'Chonchi', 'Curaco de Vélez', 'Dalcahue', 'Puqueldón', 'Queilén', 'Quellón', 'Quemchi',
    'Quinchao', 'Osorno', 'Puerto Octay', 'Purranque', 'Puyehue', 'Río Negro', 'San Juan de la Costa', 'San Pablo', 'Chaitén',
    'Futaleufú', 'Hualaihué', 'Palena']),
  ('Aysén', ARRAY['Coyhaique', 'Lago Verde', 'Aysén', 'Cisnes', 'Guaitecas', 'Cochrane', 'O''Higgins', 'Tortel', 'Chile Chico',
    'Río Ibáñez']),
  ('Magallanes y la Antártica Chilena', ARRAY['Punta Arenas', 'Laguna Blanca', 'Río Verde', 'San Gregorio', 'Cabo de Hornos',
    'Antártica', 'Porvenir', 'Primavera', 'Timaukel', 'Natales', 'Torres del Paine'])) AS v(region, comunas)
),
regiones_nuevas AS (
  INSERT INTO region (nombre)
  SELECT d.region FROM datos d
   WHERE NOT EXISTS (SELECT 1 FROM region r WHERE lower(r.nombre) = lower(d.region))
   ORDER BY d.orden -- de norte a sur: los listados ordenan las regiones por id
  RETURNING id, nombre
),
todas AS (
  SELECT id, nombre FROM regiones_nuevas
  UNION ALL
  SELECT r.id, r.nombre FROM region r JOIN datos d ON lower(d.region) = lower(r.nombre)
)
INSERT INTO comunas (nombre, id_region)
SELECT c.nombre, t.id
  FROM datos d
  JOIN todas t ON lower(t.nombre) = lower(d.region)
  CROSS JOIN LATERAL unnest(d.comunas) AS c(nombre)
 WHERE NOT EXISTS (SELECT 1 FROM comunas x WHERE x.id_region = t.id AND lower(x.nombre) = lower(c.nombre))
 ORDER BY d.orden, c.nombre;
