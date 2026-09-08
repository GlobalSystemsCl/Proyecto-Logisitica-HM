-- Repara posiciones de prioridad corruptas:
-- - Libera (NULL) el slot de solicitudes que ya salieron de la cola (calendarizada,
--   en_transito, entregada, finalizada, cancelada, etc.).
-- - Compacta a 1..N las que sí están en la cola (estado 'priorizada').
-- - Reinserta al final las 'priorizada' que quedaron con posición NULL
--   (residuos de operaciones cortadas a la mitad).

BEGIN;

-- 1) Liberar slots de estados que ya no están en la cola.
UPDATE solicitud
SET posicion_prioridad = NULL
WHERE estado <> 'priorizada'
  AND posicion_prioridad IS NOT NULL;

-- 2) Compactar 1..N la cola (sana posiciones negativas y huecos).
CREATE TEMP TABLE __renum AS
SELECT
  id,
  row_number() OVER (
    PARTITION BY sucursal
    ORDER BY posicion_prioridad ASC, id ASC
  )::int AS nuevo
FROM solicitud
WHERE estado = 'priorizada'
  AND posicion_prioridad IS NOT NULL;

UPDATE solicitud s
SET posicion_prioridad = r.nuevo
FROM __renum r
WHERE s.id = r.id
  AND s.posicion_prioridad IS DISTINCT FROM r.nuevo;

-- 3) Reinsertar al final las priorizadas que quedaron con posición NULL.
WITH vacias AS (
  SELECT
    s.id,
    (
      COALESCE(MAX(r.nuevo) FILTER (WHERE r.nuevo IS NOT NULL), 0)
      + row_number() OVER (PARTITION BY s.sucursal ORDER BY s.fecha_creacion ASC, s.id ASC)
    )::int AS nuevo
  FROM solicitud s
  LEFT JOIN __renum r ON r.id = s.id
  WHERE s.estado = 'priorizada'
    AND s.posicion_prioridad IS NULL
  GROUP BY s.id, s.sucursal, s.fecha_creacion
)
UPDATE solicitud s2
SET posicion_prioridad = v.nuevo
FROM vacias v
WHERE s2.id = v.id;

DROP TABLE __renum;

COMMIT;