-- =============================================================================
-- Rollback de 20261111130000_camion_transporte.sql
-- =============================================================================
-- Quita las columnas de patente y conductor de solicitud y traslado_interno, y
-- la tabla camion (se pierden los camiones registrados). Las empresas
-- (public.transportista) no se tocan. Desplegar antes el código anterior.
-- =============================================================================

begin;

drop index if exists public.solicitud_patente_camion_idx;
drop index if exists public.traslado_interno_patente_camion_idx;
alter table public.solicitud drop column if exists patente_camion;
alter table public.solicitud drop column if exists conductor_nombre;
alter table public.traslado_interno drop column if exists patente_camion;
alter table public.traslado_interno drop column if exists conductor_nombre;
drop table if exists public.camion;

commit;
