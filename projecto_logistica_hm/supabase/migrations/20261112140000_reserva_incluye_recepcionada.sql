-- =============================================================================
-- Hallazgos #1 y #44 de la prueba QA (2026-11-12)
-- =============================================================================
-- Un vehículo de una solicitud `entregada` (recepcionada en destino, falta la
-- entrega al cliente) sigue comprometido con ese cliente: no puede pedirse en
-- otra solicitud ni moverse en un traslado interno.
--
-- 1. `fn_validar_reserva_unica_vehiculo` ya bloquea `entregada` en producción
--    (se cambió directo en la BD, sin migración). Esta migración la deja igual
--    en el repo; aplicarla en producción no cambia su comportamiento.
-- 2. Nuevo trigger en `traslado_interno_vehiculo`: la BD rechaza trasladar un
--    vehículo vendido o reservado en una solicitud activa (hasta hoy solo lo
--    validaba la app, con una lista de estados incompleta).
-- 3. `fn_vehiculos_disponibles_traslado` deja de ofrecer esos vehículos.
--
-- Rollback: supabase/rollback/20261112140000_reserva_incluye_recepcionada.sql
--
-- Los estados deben coincidir con `ESTADOS_BLOQUEAN_VEHICULO`
-- (src/services/solicitudes.service.ts); un test compara ambas listas.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1. Reserva única por vehículo (incluye `entregada`)
-- -----------------------------------------------------------------------------
create or replace function public.fn_validar_reserva_unica_vehiculo()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.disponibilidad is distinct from 'reservado' then return new; end if;
  if tg_op = 'UPDATE' and old.disponibilidad = 'reservado' and old.vehiculo_id = new.vehiculo_id then return new; end if;
  perform pg_advisory_xact_lock(hashtext('reserva_vehiculo:' || new.vehiculo_id::text));
  if exists (
    select 1 from public.solicitud_vehiculo sv
    where sv.vehiculo_id = new.vehiculo_id and sv.disponibilidad = 'vendido'
  ) then
    raise exception 'El vehículo ya fue vendido y no se puede reservar.' using errcode = 'P0001';
  end if;
  if exists (
    select 1
    from public.solicitud_vehiculo sv
    join public.solicitud s on s.id = sv.solicitud_id
    where sv.vehiculo_id = new.vehiculo_id
      and sv.disponibilidad = 'reservado'
      and sv.solicitud_id <> new.solicitud_id
      and s.estado in ('pendiente_aprobacion', 'aprobada', 'pendiente', 'priorizada',
                       'asignada', 'calendarizada', 'despachada', 'en_transito', 'entregada')
  ) then
    raise exception 'El vehículo ya está reservado en otra solicitud activa.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke execute on function public.fn_validar_reserva_unica_vehiculo() from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 2. Solo se trasladan vehículos libres
-- -----------------------------------------------------------------------------
create or replace function public.fn_validar_vehiculo_trasladable()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform pg_advisory_xact_lock(hashtext('reserva_vehiculo:' || new.vehiculo_id::text));
  if exists (
    select 1 from public.solicitud_vehiculo sv
    where sv.vehiculo_id = new.vehiculo_id and sv.disponibilidad = 'vendido'
  ) then
    raise exception 'El vehículo ya fue vendido y no se puede trasladar.' using errcode = 'P0001';
  end if;
  if exists (
    select 1
    from public.solicitud_vehiculo sv
    join public.solicitud s on s.id = sv.solicitud_id
    where sv.vehiculo_id = new.vehiculo_id
      and sv.disponibilidad = 'reservado'
      and s.estado in ('pendiente_aprobacion', 'aprobada', 'pendiente', 'priorizada',
                       'asignada', 'calendarizada', 'despachada', 'en_transito', 'entregada')
  ) then
    raise exception 'El vehículo está reservado en una solicitud activa y no se puede trasladar.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke execute on function public.fn_validar_vehiculo_trasladable() from public, anon, authenticated;

drop trigger if exists tr_validar_vehiculo_trasladable on public.traslado_interno_vehiculo;
create trigger tr_validar_vehiculo_trasladable
  before insert on public.traslado_interno_vehiculo
  for each row execute function public.fn_validar_vehiculo_trasladable();

-- -----------------------------------------------------------------------------
-- 3. La búsqueda de vehículos para traslados tampoco ofrece los de `entregada`
-- -----------------------------------------------------------------------------
-- Igual que 20261020120000, salvo la lista de estados (antes usaba
-- fn_estados_reserva_activos, que es la de los slots y no incluye `entregada`).
create or replace function public.fn_vehiculos_disponibles_traslado(
  p_busqueda       text   default null,
  p_sucursal_id    bigint default null,
  p_marca          text   default null,
  p_limite         int    default 12,
  p_desplazamiento int    default 0
)
returns table (
  id               uuid,
  chasis           varchar,
  patente          varchar,
  marca            varchar,
  modelo           varchar,
  anio             int,
  color            varchar,
  ubicacion        bigint,
  ubicacion_nombre varchar,
  total            bigint
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with filtro as (
    select nullif(left(regexp_replace(coalesce(p_busqueda, ''), '[^A-Za-z0-9-]', '', 'g'), 30), '') as termino
  ),
  candidatos as (
    select v.id, v.chasis, v.patente, v.marca, v.modelo, v.anio, v.color, v.ubicacion
    from public.vehiculo v, filtro f
    where not exists (
            select 1
            from public.solicitud_vehiculo sv
            join public.solicitud s on s.id = sv.solicitud_id
            where sv.vehiculo_id = v.id
              and sv.disponibilidad = 'reservado'
              and s.estado in ('pendiente_aprobacion', 'aprobada', 'pendiente', 'priorizada',
                               'asignada', 'calendarizada', 'despachada', 'en_transito', 'entregada')
          )
      and not exists (
            select 1
            from public.solicitud_vehiculo sv
            where sv.vehiculo_id = v.id
              and sv.disponibilidad = 'vendido'
          )
      and (p_sucursal_id is null or v.ubicacion = p_sucursal_id)
      and (p_marca is null or v.marca = p_marca)
      and (f.termino is null
           or v.patente ilike '%' || f.termino || '%'
           or v.chasis  ilike '%' || f.termino || '%')
  )
  select c.id, c.chasis, c.patente, c.marca, c.modelo, c.anio, c.color, c.ubicacion,
         su.nombre as ubicacion_nombre,
         count(*) over () as total
  from candidatos c
  left join public.sucursal su on su.id = c.ubicacion
  order by c.chasis, c.id
  limit greatest(least(coalesce(p_limite, 12), 100), 1)
  offset greatest(coalesce(p_desplazamiento, 0), 0);
$$;

revoke execute on function public.fn_vehiculos_disponibles_traslado(text, bigint, text, int, int) from public, anon, authenticated;
grant execute on function public.fn_vehiculos_disponibles_traslado(text, bigint, text, int, int) to service_role;

commit;
