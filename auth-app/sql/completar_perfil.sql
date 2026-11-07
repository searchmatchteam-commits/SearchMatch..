-- Registro con Google: el perfil de jugador nace sin estos datos y se piden en /completar-perfil.
-- (altura y peso ya aceptan NULL; se incluyen para dejarlo explícito. La posición vive en
-- jugador_posicion, no es una columna de jugador.)
ALTER TABLE jugador ALTER COLUMN fecha_nacimiento DROP NOT NULL;
ALTER TABLE jugador ALTER COLUMN altura DROP NOT NULL;
ALTER TABLE jugador ALTER COLUMN peso DROP NOT NULL;
