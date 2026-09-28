-- =============================================================================
-- Migración: 20260928_enum_despachada.sql
-- Fase 1 / Paso 2 — Nuevo valor de estado "despachada"
-- -----------------------------------------------------------------------------
-- ⚠️  EJECUTAR SOLO / EN UNA TRANSACCIÓN SEPARADA.
--
-- PostgreSQL no permite utilizar un valor recién agregado a un enum dentro de
-- la misma transacción que lo crea (error 55P04: unsafe use of new value of
-- enum type). Por eso esta migración va sola, y la migración 3 (triggers) y el
-- resto del DEV 2 deben ejecutarse en sesiones posteriores.
--
-- El flujo pasa de:
--   calendarizada -> en_transito -> entregada -> finalizada
-- a:
--   calendarizada -> despachada -> en_transito -> entregada -> finalizada
--
-- NOTA: los valores existentes del enum NO se renombran. Solo se agrega 'despachada'.
-- Los labels de UI se cambian en el front (SolicitudesClient / SolicitudDetalleModal).
-- =============================================================================

ALTER TYPE public.estado_solicitud ADD VALUE IF NOT EXISTS 'despachada';

-- -----------------------------------------------------------------------------
-- Verificación (P1.2)
-- -----------------------------------------------------------------------------
-- SELECT enumlabel, enumsortorder
--   FROM pg_enum JOIN pg_type ON pg_enum.enumtypid = pg_type.oid
--  WHERE pg_type.typname = 'estado_solicitud'
--  ORDER BY enumsortorder;
-- ESPERADO: 'despachada' aparece en la lista
