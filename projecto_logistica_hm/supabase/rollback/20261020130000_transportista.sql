-- =============================================================================
-- Rollback de 20261020130000_transportista.sql
-- =============================================================================
-- Quita las columnas transportista_id y la tabla transportista (se pierden los
-- transportistas registrados). Desplegar antes el código anterior: el código
-- nuevo lee y escribe estas columnas.
-- =============================================================================

begin;

drop index if exists public.solicitud_transportista_id_idx;
drop index if exists public.traslado_interno_transportista_id_idx;
alter table public.solicitud drop column if exists transportista_id;
alter table public.traslado_interno drop column if exists transportista_id;
drop table if exists public.transportista;

commit;
