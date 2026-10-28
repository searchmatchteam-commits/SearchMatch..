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


-- ============================================================
-- SA-1) ROL SUPERADMINISTRADOR (/admin/super)
-- ============================================================
-- Puede todo lo del administrador y además eliminar equipos y cuentas de jugadores.
-- Se asigna con: node scripts/hacer-admin.js correo@ejemplo.com --super
INSERT INTO rol_aplicacion (nombre)
SELECT 'superadministrador'
 WHERE NOT EXISTS (SELECT 1 FROM rol_aplicacion WHERE lower(nombre) = 'superadministrador');

-- Solo puede haber UN superadministrador: índice único parcial sobre una constante.
-- (Al iniciar sesión, esa cuenta entra directo a /admin/super.)
DO $$
DECLARE id_super INT;
BEGIN
    SELECT id INTO id_super FROM rol_aplicacion WHERE lower(nombre) = 'superadministrador';
    EXECUTE format('CREATE UNIQUE INDEX IF NOT EXISTS ux_un_solo_superadmin ON usuario ((true)) WHERE id_rol_aplicacion = %s', id_super);
END $$;


-- ============================================================
-- SA-2) TORNEOS (/admin/super/torneos)
-- ============================================================
-- formato: 'liga' (todos contra todos, larga) o 'relampago' (torneo corto, eliminación en un día o fin de semana).
-- patrocinadores / premios: texto libre; NULL = no hay.
CREATE TABLE IF NOT EXISTS torneo (
    id               INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre           VARCHAR(100) NOT NULL,
    formato          VARCHAR(20)  NOT NULL CHECK (formato IN ('liga', 'relampago')),
    id_modalidad     INT NOT NULL REFERENCES modalidad(id),
    cantidad_equipos SMALLINT NOT NULL CHECK (cantidad_equipos BETWEEN 2 AND 64),
    id_cancha        INT NOT NULL REFERENCES cancha(id),
    patrocinadores   VARCHAR(500),
    premios          VARCHAR(500),
    creado_en        TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE torneo ENABLE ROW LEVEL SECURITY;


-- ============================================================
-- SA-3) TORNEOS: FOTO, PATROCINADORES, INSCRIPCIONES Y PARTIDOS
-- ============================================================
-- estado: 'inscripcion' (los capitanes inscriben equipos) → 'en_curso' (el superadmin lo empezó con
-- todos los cupos llenos) → 'finalizado' (se jugó todo; id_campeon = ganador).
-- Relámpago: cantidad_equipos 4, 8, 16 o 32 (llaves de eliminación directa). Liga: 3 a 20 (todos contra todos).
ALTER TABLE torneo
    ADD COLUMN IF NOT EXISTS foto             BYTEA,
    ADD COLUMN IF NOT EXISTS foto_tipo        VARCHAR(20),
    ADD COLUMN IF NOT EXISTS foto_actualizada TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS estado           VARCHAR(20) NOT NULL DEFAULT 'inscripcion'
        CHECK (estado IN ('inscripcion', 'en_curso', 'finalizado')),
    ADD COLUMN IF NOT EXISTS id_campeon       INT REFERENCES equipo(id) ON DELETE SET NULL;

-- Reemplaza al texto libre torneo.patrocinadores: cada patrocinador con su nombre y su logo.
CREATE TABLE IF NOT EXISTS torneo_patrocinador (
    id        INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_torneo INT NOT NULL REFERENCES torneo(id) ON DELETE CASCADE,
    nombre    VARCHAR(100) NOT NULL,
    logo      BYTEA NOT NULL,
    logo_tipo VARCHAR(20) NOT NULL
);
ALTER TABLE torneo_patrocinador ENABLE ROW LEVEL SECURITY;
ALTER TABLE torneo DROP COLUMN IF EXISTS patrocinadores;

CREATE TABLE IF NOT EXISTS torneo_equipo (
    id_torneo   INT NOT NULL REFERENCES torneo(id) ON DELETE CASCADE,
    id_equipo   INT NOT NULL REFERENCES equipo(id) ON DELETE CASCADE,
    inscrito_en TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (id_torneo, id_equipo)
);
ALTER TABLE torneo_equipo ENABLE ROW LEVEL SECURITY;

-- ronda: n.º de fecha (liga) o de ronda de la llave (relámpago, 1 = primera). orden: posición dentro de la ronda;
-- en la llave, los ganadores de los partidos 2k y 2k+1 se enfrentan en el partido k de la ronda siguiente.
-- Si se elimina un equipo, su lugar queda vacío (NULL) y el rival gana el partido.
CREATE TABLE IF NOT EXISTS torneo_partido (
    id           INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_torneo    INT NOT NULL REFERENCES torneo(id) ON DELETE CASCADE,
    ronda        SMALLINT NOT NULL,
    orden        SMALLINT NOT NULL,
    id_local     INT REFERENCES equipo(id) ON DELETE SET NULL,
    id_visita    INT REFERENCES equipo(id) ON DELETE SET NULL,
    goles_local  SMALLINT CHECK (goles_local >= 0),
    goles_visita SMALLINT CHECK (goles_visita >= 0),
    id_ganador   INT REFERENCES equipo(id) ON DELETE SET NULL,
    jugado       BOOLEAN NOT NULL DEFAULT FALSE,
    UNIQUE (id_torneo, ronda, orden)
);
ALTER TABLE torneo_partido ENABLE ROW LEVEL SECURITY;


-- ============================================================
-- SA-4) TORNEOS: EMPAREJAMIENTO DE LA PRIMERA RONDA / FIXTURE
-- ============================================================
-- emparejamiento: 'llegada' (los cruces siguen el orden de inscripción: 1° vs 2°, 3° vs 4°...)
-- o 'sorteo' (tómbola: se barajan al empezar el torneo). Se puede cambiar mientras haya inscripciones.
ALTER TABLE torneo
    ADD COLUMN IF NOT EXISTS emparejamiento VARCHAR(10) NOT NULL DEFAULT 'sorteo'
        CHECK (emparejamiento IN ('llegada', 'sorteo'));


-- ============================================================
-- SA-5) TORNEOS: FECHA Y HORA DE INICIO (calendario)
-- ============================================================
-- Opcionales: NULL = "Por confirmar". La hora solo tiene sentido con fecha (hora de Chile).
ALTER TABLE torneo
    ADD COLUMN IF NOT EXISTS fecha_inicio DATE,
    ADD COLUMN IF NOT EXISTS hora_inicio  TIME;
ALTER TABLE torneo DROP CONSTRAINT IF EXISTS torneo_hora_con_fecha;
ALTER TABLE torneo ADD CONSTRAINT torneo_hora_con_fecha CHECK (hora_inicio IS NULL OR fecha_inicio IS NOT NULL);
CREATE INDEX IF NOT EXISTS ix_torneo_fecha_inicio ON torneo (fecha_inicio) WHERE fecha_inicio IS NOT NULL;


-- ============================================================
-- EQ-UB) UBICACIÓN DEL EQUIPO (distancia en /matchmaking y en "Desafiar a otro equipo")
-- ============================================================
-- Dónde suele jugar el equipo; la marca el capitán en /mi-equipo. Se guarda con 3 decimales
-- (~100 m) a propósito: alcanza para "A 1,2 km" sin guardar una dirección exacta.
-- A los demás equipos solo se les muestra la distancia (se calcula en la base), nunca el punto.
-- Las dos columnas van juntas: o ambas o ninguna.
ALTER TABLE equipo
    ADD COLUMN IF NOT EXISTS latitud  NUMERIC(6, 3) CHECK (latitud BETWEEN -90 AND 90),
    ADD COLUMN IF NOT EXISTS longitud NUMERIC(7, 3) CHECK (longitud BETWEEN -180 AND 180);
ALTER TABLE equipo DROP CONSTRAINT IF EXISTS equipo_ubicacion_completa;
ALTER TABLE equipo ADD CONSTRAINT equipo_ubicacion_completa CHECK ((latitud IS NULL) = (longitud IS NULL));


-- ============================================================
-- SA-6) PANEL DE ADMINISTRACIÓN: CUENTAS DEL PANEL, SESIONES, BLOQUEO Y REGISTRO DE ACTIVIDAD
--       (AP-001, AP-011, AP-032)
-- ============================================================
-- Cuentas del panel: rol 'administrador' o 'superadministrador' (= Administrador principal, el único
-- que gestiona administradores). Son distintas de las de jugador: no entran por /login, solo por /admin/login.
-- admin_nombre: nombre visible (las cuentas del panel no tienen perfil de jugador).
-- admin_seleccionado_en / _por: cuándo y quién la seleccionó. admin_revocado_en: NULL = acceso vigente.
ALTER TABLE usuario
    ADD COLUMN IF NOT EXISTS admin_nombre           VARCHAR(100),
    ADD COLUMN IF NOT EXISTS admin_seleccionado_en  TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS admin_seleccionado_por INT REFERENCES usuario(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS admin_revocado_en      TIMESTAMPTZ;

UPDATE usuario u SET admin_seleccionado_en = now()
  FROM rol_aplicacion r
 WHERE r.id = u.id_rol_aplicacion AND lower(r.nombre) IN ('administrador', 'superadministrador')
   AND u.admin_seleccionado_en IS NULL;

-- Sesión del panel (AP-001): aparte de la de Supabase. La cookie sm_admin guarda un token al azar;
-- aquí solo su SHA-256. Se cierra al salir, al revocar la cuenta o tras 30 minutos sin actividad.
CREATE TABLE IF NOT EXISTS admin_sesion (
    id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    token_hash       CHAR(64)    NOT NULL UNIQUE,
    id_usuario       INT         NOT NULL REFERENCES usuario(id) ON DELETE CASCADE,
    creada_en        TIMESTAMPTZ NOT NULL DEFAULT now(),
    ultima_actividad TIMESTAMPTZ NOT NULL DEFAULT now(),
    cerrada_en       TIMESTAMPTZ,
    motivo_cierre    VARCHAR(30)
);
CREATE INDEX IF NOT EXISTS ix_admin_sesion_usuario ON admin_sesion (id_usuario) WHERE cerrada_en IS NULL;
ALTER TABLE admin_sesion ENABLE ROW LEVEL SECURITY;

-- Intentos fallidos en /admin/login por correo (exista o no la cuenta, así no se revela cuáles existen).
-- 5 seguidos → bloqueado_hasta = ahora + 15 minutos.
CREATE TABLE IF NOT EXISTS admin_intento (
    correo         VARCHAR(150) PRIMARY KEY,
    fallidos       SMALLINT    NOT NULL DEFAULT 0,
    bloqueado_hasta TIMESTAMPTZ,
    actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE admin_intento ENABLE ROW LEVEL SECURITY;

-- Registro de actividad (AP-032): solo inserción. id_admin y admin_nombre se guardan tal cual
-- (sin clave foránea) para que la entrada sobreviva aunque cambie la cuenta.
CREATE TABLE IF NOT EXISTS admin_actividad (
    id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    fecha          TIMESTAMPTZ  NOT NULL DEFAULT now(),
    id_admin       INT,
    admin_nombre   VARCHAR(150),
    seccion        VARCHAR(40)  NOT NULL,
    accion         VARCHAR(60)  NOT NULL,
    elemento_tipo  VARCHAR(40),
    elemento_id    VARCHAR(40),
    elemento       VARCHAR(200),
    motivo         VARCHAR(500),
    valor_anterior JSONB,
    valor_nuevo    JSONB
);
CREATE INDEX IF NOT EXISTS ix_admin_actividad_fecha ON admin_actividad (fecha DESC);
CREATE INDEX IF NOT EXISTS ix_admin_actividad_admin ON admin_actividad (id_admin, fecha DESC);
ALTER TABLE admin_actividad ENABLE ROW LEVEL SECURITY;

-- Nadie edita ni borra el registro: el trigger corre también para el dueño de la tabla.
CREATE OR REPLACE FUNCTION admin_actividad_solo_insercion() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'El registro de actividad no se puede modificar ni borrar.' USING ERRCODE = 'insufficient_privilege';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_admin_actividad_inmutable ON admin_actividad;
CREATE TRIGGER tr_admin_actividad_inmutable
    BEFORE UPDATE OR DELETE ON admin_actividad
    FOR EACH ROW EXECUTE FUNCTION admin_actividad_solo_insercion();
DROP TRIGGER IF EXISTS tr_admin_actividad_sin_truncate ON admin_actividad;
CREATE TRIGGER tr_admin_actividad_sin_truncate
    BEFORE TRUNCATE ON admin_actividad
    FOR EACH STATEMENT EXECUTE FUNCTION admin_actividad_solo_insercion();

DO $$
BEGIN
    REVOKE UPDATE, DELETE, TRUNCATE ON admin_actividad FROM PUBLIC;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        REVOKE ALL ON admin_actividad FROM anon;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        REVOKE ALL ON admin_actividad FROM authenticated;
    END IF;
END $$;
