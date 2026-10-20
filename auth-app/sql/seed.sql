-- ============================================================
-- sql/seed.sql  (PostgreSQL — para el SQL Editor de Supabase)
-- ============================================================
-- Esquema COMPLETO de searchmatch portado de MySQL a PostgreSQL,
-- más la tabla "usuarios" que usa auth-app.
--
-- Ejecutar tal cual en: Supabase Dashboard -> SQL Editor -> Run
-- Todo usa IF NOT EXISTS / ON CONFLICT DO NOTHING: se puede re-ejecutar
-- sin romper datos existentes.
--
-- Conversiones aplicadas (MySQL -> PostgreSQL):
--   * AUTO_INCREMENT           ->  SERIAL
--   * DATETIME DEFAULT NOW()   ->  TIMESTAMPTZ DEFAULT NOW()
--   * CREATE DATABASE / USE    ->  no aplica (Supabase ya tiene la base
--                                  "postgres" y usamos el esquema public)
--   * BOOLEAN / DECIMAL / VARCHAR / CHECK  ->  idénticos
-- ============================================================


-- ============================================================
-- A) TABLA ANTIGUA DE LA APP (ya no se usa)
-- ============================================================
-- La usaba la primera versión de auth-app (login propio con bcrypt).
-- Desde la integración con Supabase Auth, la app usa "usuario" y
-- "jugador" (ver sección U al final). Se deja para no romper datos.

CREATE TABLE IF NOT EXISTS usuarios (
    id            SERIAL PRIMARY KEY,
    nombre        TEXT        NOT NULL,
    email         TEXT        NOT NULL UNIQUE,
    password_hash TEXT        NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_usuarios_email ON usuarios (email);


-- ============================================================
-- B) CATÁLOGOS DE SEARCHMATCH
-- ============================================================

CREATE TABLE IF NOT EXISTS rol_aplicacion (
    id     SERIAL PRIMARY KEY,
    nombre VARCHAR(50) NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS nivel (
    id           SERIAL PRIMARY KEY,
    nombre       VARCHAR(50) NOT NULL UNIQUE,
    puntaje_min  INT NOT NULL,
    puntaje_max  INT NOT NULL,
    CHECK (puntaje_min >= 0),
    CHECK (puntaje_max >= puntaje_min)
);

CREATE TABLE IF NOT EXISTS posicion (
    id     SERIAL PRIMARY KEY,
    nombre VARCHAR(50) NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS rol_equipo (
    id     SERIAL PRIMARY KEY,
    nombre VARCHAR(50) NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS estado_solicitud (
    id     SERIAL PRIMARY KEY,
    nombre VARCHAR(50) NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS estado_desafio (
    id     SERIAL PRIMARY KEY,
    nombre VARCHAR(50) NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS estado_reserva (
    id     SERIAL PRIMARY KEY,
    nombre VARCHAR(50) NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS tipo_notificacion (
    id     SERIAL PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS modalidad (
    id                    SERIAL PRIMARY KEY,
    nombre                VARCHAR(50) NOT NULL UNIQUE,
    cantidad_de_jugadores INT NOT NULL,
    CHECK (cantidad_de_jugadores > 0)
);


-- ============================================================
-- C) UBICACIÓN
-- ============================================================

CREATE TABLE IF NOT EXISTS region (
    id     SERIAL PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS comunas (
    id        SERIAL PRIMARY KEY,
    nombre    VARCHAR(100) NOT NULL,
    id_region INT NOT NULL,

    CONSTRAINT fk_comunas_region
        FOREIGN KEY (id_region)
        REFERENCES region(id),

    UNIQUE (nombre, id_region)
);

CREATE TABLE IF NOT EXISTS direccion (
    id          SERIAL PRIMARY KEY,
    calle       VARCHAR(150) NOT NULL,
    numero      VARCHAR(20),
    referencias VARCHAR(255),
    id_comunas  INT NOT NULL,

    CONSTRAINT fk_direccion_comunas
        FOREIGN KEY (id_comunas)
        REFERENCES comunas(id)
);


-- ============================================================
-- D) USUARIO DE SEARCHMATCH
-- ============================================================

CREATE TABLE IF NOT EXISTS usuario (
    id                  SERIAL PRIMARY KEY,
    correo              VARCHAR(150) NOT NULL UNIQUE,
    correo_secundario   VARCHAR(150),
    telefono            VARCHAR(20),
    contrasena          VARCHAR(255) NOT NULL,
    id_rol_aplicacion   INT NOT NULL,
    activo              BOOLEAN NOT NULL DEFAULT TRUE,

    CONSTRAINT fk_usuario_rol_aplicacion
        FOREIGN KEY (id_rol_aplicacion)
        REFERENCES rol_aplicacion(id)
);


-- ============================================================
-- E) JUGADOR
-- ============================================================

CREATE TABLE IF NOT EXISTS jugador (
    id               SERIAL PRIMARY KEY,
    fecha_nacimiento DATE NOT NULL,
    altura           DECIMAL(5,2),
    peso             DECIMAL(5,2),
    nombre_apodo     VARCHAR(100) NOT NULL,
    apellido         VARCHAR(100) NOT NULL,
    id_usuario       INT NOT NULL UNIQUE,

    CONSTRAINT fk_jugador_usuario
        FOREIGN KEY (id_usuario)
        REFERENCES usuario(id),

    CHECK (altura IS NULL OR altura > 0),
    CHECK (peso IS NULL OR peso > 0)
);


-- ============================================================
-- F) POSICIONES DEL JUGADOR
-- ============================================================

CREATE TABLE IF NOT EXISTS jugador_posicion (
    id           SERIAL PRIMARY KEY,
    id_jugador   INT NOT NULL,
    id_posicion  INT NOT NULL,

    CONSTRAINT fk_jugador_posicion_jugador
        FOREIGN KEY (id_jugador)
        REFERENCES jugador(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_jugador_posicion_posicion
        FOREIGN KEY (id_posicion)
        REFERENCES posicion(id),

    UNIQUE (id_jugador, id_posicion)
);


-- ============================================================
-- G) EQUIPO
-- ============================================================

CREATE TABLE IF NOT EXISTS equipo (
    id                 SERIAL PRIMARY KEY,
    nombre             VARCHAR(100) NOT NULL,
    id_comuna          INT NOT NULL,
    id_usuario_creador INT NOT NULL,
    activo             BOOLEAN NOT NULL DEFAULT TRUE,
    puntaje_nivel      INT NOT NULL DEFAULT 0,

    CONSTRAINT fk_equipo_comuna
        FOREIGN KEY (id_comuna)
        REFERENCES comunas(id),

    CONSTRAINT fk_equipo_usuario_creador
        FOREIGN KEY (id_usuario_creador)
        REFERENCES usuario(id),

    CHECK (puntaje_nivel >= 0)
);


-- ============================================================
-- H) JUGADORES DE UN EQUIPO
-- ============================================================

CREATE TABLE IF NOT EXISTS equipo_jugador (
    id            SERIAL PRIMARY KEY,
    id_jugador    INT NOT NULL,
    id_equipo     INT NOT NULL,
    id_rol_equipo INT NOT NULL,

    CONSTRAINT fk_equipo_jugador_jugador
        FOREIGN KEY (id_jugador)
        REFERENCES jugador(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_equipo_jugador_equipo
        FOREIGN KEY (id_equipo)
        REFERENCES equipo(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_equipo_jugador_rol
        FOREIGN KEY (id_rol_equipo)
        REFERENCES rol_equipo(id),

    UNIQUE (id_jugador, id_equipo)
);


-- ============================================================
-- I) SOLICITUD PARA UNIRSE A UN EQUIPO
-- ============================================================

CREATE TABLE IF NOT EXISTS solicitud_union_equipo (
    id                  SERIAL PRIMARY KEY,
    id_jugador          INT NOT NULL,
    id_equipo           INT NOT NULL,
    id_estado_solicitud INT NOT NULL,
    fecha_solicitud     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    fecha_respuesta     TIMESTAMPTZ,

    CONSTRAINT fk_solicitud_jugador
        FOREIGN KEY (id_jugador)
        REFERENCES jugador(id),

    CONSTRAINT fk_solicitud_equipo
        FOREIGN KEY (id_equipo)
        REFERENCES equipo(id),

    CONSTRAINT fk_solicitud_estado
        FOREIGN KEY (id_estado_solicitud)
        REFERENCES estado_solicitud(id)
);


-- ============================================================
-- J) RECINTO DEPORTIVO
-- ============================================================

CREATE TABLE IF NOT EXISTS recinto_deportivo (
    id           SERIAL PRIMARY KEY,
    nombre       VARCHAR(150) NOT NULL,
    telefono     VARCHAR(20),
    latitud      DECIMAL(10,8),
    longitud     DECIMAL(11,8),
    activo       BOOLEAN NOT NULL DEFAULT TRUE,
    id_direccion INT NOT NULL UNIQUE,

    CONSTRAINT fk_recinto_direccion
        FOREIGN KEY (id_direccion)
        REFERENCES direccion(id)
);


-- ============================================================
-- K) CANCHA
-- ============================================================

CREATE TABLE IF NOT EXISTS cancha (
    id                   SERIAL PRIMARY KEY,
    nombre               VARCHAR(100) NOT NULL,
    precio_hora          DECIMAL(10,2) NOT NULL,
    activo               BOOLEAN NOT NULL DEFAULT TRUE,
    id_recinto_deportivo INT NOT NULL,
    id_modalidad         INT NOT NULL,

    CONSTRAINT fk_cancha_recinto
        FOREIGN KEY (id_recinto_deportivo)
        REFERENCES recinto_deportivo(id),

    CONSTRAINT fk_cancha_modalidad
        FOREIGN KEY (id_modalidad)
        REFERENCES modalidad(id),

    CHECK (precio_hora >= 0)
);


-- ============================================================
-- L) DISPONIBILIDAD DE CANCHA
-- ============================================================

CREATE TABLE IF NOT EXISTS disponibilidad_cancha (
    id             SERIAL PRIMARY KEY,
    dia_semana     VARCHAR(20) NOT NULL,
    hora_apertura  TIME NOT NULL,
    hora_cierre    TIME NOT NULL,
    id_cancha      INT NOT NULL,

    CONSTRAINT fk_disponibilidad_cancha
        FOREIGN KEY (id_cancha)
        REFERENCES cancha(id)
        ON DELETE CASCADE,

    CHECK (hora_cierre > hora_apertura)
);


-- ============================================================
-- M) RESERVA DE CANCHA
-- ============================================================

CREATE TABLE IF NOT EXISTS reservar_cancha (
    id                 SERIAL PRIMARY KEY,
    fecha              DATE NOT NULL,
    hora_inicio        TIME NOT NULL,
    hora_fin           TIME NOT NULL,
    id_cancha          INT NOT NULL,
    id_usuario_reserva INT NOT NULL,
    id_estado_reserva  INT NOT NULL,

    CONSTRAINT fk_reserva_cancha
        FOREIGN KEY (id_cancha)
        REFERENCES cancha(id),

    CONSTRAINT fk_reserva_usuario
        FOREIGN KEY (id_usuario_reserva)
        REFERENCES usuario(id),

    CONSTRAINT fk_reserva_estado
        FOREIGN KEY (id_estado_reserva)
        REFERENCES estado_reserva(id),

    CHECK (hora_fin > hora_inicio)
);


-- ============================================================
-- N) DESAFÍOS ENTRE EQUIPOS
-- ============================================================

CREATE TABLE IF NOT EXISTS desafio (
    id                   SERIAL PRIMARY KEY,
    mensaje              VARCHAR(500),
    fecha_solicitud      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    fecha_respuesta      TIMESTAMPTZ,
    id_equipo_desafiado  INT NOT NULL,
    id_equipo_desafiante INT NOT NULL,
    id_estado_desafio    INT NOT NULL,

    CONSTRAINT fk_desafio_equipo_desafiado
        FOREIGN KEY (id_equipo_desafiado)
        REFERENCES equipo(id),

    CONSTRAINT fk_desafio_equipo_desafiante
        FOREIGN KEY (id_equipo_desafiante)
        REFERENCES equipo(id),

    CONSTRAINT fk_desafio_estado
        FOREIGN KEY (id_estado_desafio)
        REFERENCES estado_desafio(id),

    CHECK (id_equipo_desafiado <> id_equipo_desafiante)
);


-- ============================================================
-- O) PARTIDO
-- ============================================================

CREATE TABLE IF NOT EXISTS partido (
    id                  SERIAL PRIMARY KEY,
    hora                TIME NOT NULL,
    fecha               DATE NOT NULL,
    marcador_desafiante INT,
    marcador_desafiado  INT,
    id_modalidad        INT NOT NULL,
    id_desafio          INT NOT NULL UNIQUE,
    id_cancha           INT NOT NULL,

    CONSTRAINT fk_partido_modalidad
        FOREIGN KEY (id_modalidad)
        REFERENCES modalidad(id),

    CONSTRAINT fk_partido_desafio
        FOREIGN KEY (id_desafio)
        REFERENCES desafio(id),

    CONSTRAINT fk_partido_cancha
        FOREIGN KEY (id_cancha)
        REFERENCES cancha(id),

    CHECK (marcador_desafiante IS NULL OR marcador_desafiante >= 0),
    CHECK (marcador_desafiado IS NULL OR marcador_desafiado >= 0)
);


-- ============================================================
-- P) PARTICIPACIÓN
-- ============================================================

CREATE TABLE IF NOT EXISTS participacion (
    id             SERIAL PRIMARY KEY,
    es_desafiante  BOOLEAN NOT NULL,
    id_equipo      INT NOT NULL,
    id_partido     INT NOT NULL,

    CONSTRAINT fk_participacion_equipo
        FOREIGN KEY (id_equipo)
        REFERENCES equipo(id),

    CONSTRAINT fk_participacion_partido
        FOREIGN KEY (id_partido)
        REFERENCES partido(id)
        ON DELETE CASCADE,

    UNIQUE (id_equipo, id_partido),
    UNIQUE (id_partido, es_desafiante)
);


-- ============================================================
-- Q) COMENTARIOS
-- ============================================================

CREATE TABLE IF NOT EXISTS comentario (
    id         SERIAL PRIMARY KEY,
    fecha      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    mensaje    VARCHAR(500) NOT NULL,
    id_equipo  INT NOT NULL,
    id_usuario INT NOT NULL,

    CONSTRAINT fk_comentario_equipo
        FOREIGN KEY (id_equipo)
        REFERENCES equipo(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_comentario_usuario
        FOREIGN KEY (id_usuario)
        REFERENCES usuario(id)
);


-- ============================================================
-- R) NOTIFICACIONES
-- ============================================================

CREATE TABLE IF NOT EXISTS notificacion (
    id                  SERIAL PRIMARY KEY,
    fecha               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    mensaje             VARCHAR(500) NOT NULL,
    leida               BOOLEAN NOT NULL DEFAULT FALSE,
    id_tipo_notificacion INT NOT NULL,
    id_usuario          INT NOT NULL,

    CONSTRAINT fk_notificacion_tipo
        FOREIGN KEY (id_tipo_notificacion)
        REFERENCES tipo_notificacion(id),

    CONSTRAINT fk_notificacion_usuario
        FOREIGN KEY (id_usuario)
        REFERENCES usuario(id)
        ON DELETE CASCADE
);


-- ============================================================
-- S) DATOS INICIALES (semilla)
-- ============================================================
-- ON CONFLICT DO NOTHING evita duplicados si el script corre más de una vez.

INSERT INTO rol_aplicacion (nombre) VALUES
    ('Jugador'),
    ('Administrador')
ON CONFLICT DO NOTHING;

INSERT INTO nivel (nombre, puntaje_min, puntaje_max) VALUES
    ('Novato',     0,  20),
    ('Intermedio', 21, 50),
    ('Avanzado',   51, 100),
    ('Élite',      101, 200)
ON CONFLICT DO NOTHING;

INSERT INTO posicion (nombre) VALUES
    ('Portero'),
    ('Defensa'),
    ('Mediocampista'),
    ('Delantero')
ON CONFLICT DO NOTHING;

INSERT INTO rol_equipo (nombre) VALUES
    ('Capitán'),
    ('Entrenador'),
    ('Jugador')
ON CONFLICT DO NOTHING;

INSERT INTO estado_solicitud (nombre) VALUES
    ('Pendiente'),
    ('Aprobada'),
    ('Rechazada')
ON CONFLICT DO NOTHING;

INSERT INTO estado_desafio (nombre) VALUES
    ('Pendiente'),
    ('Aceptado'),
    ('Rechazado'),
    ('Cancelado')
ON CONFLICT DO NOTHING;

INSERT INTO estado_reserva (nombre) VALUES
    ('Pendiente'),
    ('Confirmada'),
    ('Cancelada')
ON CONFLICT DO NOTHING;

INSERT INTO tipo_notificacion (nombre) VALUES
    ('Solicitud de unión a equipo'),
    ('Desafío recibido'),
    ('Reserva de cancha'),
    ('Comentario en equipo')
ON CONFLICT DO NOTHING;

INSERT INTO modalidad (nombre, cantidad_de_jugadores) VALUES
    ('Fútbol 5',  5),
    ('Fútbol 7',  7),
    ('Fútbol 11', 11)
ON CONFLICT DO NOTHING;

INSERT INTO region (nombre) VALUES
    ('Región Metropolitana de Santiago'),
    ('Valparaíso'),
    ('Biobío')
ON CONFLICT DO NOTHING;


-- ============================================================
-- T) VERIFICACIÓN (opcional)
-- ============================================================
-- Tras ejecutar, deberías ver ~25 tablas:
--   SELECT table_name FROM information_schema.tables
--   WHERE table_schema = 'public' ORDER BY table_name;


-- ============================================================
-- U) INTEGRACIÓN CON SUPABASE AUTH (la usa models/userModel.js)
-- ============================================================
-- Las contraseñas ahora las maneja Supabase Auth (tabla auth.users).
-- "usuario" se vincula a esa cuenta con id_auth (UUID).
-- Re-ejecutable: IF NOT EXISTS / DROP NOT NULL no fallan si ya se aplicó.

-- Vínculo con la cuenta de Supabase Auth.
ALTER TABLE usuario
    ADD COLUMN IF NOT EXISTS id_auth UUID UNIQUE
    REFERENCES auth.users(id) ON DELETE SET NULL;

-- La contraseña ya no se guarda en nuestras tablas.
ALTER TABLE usuario ALTER COLUMN contrasena DROP NOT NULL;

-- El registro no pide fecha de nacimiento; se podrá completar en el perfil.
ALTER TABLE jugador ALTER COLUMN fecha_nacimiento DROP NOT NULL;

-- RLS sin políticas: la API pública de Supabase (anon key) NO puede leer
-- estas tablas. El servidor entra por DATABASE_URL (rol postgres), que no
-- está sujeto a RLS, así que la app sigue funcionando.
ALTER TABLE usuario ENABLE ROW LEVEL SECURITY;
ALTER TABLE jugador ENABLE ROW LEVEL SECURITY;


-- ============================================================
-- V) PERFIL DEPORTIVO DEL JUGADOR (wizard /perfil-jugador y carta /perfil)
-- ============================================================
-- Re-ejecutable: solo AGREGA columnas (nullable) y catálogos; no borra ni
-- modifica datos existentes. La posición sigue en jugador_posicion.

ALTER TABLE jugador
    ADD COLUMN IF NOT EXISTS pie_habil       VARCHAR(10)
        CHECK (pie_habil IN ('izquierdo', 'derecho')),
    ADD COLUMN IF NOT EXISTS id_nivel        INT REFERENCES nivel(id),
    -- Estadísticas de la carta (1-99). Se generan al terminar el wizard
    -- y no se vuelven a sortear al editar el perfil.
    ADD COLUMN IF NOT EXISTS stat_ritmo      SMALLINT CHECK (stat_ritmo   BETWEEN 1 AND 99),
    ADD COLUMN IF NOT EXISTS stat_tiro       SMALLINT CHECK (stat_tiro    BETWEEN 1 AND 99),
    ADD COLUMN IF NOT EXISTS stat_pase       SMALLINT CHECK (stat_pase    BETWEEN 1 AND 99),
    ADD COLUMN IF NOT EXISTS stat_regate     SMALLINT CHECK (stat_regate  BETWEEN 1 AND 99),
    ADD COLUMN IF NOT EXISTS stat_defensa    SMALLINT CHECK (stat_defensa BETWEEN 1 AND 99),
    ADD COLUMN IF NOT EXISTS stat_fisico     SMALLINT CHECK (stat_fisico  BETWEEN 1 AND 99),
    ADD COLUMN IF NOT EXISTS perfil_completo BOOLEAN NOT NULL DEFAULT FALSE;

-- Niveles de experiencia que ofrece el wizard (se buscan por nombre).
INSERT INTO nivel (nombre, puntaje_min, puntaje_max) VALUES
    ('Principiante', 0,   299),
    ('Intermedio',   300, 699),
    ('Avanzado',     700, 1000)
ON CONFLICT (nombre) DO NOTHING;

-- Posiciones: se usan las de la sección de catálogos. El arco se busca
-- como 'Arquero' o 'Portero' (models/jugadorModel.js), así que sirve cualquiera.
