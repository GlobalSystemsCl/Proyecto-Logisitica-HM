-- =============================================================================
-- Rollback de 20261120120000_importacion_stock.sql
-- =============================================================================
-- Antes, desplegar una versión de la app que no lea `importacion_stock` ni
-- escriba `vehiculo.importacion_id`. Los vehículos importados se conservan:
-- solo se pierde el registro de qué importación los creó.
-- =============================================================================

begin;

drop function if exists public.fn_revertir_importacion_stock(uuid, uuid);

alter table public.vehiculo drop constraint if exists vehiculo_importacion_fkey;
drop index if exists public.vehiculo_importacion_idx;
alter table public.vehiculo drop column if exists importacion_id;

drop table if exists public.importacion_stock;

commit;
