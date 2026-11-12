-- =============================================================================
-- Rollback de 20261111140000_venta_sin_traslado.sql
-- =============================================================================
-- Vuelve fn_recalcular_slots_sucursal a contar todas las reservas (versión de
-- 20261013130000) y quita solicitud.sin_traslado. Las solicitudes sin traslado
-- ya aprobadas quedan en su estado. Desplegar antes el código anterior.
-- =============================================================================

begin;

create or replace function public.fn_recalcular_slots_sucursal(p_sucursal_id bigint)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_slots         bigint;
  v_fisicos       bigint;
  v_res_solicitud bigint;
  v_res_traslado  bigint;
  v_reservados    bigint;
  v_ocupados      bigint;
begin
  if p_sucursal_id is null then
    return;
  end if;

  select s.slots into v_slots
  from public.sucursal s
  where s.id = p_sucursal_id
  for update;

  if not found then
    return;
  end if;

  select count(*) into v_fisicos
  from public.vehiculo v
  where v.ubicacion = p_sucursal_id;

  select count(*) into v_res_solicitud
  from public.solicitud_vehiculo sv
  join public.solicitud sol on sol.id = sv.solicitud_id
  where sol.sucursal_destino = p_sucursal_id
    and sol.tipo_solicitud <> 'evento'
    and sv.disponibilidad = 'reservado'
    and sol.estado = any (public.fn_estados_reserva_activos());

  select count(*) into v_res_traslado
  from public.traslado_interno_vehiculo tiv
  join public.traslado_interno t on t.id = tiv.traslado_id
  where t.destino_id = p_sucursal_id
    and tiv.disponibilidad = 'reservado'
    and t.estado in ('pendiente', 'en_transito');

  v_reservados := v_res_solicitud + v_res_traslado;
  v_ocupados   := v_fisicos + v_reservados;

  -- Marcha blanca: solo informativo, nunca bloquea.
  if v_slots is not null and v_ocupados > v_slots then
    raise notice 'Sucursal % excede su capacidad: ocupados % > slots %',
      p_sucursal_id, v_ocupados, v_slots;
  end if;

  update public.sucursal
  set slots_ocupados   = v_ocupados,
      slots_reservados = v_reservados
  where id = p_sucursal_id
    and (slots_ocupados is distinct from v_ocupados
         or slots_reservados is distinct from v_reservados);
end;
$$;

revoke execute on function public.fn_recalcular_slots_sucursal(bigint) from public, anon, authenticated;
grant execute on function public.fn_recalcular_slots_sucursal(bigint) to service_role;

alter table public.solicitud drop column if exists sin_traslado;

commit;
