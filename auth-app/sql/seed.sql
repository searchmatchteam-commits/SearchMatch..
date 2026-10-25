CREATE TABLE IF NOT EXISTS usuarios (
    id            SERIAL PRIMARY KEY,
    nombre        TEXT        NOT NULL,
    email         TEXT        NOT NULL UNIQUE,
    password_hash TEXT        NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_usuarios_email ON usuarios (email);


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


INSERT INTO rol_aplicacion (nombre) VALUES
    ('Jugador'),
    ('Administrador')
ON CONFLICT DO NOTHING;

INSERT INTO nivel (nombre, puntaje_min, puntaje_max) VALUES
    ('Principiante', 0,   299),
    ('Intermedio',   300, 699),
    ('Avanzado',     700, 1000)
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
    ('Integrante')
ON CONFLICT DO NOTHING;

INSERT INTO estado_solicitud (nombre) VALUES
    ('Pendiente'),
    ('Aceptada'),
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


ALTER TABLE usuario
    ADD COLUMN IF NOT EXISTS auth_id UUID UNIQUE
    REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE usuario ALTER COLUMN contrasena DROP NOT NULL;

ALTER TABLE jugador ALTER COLUMN fecha_nacimiento DROP NOT NULL;

ALTER TABLE usuario ENABLE ROW LEVEL SECURITY;
ALTER TABLE jugador ENABLE ROW LEVEL SECURITY;


ALTER TABLE jugador
    ADD COLUMN IF NOT EXISTS pie_habil       VARCHAR(10)
        CHECK (pie_habil IN ('izquierdo', 'derecho')),
    ADD COLUMN IF NOT EXISTS id_nivel        INT REFERENCES nivel(id),
    ADD COLUMN IF NOT EXISTS stat_ritmo      SMALLINT CHECK (stat_ritmo   BETWEEN 1 AND 99),
    ADD COLUMN IF NOT EXISTS stat_tiro       SMALLINT CHECK (stat_tiro    BETWEEN 1 AND 99),
    ADD COLUMN IF NOT EXISTS stat_pase       SMALLINT CHECK (stat_pase    BETWEEN 1 AND 99),
    ADD COLUMN IF NOT EXISTS stat_regate     SMALLINT CHECK (stat_regate  BETWEEN 1 AND 99),
    ADD COLUMN IF NOT EXISTS stat_defensa    SMALLINT CHECK (stat_defensa BETWEEN 1 AND 99),
    ADD COLUMN IF NOT EXISTS stat_fisico     SMALLINT CHECK (stat_fisico  BETWEEN 1 AND 99),
    ADD COLUMN IF NOT EXISTS perfil_completo BOOLEAN NOT NULL DEFAULT FALSE;

INSERT INTO nivel (nombre, puntaje_min, puntaje_max) VALUES
    ('Principiante', 0,   299),
    ('Intermedio',   300, 699),
    ('Avanzado',     700, 1000)
ON CONFLICT (nombre) DO NOTHING;

ALTER TABLE equipo
    ADD COLUMN IF NOT EXISTS zona            VARCHAR(100),
    ADD COLUMN IF NOT EXISTS correo_contacto VARCHAR(150),
    ADD COLUMN IF NOT EXISTS id_modalidad    INT REFERENCES modalidad(id),
    ADD COLUMN IF NOT EXISTS id_nivel        INT REFERENCES nivel(id);

ALTER TABLE equipo ALTER COLUMN id_comuna DROP NOT NULL;

ALTER TABLE equipo ENABLE ROW LEVEL SECURITY;
ALTER TABLE equipo_jugador ENABLE ROW LEVEL SECURITY;
ALTER TABLE solicitud_union_equipo ENABLE ROW LEVEL SECURITY;


ALTER TABLE jugador
    ADD COLUMN IF NOT EXISTS foto             BYTEA,
    ADD COLUMN IF NOT EXISTS foto_tipo        VARCHAR(20)
        CHECK (foto_tipo IN ('image/jpeg', 'image/png', 'image/webp')),
    ADD COLUMN IF NOT EXISTS foto_actualizada TIMESTAMPTZ;


ALTER TABLE jugador
    ADD COLUMN IF NOT EXISTS apodo VARCHAR(20);


ALTER TABLE solicitud_union_equipo
    ADD COLUMN IF NOT EXISTS mensaje VARCHAR(200);


ALTER TABLE equipo
    ADD COLUMN IF NOT EXISTS escudo             BYTEA,
    ADD COLUMN IF NOT EXISTS escudo_tipo        VARCHAR(20)
        CHECK (escudo_tipo IN ('image/jpeg', 'image/png', 'image/webp')),
    ADD COLUMN IF NOT EXISTS escudo_actualizado TIMESTAMPTZ;

ALTER TABLE equipo_jugador
    ADD COLUMN IF NOT EXISTS pos_x NUMERIC(5, 2) CHECK (pos_x BETWEEN 0 AND 100),
    ADD COLUMN IF NOT EXISTS pos_y NUMERIC(5, 2) CHECK (pos_y BETWEEN 0 AND 100);


CREATE TABLE IF NOT EXISTS invitacion_equipo (
    id                  SERIAL PRIMARY KEY,
    id_equipo           INT NOT NULL,
    id_jugador          INT NOT NULL,
    id_estado_solicitud INT NOT NULL,
    fecha_invitacion    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    fecha_respuesta     TIMESTAMPTZ,

    CONSTRAINT fk_invitacion_equipo
        FOREIGN KEY (id_equipo)
        REFERENCES equipo(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_invitacion_jugador
        FOREIGN KEY (id_jugador)
        REFERENCES jugador(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_invitacion_estado
        FOREIGN KEY (id_estado_solicitud)
        REFERENCES estado_solicitud(id),

    UNIQUE (id_equipo, id_jugador)
);

ALTER TABLE invitacion_equipo ENABLE ROW LEVEL SECURITY;
