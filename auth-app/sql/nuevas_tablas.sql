INSERT INTO estado_solicitud (nombre)
SELECT 'cancelada'
 WHERE NOT EXISTS (SELECT 1 FROM estado_solicitud WHERE lower(nombre) = 'cancelada');

INSERT INTO estado_desafio (nombre)
SELECT 'cancelado'
 WHERE NOT EXISTS (SELECT 1 FROM estado_desafio WHERE lower(nombre) = 'cancelado');


INSERT INTO region (nombre)
SELECT r.nombre
  FROM (VALUES ('Región Metropolitana de Santiago'), ('Valparaíso'), ('Biobío')) AS r(nombre)
 WHERE NOT EXISTS (SELECT 1 FROM region x WHERE x.nombre = r.nombre);

INSERT INTO comunas (nombre, id_region)
SELECT c.comuna, r.id
  FROM (VALUES
    ('Región Metropolitana de Santiago', 'Santiago'), ('Región Metropolitana de Santiago', 'Cerrillos'),
    ('Región Metropolitana de Santiago', 'Cerro Navia'), ('Región Metropolitana de Santiago', 'Conchalí'),
    ('Región Metropolitana de Santiago', 'El Bosque'), ('Región Metropolitana de Santiago', 'Estación Central'),
    ('Región Metropolitana de Santiago', 'Huechuraba'), ('Región Metropolitana de Santiago', 'Independencia'),
    ('Región Metropolitana de Santiago', 'La Cisterna'), ('Región Metropolitana de Santiago', 'La Florida'),
    ('Región Metropolitana de Santiago', 'La Granja'), ('Región Metropolitana de Santiago', 'La Pintana'),
    ('Región Metropolitana de Santiago', 'La Reina'), ('Región Metropolitana de Santiago', 'Las Condes'),
    ('Región Metropolitana de Santiago', 'Lo Barnechea'), ('Región Metropolitana de Santiago', 'Lo Espejo'),
    ('Región Metropolitana de Santiago', 'Lo Prado'), ('Región Metropolitana de Santiago', 'Macul'),
    ('Región Metropolitana de Santiago', 'Maipú'), ('Región Metropolitana de Santiago', 'Ñuñoa'),
    ('Región Metropolitana de Santiago', 'Pedro Aguirre Cerda'), ('Región Metropolitana de Santiago', 'Peñalolén'),
    ('Región Metropolitana de Santiago', 'Providencia'), ('Región Metropolitana de Santiago', 'Pudahuel'),
    ('Región Metropolitana de Santiago', 'Quilicura'), ('Región Metropolitana de Santiago', 'Quinta Normal'),
    ('Región Metropolitana de Santiago', 'Recoleta'), ('Región Metropolitana de Santiago', 'Renca'),
    ('Región Metropolitana de Santiago', 'San Joaquín'), ('Región Metropolitana de Santiago', 'San Miguel'),
    ('Región Metropolitana de Santiago', 'San Ramón'), ('Región Metropolitana de Santiago', 'Vitacura'),
    ('Región Metropolitana de Santiago', 'Puente Alto'), ('Región Metropolitana de Santiago', 'Pirque'),
    ('Región Metropolitana de Santiago', 'San José de Maipo'), ('Región Metropolitana de Santiago', 'Colina'),
    ('Región Metropolitana de Santiago', 'Lampa'), ('Región Metropolitana de Santiago', 'Tiltil'),
    ('Región Metropolitana de Santiago', 'San Bernardo'), ('Región Metropolitana de Santiago', 'Buin'),
    ('Región Metropolitana de Santiago', 'Calera de Tango'), ('Región Metropolitana de Santiago', 'Paine'),
    ('Región Metropolitana de Santiago', 'Melipilla'), ('Región Metropolitana de Santiago', 'Alhué'),
    ('Región Metropolitana de Santiago', 'Curacaví'), ('Región Metropolitana de Santiago', 'María Pinto'),
    ('Región Metropolitana de Santiago', 'San Pedro'), ('Región Metropolitana de Santiago', 'Talagante'),
    ('Región Metropolitana de Santiago', 'El Monte'), ('Región Metropolitana de Santiago', 'Isla de Maipo'),
    ('Región Metropolitana de Santiago', 'Padre Hurtado'), ('Región Metropolitana de Santiago', 'Peñaflor'),
    ('Valparaíso', 'Valparaíso'), ('Valparaíso', 'Casablanca'), ('Valparaíso', 'Concón'),
    ('Valparaíso', 'Juan Fernández'), ('Valparaíso', 'Puchuncaví'), ('Valparaíso', 'Quintero'),
    ('Valparaíso', 'Viña del Mar'), ('Valparaíso', 'Isla de Pascua'), ('Valparaíso', 'Los Andes'),
    ('Valparaíso', 'Calle Larga'), ('Valparaíso', 'Rinconada'), ('Valparaíso', 'San Esteban'),
    ('Valparaíso', 'La Ligua'), ('Valparaíso', 'Cabildo'), ('Valparaíso', 'Papudo'),
    ('Valparaíso', 'Petorca'), ('Valparaíso', 'Zapallar'), ('Valparaíso', 'Quillota'),
    ('Valparaíso', 'La Calera'), ('Valparaíso', 'Hijuelas'), ('Valparaíso', 'La Cruz'),
    ('Valparaíso', 'Nogales'), ('Valparaíso', 'San Antonio'), ('Valparaíso', 'Algarrobo'),
    ('Valparaíso', 'Cartagena'), ('Valparaíso', 'El Quisco'), ('Valparaíso', 'El Tabo'),
    ('Valparaíso', 'Santo Domingo'), ('Valparaíso', 'San Felipe'), ('Valparaíso', 'Catemu'),
    ('Valparaíso', 'Llaillay'), ('Valparaíso', 'Panquehue'), ('Valparaíso', 'Putaendo'),
    ('Valparaíso', 'Santa María'), ('Valparaíso', 'Quilpué'), ('Valparaíso', 'Limache'),
    ('Valparaíso', 'Olmué'), ('Valparaíso', 'Villa Alemana'),
    ('Biobío', 'Concepción'), ('Biobío', 'Coronel'), ('Biobío', 'Chiguayante'), ('Biobío', 'Florida'),
    ('Biobío', 'Hualqui'), ('Biobío', 'Lota'), ('Biobío', 'Penco'), ('Biobío', 'San Pedro de la Paz'),
    ('Biobío', 'Santa Juana'), ('Biobío', 'Talcahuano'), ('Biobío', 'Tomé'), ('Biobío', 'Hualpén'),
    ('Biobío', 'Lebu'), ('Biobío', 'Arauco'), ('Biobío', 'Cañete'), ('Biobío', 'Contulmo'),
    ('Biobío', 'Curanilahue'), ('Biobío', 'Los Álamos'), ('Biobío', 'Tirúa'), ('Biobío', 'Los Ángeles'),
    ('Biobío', 'Antuco'), ('Biobío', 'Cabrero'), ('Biobío', 'Laja'), ('Biobío', 'Mulchén'),
    ('Biobío', 'Nacimiento'), ('Biobío', 'Negrete'), ('Biobío', 'Quilaco'), ('Biobío', 'Quilleco'),
    ('Biobío', 'San Rosendo'), ('Biobío', 'Santa Bárbara'), ('Biobío', 'Tucapel'), ('Biobío', 'Yumbel'),
    ('Biobío', 'Alto Biobío')
  ) AS c(region, comuna)
  JOIN region r ON r.nombre = c.region
 WHERE NOT EXISTS (SELECT 1 FROM comunas x WHERE x.nombre = c.comuna AND x.id_region = r.id);


ALTER TABLE usuario
    ADD COLUMN IF NOT EXISTS terminos_version      VARCHAR(20),
    ADD COLUMN IF NOT EXISTS privacidad_version    VARCHAR(20),
    ADD COLUMN IF NOT EXISTS terminos_aceptados_en TIMESTAMPTZ;


CREATE UNIQUE INDEX IF NOT EXISTS ux_cancha_nombre_por_recinto
    ON cancha (id_recinto_deportivo, lower(nombre));


ALTER TABLE reservar_cancha
    ADD COLUMN IF NOT EXISTS costo NUMERIC(10, 2) CHECK (costo IS NULL OR costo >= 0);


INSERT INTO tipo_notificacion (nombre)
SELECT t.nombre
  FROM (VALUES ('solicitud_equipo'), ('invitacion'), ('desafio'), ('partido'), ('reserva'),
               ('comentario'), ('equipo'), ('moderacion')) AS t(nombre)
 WHERE NOT EXISTS (SELECT 1 FROM tipo_notificacion x WHERE lower(x.nombre) = t.nombre);

ALTER TABLE notificacion
    ADD COLUMN IF NOT EXISTS enlace VARCHAR(255);

CREATE INDEX IF NOT EXISTS ix_notificacion_usuario ON notificacion (id_usuario, leida, fecha DESC);


ALTER TABLE comentario
    ADD COLUMN IF NOT EXISTS oculto    BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS oculto_en TIMESTAMPTZ;


CREATE TABLE IF NOT EXISTS equipo_posicion_buscada (
    id_equipo   INT NOT NULL REFERENCES equipo(id) ON DELETE CASCADE,
    id_posicion INT NOT NULL REFERENCES posicion(id),
    PRIMARY KEY (id_equipo, id_posicion)
);
ALTER TABLE equipo_posicion_buscada ENABLE ROW LEVEL SECURITY;


ALTER TABLE partido
    ADD COLUMN IF NOT EXISTS cancelado          BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS motivo_cancelacion VARCHAR(200),
    ADD COLUMN IF NOT EXISTS fecha_resultado    TIMESTAMPTZ;


ALTER TABLE reservar_cancha
    ADD COLUMN IF NOT EXISTS id_partido INT REFERENCES partido(id);
