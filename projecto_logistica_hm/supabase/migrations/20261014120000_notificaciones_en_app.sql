-- =============================================================================
-- Notificaciones en la app por cambios de estado de las solicitudes
-- =============================================================================
-- La tabla public.notificacion existe desde el inicio pero nunca se usó (0
-- filas al 2026-10-14). Desde ahora la app inserta una fila por destinatario
-- en cada cambio de estado (NotificacionService, con service_role, después de
-- responder al usuario). Los destinatarios están en src/lib/notificaciones-app.ts.
--
-- Qué hace:
--   1. Agrega al enum tipo_notificacion los eventos que faltaban.
--   2. Índices: bandeja del usuario (no leídas primero, más recientes) y FK
--      emisor_id.
--   3. Publica la tabla en Supabase Realtime: la campana del encabezado se
--      suscribe a los INSERT del propio usuario. Realtime aplica la RLS
--      existente (notificacion_select_destinatario: solo las propias).
--   4. Elimina notificar_solicitud, notificar_observacion y
--      notificar_solicitud_vehiculo: funciones de trigger antiguas, sin trigger
--      asociado (verificado el 2026-10-14). Usaban auth.uid() como emisor, que
--      es NULL cuando escribe la app (service_role) y emisor_id es NOT NULL: si
--      alguien las volviera a conectar, todas las transiciones fallarían.
--
-- Permisos sin cambios: authenticated solo tiene SELECT; marcar como leída se
-- hace con una Server Action (service_role) que valida que sea del usuario.
--
-- Rollback: supabase/rollback/20261014120000_notificaciones_en_app.sql
-- =============================================================================

-- 1. Tipos nuevos. ADD VALUE no se puede revertir dentro de una transacción
--    junto con su uso; aquí solo se agregan (la app los usa después).
alter type public.tipo_notificacion add value if not exists 'SOLICITUD_APROBADA';
alter type public.tipo_notificacion add value if not exists 'SOLICITUD_RECHAZADA';
alter type public.tipo_notificacion add value if not exists 'SOLICITUD_RECALENDARIZADA';
alter type public.tipo_notificacion add value if not exists 'SOLICITUD_DESCALENDARIZADA';
alter type public.tipo_notificacion add value if not exists 'SOLICITUD_DESPACHO_REVERTIDO';
alter type public.tipo_notificacion add value if not exists 'SOLICITUD_CANCELADA_TRANSITO';
alter type public.tipo_notificacion add value if not exists 'TRASLADO_INTERNO_CANCELADO';

begin;

-- 2. Índices
create index if not exists notificacion_usuario_bandeja_idx
  on public.notificacion (usuario_id, leida, created_at desc);
create index if not exists notificacion_emisor_id_idx
  on public.notificacion (emisor_id);

-- 3. Realtime
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notificacion'
  ) then
    alter publication supabase_realtime add table public.notificacion;
  end if;
end
$$;

-- 4. Funciones antiguas sin uso
drop function if exists public.notificar_solicitud();
drop function if exists public.notificar_observacion();
drop function if exists public.notificar_solicitud_vehiculo();

commit;

-- =============================================================================
-- Verificación posterior (solo lectura)
-- =============================================================================
-- select enum_range(null::public.tipo_notificacion);                 -> 18 valores
-- select indexname from pg_indexes where tablename = 'notificacion';  -> pkey + 2
-- select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'notificacion';
-- select proname from pg_proc where proname like 'notificar_%';       -> 0 filas
