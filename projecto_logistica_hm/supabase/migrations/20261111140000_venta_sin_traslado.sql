-- =============================================================================
-- Venta de un vehículo que ya está en la sucursal (R1, 2026-11-11)
-- =============================================================================
-- Pedido del cliente: si el vehículo ya está en la sucursal del vendedor, no
-- hay traslado ni pasa por Logística. El ejecutivo crea la solicitud, el jefe
-- de local la aprueba y el paso siguiente es la entrega al cliente.
-- Decisión (2026-11-03): no se mezclan en una solicitud vehículos que están en
-- la sucursal con otros que no (la app lo valida).
--
-- Qué hace:
--   1. solicitud.sin_traslado (boolean, default false): la app lo marca al crear
--      una venta cuyos vehículos están todos en la sucursal de destino. Al
--      aprobarla pasa directo a 'entregada' ("lista para entregar").
--   2. fn_recalcular_slots_sucursal no cuenta como reserva los vehículos de una
--      solicitud sin traslado: ya ocupan su slot físico en esa sucursal (antes
--      se habrían contado dos veces). Mismo cuerpo que 20261013130000 más esa
--      condición.
--
-- Rollback: supabase/rollback/20261111140000_venta_sin_traslado.sql
-- =============================================================================

begin;

alter table public.solicitud
  add column if not exists sin_traslado boolean not null default false;

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

  -- R1: una venta sin traslado no reserva: el vehículo ya está en la sucursal.
  select count(*) into v_res_solicitud
  from public.solicitud_vehiculo sv
  join public.solicitud sol on sol.id = sv.solicitud_id
  where sol.sucursal_destino = p_sucursal_id
    and sol.tipo_solicitud <> 'evento'
    and not sol.sin_traslado
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

commit;

-- -----------------------------------------------------------------------------
-- Verificación posterior (ejecutar por separado)
-- -----------------------------------------------------------------------------
-- select column_name, column_default from information_schema.columns
-- where table_schema = 'public' and table_name = 'solicitud' and column_name = 'sin_traslado';   -- false
-- select prosrc like '%not sol.sin_traslado%' from pg_proc where proname = 'fn_recalcular_slots_sucursal';   -- true
