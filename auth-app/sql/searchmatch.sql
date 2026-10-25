CREATE DATABASE IF NOT EXISTS searchmatch
CHARACTER SET utf8mb4
COLLATE utf8mb4_unicode_ci;


USE searchmatch;


CREATE TABLE rol_aplicacion (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(50) NOT NULL UNIQUE
);

CREATE TABLE nivel (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(50) NOT NULL UNIQUE,
    puntaje_min INT NOT NULL,
    puntaje_max INT NOT NULL,
    
    CHECK (puntaje_min >= 0),
    CHECK (puntaje_max >= puntaje_min)
);

CREATE TABLE posicion (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(50) NOT NULL UNIQUE
);

CREATE TABLE rol_equipo (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(50) NOT NULL UNIQUE
);

CREATE TABLE estado_solicitud (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(50) NOT NULL UNIQUE
);

CREATE TABLE estado_desafio (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(50) NOT NULL UNIQUE
);

CREATE TABLE estado_reserva (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(50) NOT NULL UNIQUE
);

CREATE TABLE tipo_notificacion (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL UNIQUE
);

CREATE TABLE modalidad (
    id INT AUTO_INCREMENT PRIMARY KEY,
    cantidad_de_jugadores INT NOT NULL,
    nombre VARCHAR(50) NOT NULL UNIQUE,


    CHECK (cantidad_de_jugadores > 0)
);


CREATE TABLE region (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL UNIQUE
);

CREATE TABLE comunas (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    id_region INT NOT NULL,


    CONSTRAINT fk_comunas_region
        FOREIGN KEY (id_region)
        REFERENCES region(id),


    UNIQUE (nombre, id_region)
);

CREATE TABLE direccion (
    id INT AUTO_INCREMENT PRIMARY KEY,
    calle VARCHAR(150) NOT NULL,
    numero VARCHAR(20),
    referencias VARCHAR(255),
    id_comunas INT NOT NULL,


    CONSTRAINT fk_direccion_comunas
        FOREIGN KEY (id_comunas)
        REFERENCES comunas(id)
);


CREATE TABLE usuario (
    id INT AUTO_INCREMENT PRIMARY KEY,
    correo VARCHAR(150) NOT NULL UNIQUE,
    correo_secundario VARCHAR(150),
    telefono VARCHAR(20),
    contrasena VARCHAR(255) NOT NULL,
    id_rol_aplicacion INT NOT NULL,
    activo BOOLEAN NOT NULL DEFAULT TRUE,


    CONSTRAINT fk_usuario_rol_aplicacion
        FOREIGN KEY (id_rol_aplicacion)
        REFERENCES rol_aplicacion(id)
);


CREATE TABLE jugador (
    id INT AUTO_INCREMENT PRIMARY KEY,
    fecha_nacimiento DATE NOT NULL,
    altura DECIMAL(5,2),
    peso DECIMAL(5,2),
    nombre_apodo VARCHAR(100) NOT NULL,
    apellido VARCHAR(100) NOT NULL,
    id_usuario INT NOT NULL UNIQUE,


    CONSTRAINT fk_jugador_usuario
        FOREIGN KEY (id_usuario)
        REFERENCES usuario(id),


    CHECK (altura IS NULL OR altura > 0),
    CHECK (peso IS NULL OR peso > 0)
);


CREATE TABLE jugador_posicion (
    id INT AUTO_INCREMENT PRIMARY KEY,
    id_jugador INT NOT NULL,
    id_posicion INT NOT NULL,


    CONSTRAINT fk_jugador_posicion_jugador
        FOREIGN KEY (id_jugador)
        REFERENCES jugador(id)
        ON DELETE CASCADE,


    CONSTRAINT fk_jugador_posicion_posicion
        FOREIGN KEY (id_posicion)
        REFERENCES posicion(id),


    UNIQUE (id_jugador, id_posicion)
);


CREATE TABLE equipo (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    id_comuna INT NOT NULL,
    id_usuario_creador INT NOT NULL,
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    puntaje_nivel INT NOT NULL DEFAULT 0,


    CONSTRAINT fk_equipo_comuna
        FOREIGN KEY (id_comuna)
        REFERENCES comunas(id),


    CONSTRAINT fk_equipo_usuario_creador
        FOREIGN KEY (id_usuario_creador)
        REFERENCES usuario(id),


    CHECK (puntaje_nivel >= 0)
);


CREATE TABLE equipo_jugador (
    id INT AUTO_INCREMENT PRIMARY KEY,
    id_jugador INT NOT NULL,
    id_equipo INT NOT NULL,
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


CREATE TABLE solicitud_union_equipo (
    id INT AUTO_INCREMENT PRIMARY KEY,
    id_jugador INT NOT NULL,
    id_equipo INT NOT NULL,
    id_estado_solicitud INT NOT NULL,
    fecha_solicitud DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fecha_respuesta DATETIME,


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


CREATE TABLE recinto_deportivo (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(150) NOT NULL,
    telefono VARCHAR(20),
    latitud DECIMAL(10,8),
    longitud DECIMAL(11,8),
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    id_direccion INT NOT NULL UNIQUE,


    CONSTRAINT fk_recinto_direccion
        FOREIGN KEY (id_direccion)
        REFERENCES direccion(id)
);


CREATE TABLE cancha (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    precio_hora DECIMAL(10,2) NOT NULL,
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    id_recinto_deportivo INT NOT NULL,
    id_modalidad INT NOT NULL,


    CONSTRAINT fk_cancha_recinto
        FOREIGN KEY (id_recinto_deportivo)
        REFERENCES recinto_deportivo(id),


    CONSTRAINT fk_cancha_modalidad
        FOREIGN KEY (id_modalidad)
        REFERENCES modalidad(id),


    CHECK (precio_hora >= 0)
);


CREATE TABLE disponibilidad_cancha (
    id INT AUTO_INCREMENT PRIMARY KEY,
    dia_semana VARCHAR(20) NOT NULL,
    hora_apertura TIME NOT NULL,
    hora_cierre TIME NOT NULL,
    id_cancha INT NOT NULL,


    CONSTRAINT fk_disponibilidad_cancha
        FOREIGN KEY (id_cancha)
        REFERENCES cancha(id)
        ON DELETE CASCADE,


    CHECK (hora_cierre > hora_apertura)
);


CREATE TABLE reservar_cancha (
    id INT AUTO_INCREMENT PRIMARY KEY,
    fecha DATE NOT NULL,
    hora_inicio TIME NOT NULL,
    hora_fin TIME NOT NULL,
    id_cancha INT NOT NULL,
    id_usuario_reserva INT NOT NULL,
    id_estado_reserva INT NOT NULL,


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


CREATE TABLE desafio (
    id INT AUTO_INCREMENT PRIMARY KEY,
    mensaje VARCHAR(500),
    fecha_solicitud DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fecha_respuesta DATETIME,
    id_equipo_desafiado INT NOT NULL,
    id_equipo_desafiante INT NOT NULL,
    id_estado_desafio INT NOT NULL,


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


CREATE TABLE partido (
    id INT AUTO_INCREMENT PRIMARY KEY,
    hora TIME NOT NULL,
    fecha DATE NOT NULL,
    marcador_desafiante INT,
    marcador_desafiado INT,
    id_modalidad INT NOT NULL,
    id_desafio INT NOT NULL UNIQUE,
    id_cancha INT NOT NULL,


    CONSTRAINT fk_partido_modalidad
        FOREIGN KEY (id_modalidad)
        REFERENCES modalidad(id),


    CONSTRAINT fk_partido_desafio
        FOREIGN KEY (id_desafio)
        REFERENCES desafio(id),


    CONSTRAINT fk_partido_cancha
        FOREIGN KEY (id_cancha)
        REFERENCES cancha(id),


    CHECK (
        marcador_desafiante IS NULL
        OR marcador_desafiante >= 0
    ),


    CHECK (
        marcador_desafiado IS NULL
        OR marcador_desafiado >= 0
    )
);


CREATE TABLE participacion (
    id INT AUTO_INCREMENT PRIMARY KEY,
    es_desafiante BOOLEAN NOT NULL,
    id_equipo INT NOT NULL,
    id_partido INT NOT NULL,


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


CREATE TABLE comentario (
    id INT AUTO_INCREMENT PRIMARY KEY,
    fecha DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    mensaje VARCHAR(500) NOT NULL,
    id_equipo INT NOT NULL,
    id_usuario INT NOT NULL,


    CONSTRAINT fk_comentario_equipo
        FOREIGN KEY (id_equipo)
        REFERENCES equipo(id)
        ON DELETE CASCADE,


    CONSTRAINT fk_comentario_usuario
        FOREIGN KEY (id_usuario)
        REFERENCES usuario(id)
);


CREATE TABLE notificacion (
    id INT AUTO_INCREMENT PRIMARY KEY,
    fecha DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    mensaje VARCHAR(500) NOT NULL,
    leida BOOLEAN NOT NULL DEFAULT FALSE,
    id_tipo_notificacion INT NOT NULL,
    id_usuario INT NOT NULL,


    CONSTRAINT fk_notificacion_tipo
        FOREIGN KEY (id_tipo_notificacion)
        REFERENCES tipo_notificacion(id),


    CONSTRAINT fk_notificacion_usuario
        FOREIGN KEY (id_usuario)
        REFERENCES usuario(id)
        ON DELETE CASCADE
);
