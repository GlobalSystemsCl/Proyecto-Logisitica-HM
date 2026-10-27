-- =============================================================================
-- Rollback de 20261027120000_recrear_vehiculo_formato_stock.sql
-- =============================================================================
-- Quita las FK hacia vehiculo y la tabla (se pierde el inventario cargado).
-- Deja la BD como quedó tras el DROP del 2026-10-26: la app no puede listar
-- ni importar vehículos. Las funciones de los triggers de slots se conservan.
-- =============================================================================

begin;

alter table public.solicitud_vehiculo
  drop constraint if exists solicitud_vehiculo_vehiculo_fk;
alter table public.traslado_interno_vehiculo
  drop constraint if exists traslado_interno_vehiculo_vehiculo_id_fkey;
drop table if exists public.vehiculo;

commit;
