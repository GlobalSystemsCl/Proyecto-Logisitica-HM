-- =============================================================================
-- Brecha 010 (punto 2) y 008 (vehículo vendido) — Doble reserva de un vehículo
-- =============================================================================
-- El service valida "el vehículo no está reservado" y luego inserta en otra
-- llamada HTTP: dos solicitudes simultáneas pueden reservar el mismo vehículo.
-- Este trigger repite la validación dentro de la transacción del INSERT/UPDATE,
-- serializando por vehículo con un advisory lock.
--
-- Estados que mantienen la reserva: los de ESTADOS_ACTIVOS_RESERVA del código
-- (src/services/solicitudes.service.ts) más 'despachada', que el SQL existente
-- también considera activa.
--
-- Rollback: supabase/rollback/20261007120300_brecha_010_bloqueo_doble_reserva.sql
-- =============================================================================

begin;

create or replace function public.fn_validar_reserva_unica_vehiculo()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.disponibilidad is distinct from 'reservado' then
    return new;
  end if;

  if tg_op = 'UPDATE'
     and old.disponibilidad = 'reservado'
     and old.vehiculo_id = new.vehiculo_id then
    return new;   -- la fila ya era una reserva válida de ese vehículo
  end if;

  perform pg_advisory_xact_lock(hashtext('reserva_vehiculo:' || new.vehiculo_id::text));

  if exists (
    select 1 from public.solicitud_vehiculo sv
    where sv.vehiculo_id = new.vehiculo_id
      and sv.disponibilidad = 'vendido'
  ) then
    raise exception 'El vehículo ya fue vendido y no se puede reservar.'
      using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from public.solicitud_vehiculo sv
    join public.solicitud s on s.id = sv.solicitud_id
    where sv.vehiculo_id = new.vehiculo_id
      and sv.disponibilidad = 'reservado'
      and sv.solicitud_id <> new.solicitud_id
      and s.estado in ('pendiente_aprobacion', 'aprobada', 'pendiente', 'priorizada',
                       'asignada', 'calendarizada', 'despachada', 'en_transito')
  ) then
    raise exception 'El vehículo ya está reservado en otra solicitud activa.'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

revoke execute on function public.fn_validar_reserva_unica_vehiculo() from public, anon, authenticated;

drop trigger if exists tr_validar_reserva_unica_vehiculo on public.solicitud_vehiculo;
create trigger tr_validar_reserva_unica_vehiculo
  before insert or update of disponibilidad, vehiculo_id on public.solicitud_vehiculo
  for each row execute function public.fn_validar_reserva_unica_vehiculo();

commit;

-- Verificación previa recomendada (debe devolver 0 filas; la auditoría
-- confirmó que hoy no hay duplicados):
-- select sv.vehiculo_id, count(*)
-- from public.solicitud_vehiculo sv join public.solicitud s on s.id = sv.solicitud_id
-- where sv.disponibilidad = 'reservado'
--   and s.estado in ('pendiente_aprobacion','aprobada','pendiente','priorizada',
--                    'asignada','calendarizada','despachada','en_transito')
-- group by 1 having count(*) > 1;
