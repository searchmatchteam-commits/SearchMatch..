-- ============================================================
-- sql/nuevas_tablas.sql  (PostgreSQL — SQL Editor de Supabase)
-- ============================================================
-- Tablas, columnas y datos de catálogo NUEVOS (avance al 75 %).
-- No modifica ni borra nada de sql/seed.sql: solo agrega.
-- Re-ejecutable: cada INSERT revisa antes si el dato ya existe
-- (WHERE NOT EXISTS) y cada tabla/columna usa IF NOT EXISTS.
-- Se ejecuta DESPUÉS de sql/seed.sql. Cada sección dice la historia o regla que la usa.
-- ============================================================


-- ============================================================
-- 0B-1) ESTADOS "CANCELADA" (reglas 6 y 13; PE-011 y DE-013)
-- ============================================================
-- Solicitud o invitación que se anula sin responderla
-- (ej. el jugador aceptó la invitación del mismo equipo).
INSERT INTO estado_solicitud (nombre)
SELECT 'cancelada'
 WHERE NOT EXISTS (SELECT 1 FROM estado_solicitud WHERE lower(nombre) = 'cancelada');

-- Desafío que el equipo desafiante retira antes de que lo respondan.
INSERT INTO estado_desafio (nombre)
SELECT 'cancelado'
 WHERE NOT EXISTS (SELECT 1 FROM estado_desafio WHERE lower(nombre) = 'cancelado');


-- ============================================================
-- 0B-2) REGIONES Y COMUNAS (regla 11; AD-001, DE-004, DE-007)
-- ============================================================
-- Las 3 regiones del seed con todas sus comunas. Para sumar otra región
-- basta con agregarla a las dos listas de abajo.
INSERT INTO region (nombre)
SELECT r.nombre
  FROM (VALUES ('Región Metropolitana de Santiago'), ('Valparaíso'), ('Biobío')) AS r(nombre)
 WHERE NOT EXISTS (SELECT 1 FROM region x WHERE x.nombre = r.nombre);

INSERT INTO comunas (nombre, id_region)
SELECT c.comuna, r.id
  FROM (VALUES
    -- Región Metropolitana (52)
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
    -- Valparaíso (38)
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
    -- Biobío (33)
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


-- ============================================================
-- F1-1) ACEPTACIÓN DE TÉRMINOS Y PRIVACIDAD (AR-011)
-- ============================================================
-- Qué versión de cada documento aceptó la cuenta y cuándo. NULL = nunca aceptó
-- (las cuentas anteriores deberán aceptar al entrar). Las versiones vigentes están en config/legal.js.
ALTER TABLE usuario
    ADD COLUMN IF NOT EXISTS terminos_version      VARCHAR(20),
    ADD COLUMN IF NOT EXISTS privacidad_version    VARCHAR(20),
    ADD COLUMN IF NOT EXISTS terminos_aceptados_en TIMESTAMPTZ;


-- ============================================================
-- F2-1) NOMBRE DE CANCHA ÚNICO DENTRO DE UN RECINTO (AD-002, AD-009)
-- ============================================================
-- Sin importar mayúsculas: "Cancha 1" y "cancha 1" son la misma.
CREATE UNIQUE INDEX IF NOT EXISTS ux_cancha_nombre_por_recinto
    ON cancha (id_recinto_deportivo, lower(nombre));


-- ============================================================
-- F2-2) COSTO GUARDADO EN CADA RESERVA (AD-009, PA-002)
-- ============================================================
-- Se calcula al reservar (precio por hora × duración) y no cambia si después
-- el administrador edita el precio de la cancha.
ALTER TABLE reservar_cancha
    ADD COLUMN IF NOT EXISTS costo NUMERIC(10, 2) CHECK (costo IS NULL OR costo >= 0);


-- ============================================================
-- F4-1) TIPOS DE NOTIFICACIÓN Y ENLACE AL ELEMENTO (NT-001, NT-004)
-- ============================================================
-- Un tipo por clase de evento (la clave es la que usa models/notificacionModel.js).
INSERT INTO tipo_notificacion (nombre)
SELECT t.nombre
  FROM (VALUES ('solicitud_equipo'), ('invitacion'), ('desafio'), ('partido'), ('reserva'),
               ('comentario'), ('equipo'), ('moderacion')) AS t(nombre)
 WHERE NOT EXISTS (SELECT 1 FROM tipo_notificacion x WHERE lower(x.nombre) = t.nombre);

-- A dónde lleva la notificación al abrirla (ej. /desafios/12). NULL = solo informativa.
ALTER TABLE notificacion
    ADD COLUMN IF NOT EXISTS enlace VARCHAR(255);

CREATE INDEX IF NOT EXISTS ix_notificacion_usuario ON notificacion (id_usuario, leida, fecha DESC);


-- ============================================================
-- F6-1) MODERACIÓN DE COMENTARIOS (AD-013)
-- ============================================================
-- El comentario retirado no se borra (queda como respaldo): se oculta a todos.
ALTER TABLE comentario
    ADD COLUMN IF NOT EXISTS oculto    BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS oculto_en TIMESTAMPTZ;


-- ============================================================
-- F6-2) POSICIONES QUE BUSCA UN EQUIPO (PE-021)
-- ============================================================
CREATE TABLE IF NOT EXISTS equipo_posicion_buscada (
    id_equipo   INT NOT NULL REFERENCES equipo(id) ON DELETE CASCADE,
    id_posicion INT NOT NULL REFERENCES posicion(id),
    PRIMARY KEY (id_equipo, id_posicion)
);
ALTER TABLE equipo_posicion_buscada ENABLE ROW LEVEL SECURITY;


-- ============================================================
-- F7-1) PARTIDOS CANCELADOS Y RESULTADO (PA-005, PA-007)
-- ============================================================
ALTER TABLE partido
    ADD COLUMN IF NOT EXISTS cancelado          BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS motivo_cancelacion VARCHAR(200),
    ADD COLUMN IF NOT EXISTS fecha_resultado    TIMESTAMPTZ;


-- ============================================================
-- F7-2) RESERVA ASOCIADA A UN PARTIDO (PA-001, PA-003, PA-007)
-- ============================================================
-- Al programar un partido se crea su reserva; así se sabe que no se puede cancelar sola.
ALTER TABLE reservar_cancha
    ADD COLUMN IF NOT EXISTS id_partido INT REFERENCES partido(id);


-- ============================================================
-- F8-1) FORMACIÓN Y ALINEACIÓN DEL EQUIPO (/crear-equipo y /mi-equipo)
-- ============================================================
-- Reemplazada por F8-2 (una alineación por modalidad): F8-2 copia estos datos y retira las columnas.
-- formacion: líneas de jugadores de campo, ej. '4-3-3' (config/equipo.js, FORMACIONES).
-- NULL = la primera formación de su modalidad.
-- puesto: índice del puesto titular en la formación (0 = arquero); NULL = suplente.
-- Cada puesto lo ocupa un solo jugador por equipo.
ALTER TABLE equipo
    ADD COLUMN IF NOT EXISTS formacion VARCHAR(10);

ALTER TABLE equipo_jugador
    ADD COLUMN IF NOT EXISTS puesto SMALLINT CHECK (puesto BETWEEN 0 AND 10);

CREATE UNIQUE INDEX IF NOT EXISTS ux_equipo_jugador_puesto
    ON equipo_jugador (id_equipo, puesto) WHERE puesto IS NOT NULL;


-- ============================================================
-- F8-2) VARIAS MODALIDADES POR EQUIPO, ALINEACIÓN DE CADA UNA Y MODALIDAD DEL DESAFÍO
-- ============================================================
-- Un equipo puede jugar varias modalidades (ej. Fútbol 7 y Fútbol 11). equipo.id_modalidad
-- queda como la modalidad principal (una de las de equipo_modalidad).
-- formacion: líneas de jugadores de campo, ej. '4-3-3' (config/equipo.js, FORMACIONES);
-- NULL = la primera formación de la modalidad.
CREATE TABLE IF NOT EXISTS equipo_modalidad (
    id_equipo    INT NOT NULL REFERENCES equipo(id) ON DELETE CASCADE,
    id_modalidad INT NOT NULL REFERENCES modalidad(id),
    formacion    VARCHAR(10),
    PRIMARY KEY (id_equipo, id_modalidad)
);
ALTER TABLE equipo_modalidad ENABLE ROW LEVEL SECURITY;

INSERT INTO equipo_modalidad (id_equipo, id_modalidad)
SELECT id, id_modalidad FROM equipo WHERE id_modalidad IS NOT NULL
ON CONFLICT DO NOTHING;

-- Titulares de cada alineación: puesto = índice en la formación (0 = arquero); quien no está aquí es suplente.
-- Si el jugador sale del plantel o el equipo deja la modalidad, sus puestos se borran solos.
CREATE TABLE IF NOT EXISTS alineacion_puesto (
    id_equipo    INT NOT NULL,
    id_modalidad INT NOT NULL,
    id_jugador   INT NOT NULL,
    puesto       SMALLINT NOT NULL CHECK (puesto BETWEEN 0 AND 10),
    PRIMARY KEY (id_equipo, id_modalidad, id_jugador),
    UNIQUE (id_equipo, id_modalidad, puesto),
    FOREIGN KEY (id_equipo, id_modalidad) REFERENCES equipo_modalidad (id_equipo, id_modalidad) ON DELETE CASCADE,
    FOREIGN KEY (id_jugador, id_equipo) REFERENCES equipo_jugador (id_jugador, id_equipo) ON DELETE CASCADE
);
ALTER TABLE alineacion_puesto ENABLE ROW LEVEL SECURITY;

-- Lo guardado con F8-1 (una sola alineación por equipo) pasa a las tablas nuevas y esas columnas se retiran.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'equipo' AND column_name = 'formacion') THEN
        UPDATE equipo_modalidad em SET formacion = e.formacion
          FROM equipo e WHERE e.id = em.id_equipo AND e.id_modalidad = em.id_modalidad AND e.formacion IS NOT NULL;
        ALTER TABLE equipo DROP COLUMN formacion;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'equipo_jugador' AND column_name = 'puesto') THEN
        INSERT INTO alineacion_puesto (id_equipo, id_modalidad, id_jugador, puesto)
        SELECT ej.id_equipo, e.id_modalidad, ej.id_jugador, ej.puesto
          FROM equipo_jugador ej JOIN equipo e ON e.id = ej.id_equipo
         WHERE ej.puesto IS NOT NULL AND e.id_modalidad IS NOT NULL
        ON CONFLICT DO NOTHING;
        DROP INDEX IF EXISTS ux_equipo_jugador_puesto;
        ALTER TABLE equipo_jugador DROP COLUMN puesto;
    END IF;
END $$;

-- En qué modalidad se juega el desafío (una que tengan los dos equipos). NULL en los antiguos:
-- se usa la modalidad principal del desafiante.
ALTER TABLE desafio
    ADD COLUMN IF NOT EXISTS id_modalidad INT REFERENCES modalidad(id);
