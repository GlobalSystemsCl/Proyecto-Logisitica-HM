-- =============================================================================
-- Rollback de 20261014130000_solicitud_creado_por.sql
-- =============================================================================
-- Quita la columna creado_por y su índice. Desplegar antes el código anterior:
-- el código nuevo la lee y la escribe.
-- =============================================================================

begin;

drop index if exists public.solicitud_creado_por_idx;
alter table public.solicitud drop column if exists creado_por;

commit;
