-- =============================================================================
-- Rollback de 20261111120000_numero_guia_despacho.sql
-- =============================================================================
-- Quita numero_guia de los vínculos (se pierden las guías registradas).
-- Desplegar antes el código anterior: el código nuevo lee y escribe la columna.
-- =============================================================================

begin;

drop index if exists public.solicitud_vehiculo_numero_guia_idx;
drop index if exists public.traslado_interno_vehiculo_numero_guia_idx;
alter table public.solicitud_vehiculo drop column if exists numero_guia;
alter table public.traslado_interno_vehiculo drop column if exists numero_guia;

commit;
