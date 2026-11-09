-- ============================================================
-- sql/colores_equipo.sql
-- ============================================================
-- Colores de cada equipo y equipación de cada partido.
--  · equipo.color_primario / color_secundario: personalizan la carta del equipo.
--  · equipo.camiseta_local / camiseta_visita: sus dos camisetas ("#rrggbb").
--  · partido.camiseta_desafiante / camiseta_desafiado: con cuál juega cada equipo ('local' | 'visita'),
--    elegida al programar el partido para que no vistan del mismo color (config/coloresEquipo.js).
-- Los equipos que ya existían quedan sin colores (NULL) hasta que su capitán los elija en "Editar equipo".
-- Se puede ejecutar más de una vez.
--
-- Ejecutar con:  node scripts/ejecutar-sql.js sql/colores_equipo.sql

ALTER TABLE equipo ADD COLUMN IF NOT EXISTS color_primario VARCHAR(7);
ALTER TABLE equipo ADD COLUMN IF NOT EXISTS color_secundario VARCHAR(7);
ALTER TABLE equipo ADD COLUMN IF NOT EXISTS camiseta_local VARCHAR(7);
ALTER TABLE equipo ADD COLUMN IF NOT EXISTS camiseta_visita VARCHAR(7);

ALTER TABLE partido ADD COLUMN IF NOT EXISTS camiseta_desafiante VARCHAR(6);
ALTER TABLE partido ADD COLUMN IF NOT EXISTS camiseta_desafiado VARCHAR(6);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_equipo_colores') THEN
    ALTER TABLE equipo ADD CONSTRAINT ck_equipo_colores CHECK (
      (color_primario IS NULL OR color_primario ~ '^#[0-9a-f]{6}$')
      AND (color_secundario IS NULL OR color_secundario ~ '^#[0-9a-f]{6}$')
      AND (camiseta_local IS NULL OR camiseta_local ~ '^#[0-9a-f]{6}$')
      AND (camiseta_visita IS NULL OR camiseta_visita ~ '^#[0-9a-f]{6}$'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_partido_camisetas') THEN
    ALTER TABLE partido ADD CONSTRAINT ck_partido_camisetas CHECK (
      (camiseta_desafiante IS NULL OR camiseta_desafiante IN ('local', 'visita'))
      AND (camiseta_desafiado IS NULL OR camiseta_desafiado IN ('local', 'visita')));
  END IF;
END $$;
