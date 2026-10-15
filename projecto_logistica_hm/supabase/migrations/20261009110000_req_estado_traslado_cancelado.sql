-- =============================================================================
-- Requisito R8 — Estado "cancelado" para los traslados internos
-- =============================================================================
-- Un traslado interno en tránsito puede cancelarse (solo Logística). Va en un
-- archivo propio porque un valor nuevo de enum no puede usarse en la misma
-- transacción en que se agrega; la migración siguiente ya lo usa.
--
-- Rollback: un valor de enum no se puede eliminar en Postgres. Ver
-- supabase/rollback/20261009110000_req_estado_traslado_cancelado.sql
-- =============================================================================

alter type public.estado_traslado add value if not exists 'cancelado';
