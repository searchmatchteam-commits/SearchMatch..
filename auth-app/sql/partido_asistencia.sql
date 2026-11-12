-- ============================================================
-- sql/partido_asistencia.sql
-- ============================================================
-- Asistencia y cupos de un partido:
--   partido_asistencia   → cada integrante de los dos equipos confirma ("confirmado") o avisa que no va ("no_asiste").
--   partido_cupo         → el capitán publica las posiciones que le faltan y cuántos cupos hay en cada una.
--   partido_postulacion  → jugadores de afuera se inscriben en una posición publicada:
--                          entran solos si hay cupo libre ("aceptada"); si no, quedan "pendiente" y el capitán elige.
-- Solo crea tablas nuevas: no toca las existentes. Se puede ejecutar más de una vez.
--
-- Ejecutar con:  node scripts/ejecutar-sql.js sql/partido_asistencia.sql

CREATE TABLE IF NOT EXISTS partido_asistencia (
    id_partido  INT NOT NULL REFERENCES partido(id) ON DELETE CASCADE,
    id_jugador  INT NOT NULL REFERENCES jugador(id) ON DELETE CASCADE,
    id_equipo   INT NOT NULL REFERENCES equipo(id) ON DELETE CASCADE,
    estado      VARCHAR(12) NOT NULL CHECK (estado IN ('confirmado', 'no_asiste')),
    fecha       TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (id_partido, id_jugador)
);
ALTER TABLE partido_asistencia ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS partido_cupo (
    id_partido  INT NOT NULL REFERENCES partido(id) ON DELETE CASCADE,
    id_equipo   INT NOT NULL REFERENCES equipo(id) ON DELETE CASCADE,
    id_posicion INT NOT NULL REFERENCES posicion(id),
    cupos       SMALLINT NOT NULL CHECK (cupos BETWEEN 1 AND 11),
    fecha       TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (id_partido, id_equipo, id_posicion)
);
ALTER TABLE partido_cupo ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS partido_postulacion (
    id          SERIAL PRIMARY KEY,
    id_partido  INT NOT NULL REFERENCES partido(id) ON DELETE CASCADE,
    id_equipo   INT NOT NULL REFERENCES equipo(id) ON DELETE CASCADE,
    id_posicion INT NOT NULL REFERENCES posicion(id),
    id_jugador  INT NOT NULL REFERENCES jugador(id) ON DELETE CASCADE,
    estado      VARCHAR(10) NOT NULL CHECK (estado IN ('pendiente', 'aceptada', 'rechazada')),
    fecha       TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- Un jugador se inscribe una sola vez por partido (si lo rechazan no vuelve a postular; si se retira, se borra la fila)
    UNIQUE (id_partido, id_jugador)
);
ALTER TABLE partido_postulacion ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS partido_postulacion_cupo_idx ON partido_postulacion (id_partido, id_equipo, id_posicion);
