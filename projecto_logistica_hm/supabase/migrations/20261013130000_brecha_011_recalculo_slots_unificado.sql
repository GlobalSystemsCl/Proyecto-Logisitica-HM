-- =============================================================================
-- Brecha 011 (paso 1) — Recálculo unificado de los contadores de slots
-- =============================================================================
-- Problema: slots_ocupados y slots_reservados se mantenían con dos mecanismos
-- que se pisan: triggers incrementales (+1/-1) y fn_recalcular_slots_ocupados,
-- que recalcula solo slots_ocupados y NO cuenta las reservas de traslados
-- internos (cada recálculo borraba del contador las reservas de traslados
-- pendientes). slots_reservados nunca se recalculaba.
--
-- Este paso crea la fuente de verdad única:
--   * fn_estados_reserva_activos(): estados de solicitud que mantienen la
--     reserva de un vehículo (misma lista que el SQL existente; el código la
--     replica en ESTADOS_ACTIVOS_RESERVA).
--   * fn_recalcular_slots_sucursal(id): calcula AMBOS contadores desde los datos.
--       reservados = reservas de solicitudes activas hacia la sucursal
--                  + reservas de traslados internos pendientes o en tránsito
--       ocupados   = vehículos con ubicacion = sucursal + reservados
--     Es la misma fórmula que fn_recalcular_slots_ocupados para vehículos y
--     solicitudes, más los traslados.
--   * fn_recalcular_slots_ocupados(id) pasa a delegar en la nueva función, así
--     los triggers que ya la llaman (entregar, finalizar, recibir traslado)
--     recalculan ambos contadores sin cambiar su código.
--
-- Marcha blanca: los límites de capacidad están desactivados a propósito.
-- Superar la capacidad solo emite un NOTICE; nunca bloquea una operación.
--
-- Los triggers incrementales se reemplazan en el paso 2 y el recálculo único de
-- todas las sucursales es el paso 4.
--
-- Rollback: supabase/rollback/20261013130000_brecha_011_recalculo_slots_unificado.sql
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1. Estados de solicitud que mantienen la reserva de un vehículo
-- -----------------------------------------------------------------------------
create or replace function public.fn_estados_reserva_activos()
returns public.estado_solicitud[]
language sql
stable
set search_path = public, pg_temp
as $$
  select array[
    'pendiente_aprobacion', 'aprobada', 'pendiente', 'priorizada',
    'asignada', 'calendarizada', 'despachada', 'en_transito'
  ]::public.estado_solicitud[];
$$;

revoke execute on function public.fn_estados_reserva_activos() from public, anon;
grant execute on function public.fn_estados_reserva_activos() to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 2. Recálculo completo de los contadores de una sucursal
-- -----------------------------------------------------------------------------
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

  -- Serializa los recálculos concurrentes de la misma sucursal: el segundo
  -- espera al primero y cuenta con sus datos ya confirmados.
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

-- -----------------------------------------------------------------------------
-- 3. La función anterior delega en la nueva (mismos llamadores, misma firma)
-- -----------------------------------------------------------------------------
create or replace function public.fn_recalcular_slots_ocupados(p_sucursal_id bigint)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
begin
  perform public.fn_recalcular_slots_sucursal(p_sucursal_id);
end;
$$;

commit;

-- -----------------------------------------------------------------------------
-- Verificación posterior (ejecutar por separado)
-- -----------------------------------------------------------------------------
-- 1. Las funciones existen:
--    select proname from pg_proc where proname in
--      ('fn_estados_reserva_activos', 'fn_recalcular_slots_sucursal', 'fn_recalcular_slots_ocupados');
-- 2. Este paso no modifica datos por sí solo: los contadores se corrigen cuando
--    algún trigger recalcula una sucursal, o con el recálculo global del paso 4.
