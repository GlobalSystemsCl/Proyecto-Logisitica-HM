-- =============================================================================
-- Rollback de 20261014120000_notificaciones_en_app.sql
-- =============================================================================
-- Quita la tabla de Realtime, borra los índices y restaura las 3 funciones
-- antiguas (sin trigger, como estaban). Los valores agregados al enum
-- tipo_notificacion NO se pueden quitar en Postgres sin recrear el tipo; quedan
-- y no afectan a nada.
--
-- Revertir no borra las notificaciones ya creadas. Para hacerlo:
--   delete from public.notificacion;
-- =============================================================================

begin;

do $$
begin
  if exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notificacion'
  ) then
    alter publication supabase_realtime drop table public.notificacion;
  end if;
end
$$;

drop index if exists public.notificacion_usuario_bandeja_idx;
drop index if exists public.notificacion_emisor_id_idx;

-- Definiciones de producción del 2026-10-14 (misma lógica, formato compacto).
create or replace function public.notificar_solicitud()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_destino uuid;
  v_tipo    public.tipo_notificacion;
  v_titulo  text;
  v_mensaje text;
begin
  if tg_op = 'INSERT' then
    insert into public.notificacion (usuario_id, emisor_id, tipo, titulo, mensaje, entidad, entidad_id, ruta)
    values (new.jefe_local_id, new.ejecutivo_id, 'NUEVA_SOLICITUD', 'Nueva solicitud',
            'Se creó una nueva solicitud pendiente de priorización.', 'solicitud', new.id, '/solicitudes/' || new.id);
    return new;
  end if;

  if old.estado is distinct from new.estado then
    case new.estado
      when 'priorizada' then
        v_destino := new.ejecutivo_id; v_tipo := 'SOLICITUD_PRIORIZADA';
        v_titulo := 'Solicitud priorizada'; v_mensaje := 'Tu solicitud fue priorizada.';
      when 'asignada' then
        v_destino := new.logistica_id; v_tipo := 'SOLICITUD_ASIGNADA';
        v_titulo := 'Nueva solicitud asignada'; v_mensaje := 'Se te asignó una nueva solicitud.';
      when 'calendarizada' then
        v_destino := new.ejecutivo_id; v_tipo := 'SOLICITUD_CALENDARIZADA';
        v_titulo := 'Solicitud calendarizada'; v_mensaje := 'La entrega fue calendarizada.';
      when 'en_transito' then
        v_destino := new.ejecutivo_id; v_tipo := 'SOLICITUD_EN_TRANSITO';
        v_titulo := 'Vehículo en tránsito'; v_mensaje := 'El vehículo ya se encuentra en tránsito.';
      when 'entregada' then
        v_destino := new.ejecutivo_id; v_tipo := 'SOLICITUD_ENTREGADA';
        v_titulo := 'Vehículo entregado'; v_mensaje := 'El vehículo fue entregado.';
      when 'finalizada' then
        v_destino := new.ejecutivo_id; v_tipo := 'SOLICITUD_FINALIZADA';
        v_titulo := 'Solicitud finalizada'; v_mensaje := 'La solicitud fue finalizada.';
      when 'cancelada' then
        v_destino := new.ejecutivo_id; v_tipo := 'SOLICITUD_CANCELADA';
        v_titulo := 'Solicitud cancelada'; v_mensaje := 'La solicitud fue cancelada.';
        if new.logistica_id is not null then
          insert into public.notificacion (usuario_id, emisor_id, tipo, titulo, mensaje, entidad, entidad_id, ruta)
          values (new.logistica_id, auth.uid(), v_tipo, v_titulo, v_mensaje, 'solicitud', new.id, '/solicitudes/' || new.id);
        end if;
      else
        null;
    end case;

    if v_tipo is not null then
      insert into public.notificacion (usuario_id, emisor_id, tipo, titulo, mensaje, entidad, entidad_id, ruta)
      values (v_destino, auth.uid(), v_tipo, v_titulo, v_mensaje, 'solicitud', new.id, '/solicitudes/' || new.id);
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.notificar_observacion()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_destino uuid;
begin
  for v_destino in
    select x from public.solicitud s,
      lateral (values (s.ejecutivo_id), (s.jefe_local_id), (s.logistica_id)) as d(x)
    where s.id = new.solicitud_id
  loop
    if v_destino is not null and v_destino <> new.usuario_id then
      insert into public.notificacion (usuario_id, emisor_id, tipo, titulo, mensaje, entidad, entidad_id, ruta)
      values (v_destino, new.usuario_id, 'NUEVA_OBSERVACION', 'Nueva observación',
              'Se agregó una nueva observación en la solicitud.', 'observacion', new.id,
              '/solicitudes/' || new.solicitud_id);
    end if;
  end loop;
  return new;
end;
$$;

create or replace function public.notificar_solicitud_vehiculo()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_ejecutivo_id uuid;
begin
  select ejecutivo_id into v_ejecutivo_id from public.solicitud where id = new.solicitud_id;

  if tg_op = 'INSERT' then
    insert into public.notificacion (usuario_id, emisor_id, tipo, titulo, mensaje, entidad, entidad_id, ruta)
    values (v_ejecutivo_id, auth.uid(), 'VEHICULO_RESERVADO', 'Vehículo reservado',
            'Se reservó un vehículo para tu solicitud.', 'solicitud_vehiculo', new.id,
            '/solicitudes/' || new.solicitud_id);
    return new;
  end if;

  if old.disponibilidad is distinct from new.disponibilidad and new.disponibilidad = 'liberado' then
    insert into public.notificacion (usuario_id, emisor_id, tipo, titulo, mensaje, entidad, entidad_id, ruta)
    values (v_ejecutivo_id, auth.uid(), 'VEHICULO_LIBERADO', 'Vehículo liberado',
            'El vehículo asociado a tu solicitud fue liberado.', 'solicitud_vehiculo', new.id,
            '/solicitudes/' || new.solicitud_id);
  end if;
  return new;
end;
$$;

revoke execute on function public.notificar_solicitud() from public, anon, authenticated;
revoke execute on function public.notificar_observacion() from public, anon, authenticated;
revoke execute on function public.notificar_solicitud_vehiculo() from public, anon, authenticated;

commit;
