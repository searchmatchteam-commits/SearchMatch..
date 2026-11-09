-- ============================================================
-- sql/stats_portero.sql
-- ============================================================
-- Estadísticas propias del portero (config/perfilJugador.js → ESTADISTICAS_PORTERO), igual que las de campo:
-- SMALLINT entre 1 y 99. Quedan en NULL hasta que el jugador las edite; mientras tanto la app usa 50.
-- Solo agrega columnas: no toca las estadísticas de campo existentes. Se puede ejecutar más de una vez.
--
-- Ejecutar con:  node scripts/ejecutar-sql.js sql/stats_portero.sql

ALTER TABLE jugador ADD COLUMN IF NOT EXISTS stat_estirada SMALLINT;
ALTER TABLE jugador ADD COLUMN IF NOT EXISTS stat_manejo SMALLINT;
ALTER TABLE jugador ADD COLUMN IF NOT EXISTS stat_saque SMALLINT;
ALTER TABLE jugador ADD COLUMN IF NOT EXISTS stat_reflejos SMALLINT;
ALTER TABLE jugador ADD COLUMN IF NOT EXISTS stat_velocidad SMALLINT;
ALTER TABLE jugador ADD COLUMN IF NOT EXISTS stat_colocacion SMALLINT;

DO $$
DECLARE
  columna TEXT;
BEGIN
  FOREACH columna IN ARRAY ARRAY['stat_estirada', 'stat_manejo', 'stat_saque', 'stat_reflejos', 'stat_velocidad', 'stat_colocacion'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'jugador_' || columna || '_check') THEN
      EXECUTE format('ALTER TABLE jugador ADD CONSTRAINT %I CHECK (%I BETWEEN 1 AND 99)', 'jugador_' || columna || '_check', columna);
    END IF;
  END LOOP;
END $$;
