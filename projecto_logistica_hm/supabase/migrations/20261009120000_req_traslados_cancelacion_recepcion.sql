-- =============================================================================
-- Requisitos R8, R13 y R14 — Traslados 1 a 1, cancelación en tránsito y
-- registro de la recepción
-- =============================================================================
-- R14: cada traslado interno lleva UN solo vehículo. Se valida con un trigger
--      al insertar, así los traslados históricos con varios vehículos quedan
--      intactos (una restricción UNIQUE fallaría sobre esos datos).
-- R13: la recepción de un traslado interno registra si llegó con novedades y
--      una observación.
-- R8:  Logística puede cancelar un traslado en tránsito (solicitud o traslado
--      interno) con un motivo, indicando dónde queda el vehículo. Las funciones
--      hacen todo en una sola transacción.
--
-- Requiere: 20261009110000_req_estado_traslado_cancelado.sql
-- Rollback: supabase/rollback/20261009120000_req_traslados_cancelacion_recepcion.sql
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1. Columnas de cancelación y recepción en traslado_interno
-- -----------------------------------------------------------------------------
alter table public.traslado_interno
  add column if not exists motivo_cancelacion text,
  add column if not exists fecha_cancelacion timestamptz,
  add column if not exists cancelado_por uuid references public.usuario(id),
  add column if not exists recepcion_con_novedades boolean,
  add column if not exists observacion_recepcion text;

-- -----------------------------------------------------------------------------
-- 2. R14: un vehículo por traslado interno (solo para inserciones nuevas)
-- -----------------------------------------------------------------------------
create or replace function public.fn_validar_un_vehiculo_por_traslado()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform pg_advisory_xact_lock(hashtext('traslado_un_vehiculo:' || new.traslado_id::text));
  if exists (
    select 1 from public.traslado_interno_vehiculo tiv
    where tiv.traslado_id = new.traslado_id
  ) then
    raise exception 'Cada traslado interno lleva un solo vehículo.'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke execute on function public.fn_validar_un_vehiculo_por_traslado() from public, anon, authenticated;

drop trigger if exists tr_validar_un_vehiculo_por_traslado on public.traslado_interno_vehiculo;
create trigger tr_validar_un_vehiculo_por_traslado
  before insert on public.traslado_interno_vehiculo
  for each row execute function public.fn_validar_un_vehiculo_por_traslado();

-- -----------------------------------------------------------------------------
-- 3. R8: cancelar un traslado interno en tránsito
-- -----------------------------------------------------------------------------
-- Pasa el traslado a 'cancelado', libera las filas reservadas, deja el
-- vehículo en la ubicación indicada (o sin ubicación) y descuenta los slots
-- reservados del destino (que nunca recibirá el vehículo).
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

  update public.sucursal
  set slots_reservados = greatest(coalesce(slots_reservados, 0) - coalesce(array_length(v_vehiculos, 1), 0), 0)
  where id = v_destino;
end;
$$;

revoke execute on function public.fn_cancelar_traslado_interno(uuid, uuid, text, bigint) from public, anon, authenticated;
grant execute on function public.fn_cancelar_traslado_interno(uuid, uuid, text, bigint) to service_role;

-- -----------------------------------------------------------------------------
-- 4. R8: cancelar una solicitud en tránsito
-- -----------------------------------------------------------------------------
-- Pasa la solicitud a 'cancelada' con el motivo. Los triggers existentes de
-- cancelación (liberación de vehículos y slots) se ejecutan como en cualquier
-- cancelación. Además se garantiza que las reservas queden liberadas y se deja
-- el vehículo en la ubicación indicada por Logística.
create or replace function public.fn_cancelar_solicitud_en_transito(
  p_solicitud_id uuid,
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
  v_estado    public.estado_solicitud;
  v_vehiculos uuid[];
begin
  select s.estado into v_estado
  from public.solicitud s
  where s.id = p_solicitud_id
  for update;

  if not found then
    raise exception 'Solicitud no encontrada.' using errcode = 'P0001';
  end if;
  if v_estado <> 'en_transito' then
    raise exception 'Solo las solicitudes en tránsito pueden cancelarse con esta acción.' using errcode = 'P0001';
  end if;
  if p_motivo is null or length(btrim(p_motivo)) < 5 then
    raise exception 'El motivo de la cancelación es obligatorio (mínimo 5 caracteres).' using errcode = 'P0001';
  end if;
  if p_ubicacion is not null and not exists (select 1 from public.sucursal s where s.id = p_ubicacion) then
    raise exception 'La sucursal indicada como ubicación no existe.' using errcode = 'P0001';
  end if;

  select coalesce(array_agg(sv.vehiculo_id), '{}') into v_vehiculos
  from public.solicitud_vehiculo sv
  where sv.solicitud_id = p_solicitud_id and sv.disponibilidad = 'reservado';

  update public.solicitud
  set estado = 'cancelada',
      motivo_cancelacion = btrim(p_motivo),
      posicion_prioridad = null
  where id = p_solicitud_id;

  update public.solicitud_vehiculo
  set disponibilidad = 'liberado'
  where solicitud_id = p_solicitud_id and disponibilidad = 'reservado';

  update public.vehiculo set ubicacion = p_ubicacion where id = any(v_vehiculos);
end;
$$;

revoke execute on function public.fn_cancelar_solicitud_en_transito(uuid, uuid, text, bigint) from public, anon, authenticated;
grant execute on function public.fn_cancelar_solicitud_en_transito(uuid, uuid, text, bigint) to service_role;

commit;

-- -----------------------------------------------------------------------------
-- Verificación posterior (ejecutar por separado)
-- -----------------------------------------------------------------------------
-- 1. Traslados históricos con varios vehículos (quedan como están):
--    select traslado_id, count(*) from public.traslado_interno_vehiculo group by 1 having count(*) > 1;
-- 2. Después de la primera cancelación de una solicitud en tránsito, revisar
--    que slots_reservados de la sucursal destino bajó. Si no bajó, el trigger
--    de cancelación existente solo considera estados previos al despacho y hay
--    que ajustarlo.
