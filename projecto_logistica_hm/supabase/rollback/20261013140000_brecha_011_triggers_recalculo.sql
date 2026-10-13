-- ROLLBACK de 20261013140000_brecha_011_triggers_recalculo.sql
-- Restaura las funciones tal como estaban en producción el 2026-10-13
-- (incrementales +1/-1), vuelve a crear trigger_disponibilidad y elimina los
-- triggers de borrado nuevos. Reabre la desincronización de la brecha 011.
begin;

-- Triggers y funciones nuevas
drop trigger if exists tr_recalcular_slots_solicitud_eliminada on public.solicitud;
drop trigger if exists tr_recalcular_slots_traslado_eliminado on public.traslado_interno;
drop trigger if exists tr_recalcular_slots_traslado_vehiculo_eliminado on public.traslado_interno_vehiculo;
drop function if exists public.fn_recalcular_slots_solicitud_eliminada();
drop function if exists public.fn_recalcular_slots_traslado_eliminado();
drop function if exists public.fn_recalcular_slots_traslado_vehiculo_eliminado();

-- Trigger duplicado de liberación al cancelar
drop trigger if exists trigger_disponibilidad on public.solicitud;
create trigger trigger_disponibilidad
  after update of estado on public.solicitud
  for each row execute function public.disponibilidad();

create or replace function public.fn_reservar_slots_solicitud_vehiculo()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_destino bigint;
  v_tipo    tipo_solicitud;
begin
  select sol.sucursal_destino, sol.tipo_solicitud
    into v_destino, v_tipo
  from public.solicitud sol
  where sol.id = new.solicitud_id;

  if v_tipo = 'evento' or v_destino is null or new.disponibilidad <> 'reservado' then
    return new;
  end if;

  -- slots_reservados y slots_ocupados reciben la misma operacion (+1)
  update public.sucursal
  set slots_reservados = slots_reservados + 1,
      slots_ocupados   = slots_ocupados + 1
  where id = v_destino;

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
  v_tipo    tipo_solicitud;
  v_estado  estado_solicitud;
begin
  select sol.sucursal_destino, sol.tipo_solicitud, sol.estado
    into v_destino, v_tipo, v_estado
  from public.solicitud sol
  where sol.id = old.solicitud_id;

  if v_tipo = 'evento' or v_destino is null
     or old.disponibilidad <> 'reservado'
     or v_estado not in ('pendiente_aprobacion','aprobada','pendiente',
                         'priorizada','asignada','calendarizada','en_transito')
  then
    return old;
  end if;

  update public.sucursal
  set slots_reservados = greatest(slots_reservados - 1, 0),
      slots_ocupados   = greatest(slots_ocupados - 1, 0)
  where id = v_destino;

  return old;
end;
$$;

create or replace function public.fn_liberar_slots_rechazo_cancelacion()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_cantidad integer;
  v_destino  bigint;
begin
  if new.estado not in ('rechazada','cancelada') or old.estado = new.estado then
    return new;
  end if;

  v_destino := new.sucursal_destino;
  if v_destino is null then
    return new;
  end if;

  select count(*) into v_cantidad
  from public.solicitud_vehiculo
  where solicitud_id = new.id and disponibilidad = 'reservado';

  if v_cantidad > 0 then
    -- Vehiculos liberados (vuelven a estar disponibles)
    update public.solicitud_vehiculo
    set disponibilidad = 'liberado'
    where solicitud_id = new.id and disponibilidad = 'reservado';

    -- Misma operacion sobre reservados y ocupados
    update public.sucursal
    set slots_reservados = greatest(slots_reservados - v_cantidad, 0),
        slots_ocupados   = greatest(slots_ocupados - v_cantidad, 0)
    where id = v_destino;
  end if;

  return new;
end;
$$;

create or replace function public.fn_entregar_solicitud_vehiculos()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_cantidad integer;
  v_destino  bigint;
  v_origen   bigint;
begin
  if new.estado <> 'entregada' or old.estado = new.estado then
    return new;
  end if;

  v_destino := new.sucursal_destino;
  v_origen  := new.sucursal;

  -- Evento: sin sucursal destino; el vehiculo vuelve al inventario
  if new.tipo_solicitud = 'evento' or v_destino is null then
    update public.solicitud_vehiculo
    set disponibilidad = 'liberado'
    where solicitud_id = new.id and disponibilidad = 'reservado';
    return new;
  end if;

  select count(*) into v_cantidad
  from public.solicitud_vehiculo
  where solicitud_id = new.id and disponibilidad = 'reservado';

  -- El vehiculo llega y queda estacionado en la sucursal destino
  update public.vehiculo v
  set ubicacion = v_destino
  from public.solicitud_vehiculo sv
  where sv.solicitud_id = new.id
    and sv.vehiculo_id = v.id
    and sv.disponibilidad = 'reservado';

  -- Se libera la reserva pendiente (los vehiculos ya no estan "por llegar")
  if v_cantidad > 0 then
    update public.sucursal
    set slots_reservados = greatest(slots_reservados - v_cantidad, 0)
    where id = v_destino;
  end if;

  -- Recalcular ocupacion (fuente de verdad): el destino sube (llegan), el origen baja
  perform public.fn_recalcular_slots_ocupados(v_destino);
  if v_origen is not null and v_origen <> v_destino then
    perform public.fn_recalcular_slots_ocupados(v_origen);
  end if;

  return new;
end;
$$;

create or replace function public.fn_reservar_slots_traslado_vehiculo()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_destino bigint;
begin
  if new.disponibilidad <> 'reservado' then
    return new;
  end if;

  select t.destino_id into v_destino
  from public.traslado_interno t
  where t.id = new.traslado_id;

  if v_destino is null then
    return new;
  end if;

  update public.sucursal
     set slots_reservados = slots_reservados + 1,
         slots_ocupados   = slots_ocupados + 1
   where id = v_destino;

  return new;
end;
$$;

create or replace function public.fn_recibir_traslado_vehiculos()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_cantidad integer;
begin
  if new.estado <> 'recepcionado' or old.estado is not distinct from new.estado then
    return new;
  end if;

  select count(*) into v_cantidad
  from public.traslado_interno_vehiculo
  where traslado_id = new.id and disponibilidad = 'reservado';

  -- el registro del traslado deja de estar 'reservado': vuelve a 'liberado'
  -- (el vehículo puede tomar una nueva solicitud; NO se marca 'vendido')
  update public.traslado_interno_vehiculo
     set disponibilidad = 'liberado'
   where traslado_id = new.id and disponibilidad = 'reservado';

  -- el vehículo pasa a estar físicamente en el destino
  -- (NO se toca public.vehiculo.disponibilidad: conserva su estado original)
  update public.vehiculo v
     set ubicacion = new.destino_id
    from public.traslado_interno_vehiculo tv
   where tv.traslado_id = new.id
     and tv.vehiculo_id = v.id;

  -- libera la reserva del destino (contador informativo, como en el original)
  if v_cantidad > 0 then
    update public.sucursal
       set slots_reservados = greatest(slots_reservados - v_cantidad, 0)
     where id = new.destino_id;
  end if;

  -- el vehiculo.ubicacion = destino ya cuenta en fn_recalcular_slots_ocupados
  perform public.fn_recalcular_slots_ocupados(new.destino_id);

  return new;
end;
$$;

-- Versión de 20261013120000 (descuenta ambos contadores de a uno).
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
