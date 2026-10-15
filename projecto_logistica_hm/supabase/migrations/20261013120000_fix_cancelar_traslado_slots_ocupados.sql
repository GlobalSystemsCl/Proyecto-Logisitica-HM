-- =============================================================================
-- Corrección R8 — Cancelar un traslado interno descuenta también slots_ocupados
-- =============================================================================
-- Bug: al crear un traslado, el trigger fn_reservar_slots_traslado_vehiculo
-- suma +1 a slots_reservados Y a slots_ocupados del destino. La función
-- fn_cancelar_traslado_interno (20261009120000) solo descontaba
-- slots_reservados, así que cada traslado cancelado dejaba el destino con
-- slots ocupados de más (agrava la brecha 011).
--
-- Verificado en producción (2026-10-13) con pg_get_functiondef: el trigger de
-- creación suma ambos contadores y la función de cancelación descuenta solo uno.
--
-- La corrección es simétrica a la creación: se descuentan ambos contadores
-- por la cantidad de vehículos liberados. No se usa fn_recalcular_slots_ocupados
-- porque no cuenta las reservas de traslados y descontaría las de otros
-- traslados pendientes hacia el mismo destino.
--
-- NO corrige datos ya desfasados (eso es el recálculo único de la brecha 011).
-- Diagnóstico de traslados ya cancelados:
--   select t.id, t.destino_id, t.fecha_cancelacion, count(tiv.*) as vehiculos
--   from public.traslado_interno t
--   left join public.traslado_interno_vehiculo tiv on tiv.traslado_id = t.id
--   where t.estado = 'cancelado'
--   group by 1, 2, 3 order by 3;
--
-- Requiere: 20261009120000_req_traslados_cancelacion_recepcion.sql
-- Rollback: supabase/rollback/20261013120000_fix_cancelar_traslado_slots_ocupados.sql
-- =============================================================================

begin;

create or replace function public.fn_cancelar_traslado_interno(
  p_traslado_id uuid,
  p_usuario_id uuid,
  p_motivo text,
  p_ubicacion bigint
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_estado    public.estado_traslado;
  v_destino   bigint;
  v_vehiculos uuid[];
  v_n         integer;
begin
  select t.estado, t.destino_id into v_estado, v_destino
  from public.traslado_interno t
  where t.id = p_traslado_id
  for update;

  if not found then
    raise exception 'Traslado no encontrado.' using errcode = 'P0001';
  end if;
  if v_estado <> 'en_transito' then
    raise exception 'Solo los traslados en tránsito pueden cancelarse.' using errcode = 'P0001';
  end if;
  if p_motivo is null or length(btrim(p_motivo)) < 5 then
    raise exception 'El motivo de la cancelación es obligatorio (mínimo 5 caracteres).' using errcode = 'P0001';
  end if;
  if p_ubicacion is not null and not exists (select 1 from public.sucursal s where s.id = p_ubicacion) then
    raise exception 'La sucursal indicada como ubicación no existe.' using errcode = 'P0001';
  end if;

  update public.traslado_interno
  set estado = 'cancelado',
      motivo_cancelacion = btrim(p_motivo),
      fecha_cancelacion = now(),
      cancelado_por = p_usuario_id
  where id = p_traslado_id;

  with liberadas as (
    update public.traslado_interno_vehiculo
    set disponibilidad = 'liberado'
    where traslado_id = p_traslado_id and disponibilidad = 'reservado'
    returning vehiculo_id
  )
  select coalesce(array_agg(vehiculo_id), '{}') into v_vehiculos from liberadas;

  update public.vehiculo set ubicacion = p_ubicacion where id = any(v_vehiculos);

  -- Simétrico a fn_reservar_slots_traslado_vehiculo, que sumó ambos contadores.
  v_n := coalesce(array_length(v_vehiculos, 1), 0);
  update public.sucursal
  set slots_reservados = greatest(coalesce(slots_reservados, 0) - v_n, 0),
      slots_ocupados   = greatest(coalesce(slots_ocupados, 0) - v_n, 0)
  where id = v_destino;
end;
$$;

revoke execute on function public.fn_cancelar_traslado_interno(uuid, uuid, text, bigint) from public, anon, authenticated;
grant execute on function public.fn_cancelar_traslado_interno(uuid, uuid, text, bigint) to service_role;

commit;

-- -----------------------------------------------------------------------------
-- Verificación posterior (ejecutar por separado)
-- -----------------------------------------------------------------------------
-- 1. La función descuenta ambos contadores:
--    select pg_get_functiondef('public.fn_cancelar_traslado_interno(uuid,uuid,text,bigint)'::regprocedure);
-- 2. Prueba funcional: crear un traslado de prueba, anotar slots_ocupados y
--    slots_reservados del destino, despacharlo, cancelarlo y confirmar que
--    ambos vuelven al valor inicial.
