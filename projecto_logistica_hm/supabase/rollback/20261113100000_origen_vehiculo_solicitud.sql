-- =============================================================================
-- Rollback de 20261113100000_origen_vehiculo_solicitud.sql
-- =============================================================================
-- Antes de ejecutarlo, desplegar una versión de la app que no lea
-- `solicitud_vehiculo.sucursal_origen` (SOLICITUD_SELECT): si no, las listas
-- de solicitudes fallan.
-- =============================================================================

begin;

drop trigger if exists tr_fijar_origen_solicitud_vehiculo on public.solicitud_vehiculo;
drop function if exists public.fn_fijar_origen_solicitud_vehiculo();
alter table public.solicitud_vehiculo drop constraint if exists solicitud_vehiculo_sucursal_origen_fkey;
alter table public.solicitud_vehiculo drop column if exists sucursal_origen;

commit;
