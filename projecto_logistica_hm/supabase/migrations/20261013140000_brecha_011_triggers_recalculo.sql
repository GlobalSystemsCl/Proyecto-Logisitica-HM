-- =============================================================================
-- Brecha 011 (paso 2) — Los triggers de slots recalculan en lugar de sumar/restar
-- =============================================================================
-- Antes: las reservas sumaban o restaban 1 a slots_ocupados/slots_reservados
-- (incremental) y otras operaciones recalculaban solo slots_ocupados. Los dos
-- mecanismos se pisaban y cualquier error quedaba para siempre.
--
-- Ahora toda función que cambia una reserva llama a
-- fn_recalcular_slots_sucursal (paso 1), que fija ambos contadores desde los
-- datos. Las funciones conservan su nombre, así los triggers existentes no
-- cambian:
--   * fn_reservar_slots_solicitud_vehiculo   (AFTER INSERT solicitud_vehiculo)
--   * fn_liberar_slots_solicitud_vehiculo_eliminado (AFTER DELETE solicitud_vehiculo)
--   * fn_liberar_slots_rechazo_cancelacion   (AFTER UPDATE solicitud): libera las
--     reservas al rechazar o cancelar, también en eventos sin destino (antes
--     lo hacía en parte el trigger duplicado trigger_disponibilidad).
--   * fn_entregar_solicitud_vehiculos        (sin el descuento manual de reservados)
--   * fn_reservar_slots_traslado_vehiculo    (AFTER INSERT traslado_interno_vehiculo)
--   * fn_recibir_traslado_vehiculos          (sin el descuento manual de reservados)
--   * fn_cancelar_traslado_interno           (RPC de R8)
--
-- Fugas que se cierran (antes nadie descontaba la reserva):
--   * Borrar una solicitud: sus reservas se borran en cascada y el trigger de
--     solicitud_vehiculo ya no encuentra la solicitud. Nuevo trigger AFTER DELETE
--     en solicitud que recalcula su destino.
--   * Borrar un traslado interno (p. ej. el borrado compensatorio de
--     crearTraslado) o un vehículo de un traslado. Nuevos triggers AFTER DELETE.
--
-- Se elimina trigger_disponibilidad: duplicaba la liberación de vehículos al
-- cancelar (la función disponibilidad() se conserva sin uso).
--
-- Los movimientos físicos de vehículos (vehiculo.ubicacion) los cubre el
-- trigger de vehículos del paso 3.
--
-- Requiere: 20261013130000_brecha_011_recalculo_slots_unificado.sql
-- Rollback: supabase/rollback/20261013140000_brecha_011_triggers_recalculo.sql
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1. Solicitudes
-- -----------------------------------------------------------------------------
create or replace function public.fn_reservar_slots_solicitud_vehiculo()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_destino bigint;
begin
  select sol.sucursal_destino into v_destino
  from public.solicitud sol
  where sol.id = new.solicitud_id;

  perform public.fn_recalcular_slots_sucursal(v_destino);
  return new;
end;
$$;

create or replace function public.fn_liberar_slots_solicitud_vehiculo_eliminado()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_destino bigint;
begin
  -- Si la solicitud también se está borrando (cascada) no se encuentra: la
  -- recalcula el trigger de borrado de solicitud.
  select sol.sucursal_destino into v_destino
  from public.solicitud sol
  where sol.id = old.solicitud_id;

  perform public.fn_recalcular_slots_sucursal(v_destino);
  return old;
end;
$$;

create or replace function public.fn_liberar_slots_rechazo_cancelacion()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.estado not in ('rechazada', 'cancelada') or old.estado = new.estado then
    return new;
  end if;

  -- Los vehículos vuelven a estar disponibles (también en eventos sin destino).
  update public.solicitud_vehiculo
  set disponibilidad = 'liberado'
  where solicitud_id = new.id and disponibilidad = 'reservado';

  perform public.fn_recalcular_slots_sucursal(new.sucursal_destino);
  return new;
end;
$$;

create or replace function public.fn_entregar_solicitud_vehiculos()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_destino bigint;
  v_origen  bigint;
begin
  if new.estado <> 'entregada' or old.estado = new.estado then
    return new;
  end if;

  v_destino := new.sucursal_destino;
  v_origen  := new.sucursal;

  -- Evento: sin sucursal destino; el vehículo vuelve al inventario
  if new.tipo_solicitud = 'evento' or v_destino is null then
    update public.solicitud_vehiculo
    set disponibilidad = 'liberado'
    where solicitud_id = new.id and disponibilidad = 'reservado';
    return new;
  end if;

  -- El vehículo llega y queda estacionado en la sucursal destino
  update public.vehiculo v
  set ubicacion = v_destino
  from public.solicitud_vehiculo sv
  where sv.solicitud_id = new.id
    and sv.vehiculo_id = v.id
    and sv.disponibilidad = 'reservado';

  -- La solicitud entregada ya no cuenta como reserva y el vehículo cuenta
  -- como físico en el destino: el recálculo fija ambos contadores.
  perform public.fn_recalcular_slots_sucursal(v_destino);
  if v_origen is not null and v_origen <> v_destino then
    perform public.fn_recalcular_slots_sucursal(v_origen);
  end if;

  return new;
end;
$$;

create or replace function public.fn_recalcular_slots_solicitud_eliminada()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  perform public.fn_recalcular_slots_sucursal(old.sucursal_destino);
  return old;
end;
$$;

revoke execute on function public.fn_recalcular_slots_solicitud_eliminada() from public, anon, authenticated;

drop trigger if exists tr_recalcular_slots_solicitud_eliminada on public.solicitud;
create trigger tr_recalcular_slots_solicitud_eliminada
  after delete on public.solicitud
  for each row execute function public.fn_recalcular_slots_solicitud_eliminada();

-- Duplicaba la liberación de fn_liberar_slots_rechazo_cancelacion.
drop trigger if exists trigger_disponibilidad on public.solicitud;

-- -----------------------------------------------------------------------------
-- 2. Traslados internos
-- -----------------------------------------------------------------------------
create or replace function public.fn_reservar_slots_traslado_vehiculo()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_destino bigint;
begin
  select t.destino_id into v_destino
  from public.traslado_interno t
  where t.id = new.traslado_id;

  perform public.fn_recalcular_slots_sucursal(v_destino);
  return new;
end;
$$;

create or replace function public.fn_recibir_traslado_vehiculos()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.estado <> 'recepcionado' or old.estado is not distinct from new.estado then
    return new;
  end if;

  -- el registro del traslado deja de estar 'reservado': vuelve a 'liberado'
  -- (el vehículo puede tomar una nueva solicitud; NO se marca 'vendido')
  update public.traslado_interno_vehiculo
  set disponibilidad = 'liberado'
  where traslado_id = new.id and disponibilidad = 'reservado';

  -- el vehículo pasa a estar físicamente en el destino
  -- (NO se toca la disponibilidad del vehículo: conserva su estado original)
  update public.vehiculo v
  set ubicacion = new.destino_id
  from public.traslado_interno_vehiculo tv
  where tv.traslado_id = new.id
    and tv.vehiculo_id = v.id;

  perform public.fn_recalcular_slots_sucursal(new.destino_id);
  return new;
end;
$$;

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

  -- El destino ya no recibirá el vehículo.
  perform public.fn_recalcular_slots_sucursal(v_destino);
end;
$$;

revoke execute on function public.fn_cancelar_traslado_interno(uuid, uuid, text, bigint) from public, anon, authenticated;
grant execute on function public.fn_cancelar_traslado_interno(uuid, uuid, text, bigint) to service_role;

create or replace function public.fn_recalcular_slots_traslado_eliminado()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  perform public.fn_recalcular_slots_sucursal(old.destino_id);
  return old;
end;
$$;

create or replace function public.fn_recalcular_slots_traslado_vehiculo_eliminado()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_destino bigint;
begin
  -- Si el traslado también se está borrando (cascada) no se encuentra: lo
  -- recalcula el trigger de borrado de traslado.
  select t.destino_id into v_destino
  from public.traslado_interno t
  where t.id = old.traslado_id;

  perform public.fn_recalcular_slots_sucursal(v_destino);
  return old;
end;
$$;

revoke execute on function public.fn_recalcular_slots_traslado_eliminado() from public, anon, authenticated;
revoke execute on function public.fn_recalcular_slots_traslado_vehiculo_eliminado() from public, anon, authenticated;

drop trigger if exists tr_recalcular_slots_traslado_eliminado on public.traslado_interno;
create trigger tr_recalcular_slots_traslado_eliminado
  after delete on public.traslado_interno
  for each row execute function public.fn_recalcular_slots_traslado_eliminado();

drop trigger if exists tr_recalcular_slots_traslado_vehiculo_eliminado on public.traslado_interno_vehiculo;
create trigger tr_recalcular_slots_traslado_vehiculo_eliminado
  after delete on public.traslado_interno_vehiculo
  for each row execute function public.fn_recalcular_slots_traslado_vehiculo_eliminado();

commit;

-- -----------------------------------------------------------------------------
-- Verificación posterior (ejecutar por separado)
-- -----------------------------------------------------------------------------
-- 1. Ninguna función de slots suma o resta de a uno:
--    select proname from pg_proc
--    where proname like 'fn_%slots%' and pg_get_functiondef(oid) ~ 'slots_(ocupados|reservados)\s*[+-]\s*1';
--    -> solo fn_incrementar_slots_ocupados / fn_decrementar_slots_ocupados (sin trigger, sin uso).
-- 2. trigger_disponibilidad ya no existe:
--    select tgname from pg_trigger where tgname = 'trigger_disponibilidad';  -> 0 filas
