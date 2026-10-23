-- ============================================================
-- sql/limpiar_canchas_osm.sql
-- ============================================================
-- Borra los recintos (con sus canchas, disponibilidad y dirección) que cargó
-- scripts/seed-canchas-osm.js. Se reconocen por direccion.referencias = 'OpenStreetMap <tipo>/<id>'.
-- Los recintos creados desde el panel de administración NO se tocan.
-- Se conserva cualquier recinto importado que ya tenga una reserva o un partido en alguna de sus canchas.
--
-- Es UNA sola sentencia: se aplica completa o no se aplica nada.
-- Ejecutar con:  node scripts/ejecutar-sql.js sql/limpiar_canchas_osm.sql
-- o pegarlo en Supabase → SQL Editor.

WITH objetivo AS (
  SELECT rd.id, rd.id_direccion
    FROM recinto_deportivo rd
    JOIN direccion d ON d.id = rd.id_direccion
   WHERE d.referencias LIKE 'OpenStreetMap %'
     AND NOT EXISTS (
           SELECT 1 FROM cancha ca
            WHERE ca.id_recinto_deportivo = rd.id
              AND (EXISTS (SELECT 1 FROM reservar_cancha r WHERE r.id_cancha = ca.id)
                   OR EXISTS (SELECT 1 FROM partido p WHERE p.id_cancha = ca.id)))
),
canchas_borradas AS (
  -- disponibilidad_cancha se borra sola (ON DELETE CASCADE)
  DELETE FROM cancha WHERE id_recinto_deportivo IN (SELECT id FROM objetivo) RETURNING id
),
recintos_borrados AS (
  DELETE FROM recinto_deportivo WHERE id IN (SELECT id FROM objetivo) RETURNING id
),
direcciones_borradas AS (
  DELETE FROM direccion WHERE id IN (SELECT id_direccion FROM objetivo) RETURNING id
)
SELECT (SELECT count(*) FROM canchas_borradas)     AS canchas_borradas,
       (SELECT count(*) FROM recintos_borrados)    AS recintos_borrados,
       (SELECT count(*) FROM direcciones_borradas) AS direcciones_borradas;
