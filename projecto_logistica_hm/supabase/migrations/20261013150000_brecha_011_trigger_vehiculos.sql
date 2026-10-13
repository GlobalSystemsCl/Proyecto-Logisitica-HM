-- =============================================================================
-- Brecha 011 (paso 3) — Los movimientos de vehículos vuelven a recalcular slots
-- =============================================================================
-- tr_recalcular_slots_vehiculo (por fila) se desactivó el 2026-09-15
-- (20260915_desactivar_trigger_slots_vehiculo.sql) porque la importación masiva
-- de stock fallaba: el recálculo lanzaba un error si se superaba la capacidad.
-- Ese motivo ya no existe (el recálculo solo avisa; marcha blanca), pero con el
-- trigger apagado crear, editar, importar, borrar o mover un vehículo no
-- actualiza los slots físicos de ninguna sucursal.
--
-- Se reemplaza por tres triggers POR SENTENCIA con tablas de transición:
-- una importación de miles de vehículos recalcula una sola vez cada sucursal
-- afectada (no una vez por fila). Postgres exige un trigger por evento cuando
-- se usan tablas de transición.
--   * INSERT: sucursales de los vehículos nuevos.
--   * UPDATE: ubicación anterior y nueva de los vehículos que cambiaron de
--     ubicación (editar el precio, por ejemplo, no recalcula nada).
--   * DELETE: sucursales de los vehículos borrados.
-- Las sucursales se recalculan en orden de id para evitar bloqueos cruzados.
--
-- Se elimina el trigger por fila desactivado. fn_recalcular_slots_por_vehiculo
-- se conserva sin uso (la usa el rollback).
--
-- Requiere: 20261013130000_brecha_011_recalculo_slots_unificado.sql
-- Rollback: supabase/rollback/20261013150000_brecha_011_trigger_vehiculos.sql
-- =============================================================================

begin;

create or replace function public.fn_recalcular_slots_vehiculos_insertados()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_sucursal bigint;
begin
  for v_sucursal in
    select distinct n.ubicacion from nuevos n where n.ubicacion is not null order by 1
  loop
    perform public.fn_recalcular_slots_sucursal(v_sucursal);
  end loop;
  return null;
end;
$$;

create or replace function public.fn_recalcular_slots_vehiculos_actualizados()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_sucursal bigint;
begin
  for v_sucursal in
    select distinct x.sucursal
    from (
      select o.ubicacion as sucursal
      from viejos o join nuevos n on n.id = o.id
      where o.ubicacion is distinct from n.ubicacion
      union
      select n.ubicacion
      from viejos o join nuevos n on n.id = o.id
      where o.ubicacion is distinct from n.ubicacion
    ) x
    where x.sucursal is not null
    order by 1
  loop
    perform public.fn_recalcular_slots_sucursal(v_sucursal);
  end loop;
  return null;
end;
$$;

create or replace function public.fn_recalcular_slots_vehiculos_eliminados()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_sucursal bigint;
begin
  for v_sucursal in
    select distinct o.ubicacion from viejos o where o.ubicacion is not null order by 1
  loop
    perform public.fn_recalcular_slots_sucursal(v_sucursal);
  end loop;
  return null;
end;
$$;

revoke execute on function public.fn_recalcular_slots_vehiculos_insertados() from public, anon, authenticated;
revoke execute on function public.fn_recalcular_slots_vehiculos_actualizados() from public, anon, authenticated;
revoke execute on function public.fn_recalcular_slots_vehiculos_eliminados() from public, anon, authenticated;

-- Trigger por fila desactivado desde el 2026-09-15
drop trigger if exists tr_recalcular_slots_vehiculo on public.vehiculo;

drop trigger if exists tr_recalcular_slots_vehiculos_insertados on public.vehiculo;
create trigger tr_recalcular_slots_vehiculos_insertados
  after insert on public.vehiculo
  referencing new table as nuevos
  for each statement execute function public.fn_recalcular_slots_vehiculos_insertados();

drop trigger if exists tr_recalcular_slots_vehiculos_actualizados on public.vehiculo;
create trigger tr_recalcular_slots_vehiculos_actualizados
  after update on public.vehiculo
  referencing old table as viejos new table as nuevos
  for each statement execute function public.fn_recalcular_slots_vehiculos_actualizados();

drop trigger if exists tr_recalcular_slots_vehiculos_eliminados on public.vehiculo;
create trigger tr_recalcular_slots_vehiculos_eliminados
  after delete on public.vehiculo
  referencing old table as viejos
  for each statement execute function public.fn_recalcular_slots_vehiculos_eliminados();

commit;

-- -----------------------------------------------------------------------------
-- Verificación posterior (ejecutar por separado)
-- -----------------------------------------------------------------------------
-- select tgname, tgenabled from pg_trigger
-- where tgrelid = 'public.vehiculo'::regclass and tgname like 'tr_recalcular_slots_%';
--   -> los 3 triggers nuevos con tgenabled = 'O'; tr_recalcular_slots_vehiculo ya no existe.
