-- ROLLBACK de 20261013130000_brecha_011_recalculo_slots_unificado.sql
-- Restaura fn_recalcular_slots_ocupados tal como estaba en producción
-- (2026-10-13: recalcula solo slots_ocupados y no cuenta traslados) y elimina
-- las funciones nuevas. Revertir este paso exige revertir antes el paso 2 si
-- ya se aplicó (sus triggers llaman a fn_recalcular_slots_sucursal).
begin;

create or replace function public.fn_recalcular_slots_ocupados(p_sucursal_id bigint)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_ocupados bigint;
  v_slots    bigint;
begin
  if p_sucursal_id is null then
    return;
  end if;

  select
      (select count(*) from public.vehiculo v where v.ubicacion = p_sucursal_id)
    + (select count(*)
         from public.solicitud_vehiculo sv
         join public.solicitud sol on sol.id = sv.solicitud_id
        where sol.sucursal_destino = p_sucursal_id
          and sv.disponibilidad = 'reservado'
          and sol.estado in ('pendiente_aprobacion','aprobada','pendiente',
                             'priorizada','asignada','calendarizada',
                             'despachada','en_transito'))
    into v_ocupados;

  select slots into v_slots
  from public.sucursal
  where id = p_sucursal_id;

  -- Informativo: ya NO valida ni bloquea la capacidad de la sucursal.
  if v_slots is not null and v_ocupados > v_slots then
    raise notice 'Sucursal % excede su capacidad: ocupados % > slots %',
      p_sucursal_id, v_ocupados, v_slots;
  end if;

  update public.sucursal
  set slots_ocupados = v_ocupados
  where id = p_sucursal_id;
end;
$$;

drop function if exists public.fn_recalcular_slots_sucursal(bigint);
drop function if exists public.fn_estados_reserva_activos();

commit;
