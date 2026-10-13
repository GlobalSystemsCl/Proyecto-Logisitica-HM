-- ROLLBACK de 20261013150000_brecha_011_trigger_vehiculos.sql
-- Vuelve al estado de producción del 2026-10-13: trigger por fila
-- tr_recalcular_slots_vehiculo creado pero DESACTIVADO, sin los triggers por
-- sentencia. Los movimientos de vehículos dejan de recalcular slots.
begin;

drop trigger if exists tr_recalcular_slots_vehiculos_insertados on public.vehiculo;
drop trigger if exists tr_recalcular_slots_vehiculos_actualizados on public.vehiculo;
drop trigger if exists tr_recalcular_slots_vehiculos_eliminados on public.vehiculo;
drop function if exists public.fn_recalcular_slots_vehiculos_insertados();
drop function if exists public.fn_recalcular_slots_vehiculos_actualizados();
drop function if exists public.fn_recalcular_slots_vehiculos_eliminados();

drop trigger if exists tr_recalcular_slots_vehiculo on public.vehiculo;
create trigger tr_recalcular_slots_vehiculo
  after insert or delete or update of ubicacion on public.vehiculo
  for each row execute function public.fn_recalcular_slots_por_vehiculo();
alter table public.vehiculo disable trigger tr_recalcular_slots_vehiculo;

commit;
