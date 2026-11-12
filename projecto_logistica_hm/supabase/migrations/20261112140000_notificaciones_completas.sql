-- =============================================================================
-- Avisos completos del flujo: tipos nuevos de notificación y registro de correos
-- =============================================================================
-- Plan del 2026-11-11 (correos y notificaciones del flujo de solicitudes).
--
-- Qué hace:
--   1. Agrega al enum tipo_notificacion los eventos nuevos de la campana:
--      insistencia del ejecutivo y creación, despacho y recepción de traslados
--      internos. NUEVA_OBSERVACION ya existía.
--   2. Crea public.correo_envio: un registro por cada intento de correo
--      (enviado, fallido, omitido por tope diario o repetido). La app lo usa
--      para no pasar el límite diario de Brevo, no repetir el mismo aviso en
--      pocos minutos y auditar si a alguien le llegó un correo.
--
-- Solo la app escribe y lee correo_envio, con service_role (que no pasa por
-- RLS). RLS activa y sin policies: anon y authenticated no ven nada.
--
-- Orden de despliegue: da igual. Sin la tabla, la app envía sin topes (lo
-- deja en el log); sin los valores del enum, solo se pierden las
-- notificaciones de la campana de esos eventos nuevos.
--
-- ADD VALUE va fuera de la transacción (no se puede usar el valor nuevo en la
-- misma transacción que lo agrega).
--
-- Rollback: supabase/rollback/20261112140000_notificaciones_completas.sql
-- =============================================================================

alter type public.tipo_notificacion add value if not exists 'SOLICITUD_INSISTENCIA';
alter type public.tipo_notificacion add value if not exists 'TRASLADO_INTERNO_CREADO';
alter type public.tipo_notificacion add value if not exists 'TRASLADO_INTERNO_EN_TRANSITO';
alter type public.tipo_notificacion add value if not exists 'TRASLADO_INTERNO_RECEPCIONADO';

begin;

create table if not exists public.correo_envio (
  id uuid primary key default gen_random_uuid(),
  evento text not null,
  entidad text not null check (entidad in ('solicitud', 'traslado_interno')),
  entidad_id uuid not null,
  usuario_id uuid references public.usuario (id) on delete set null,
  email text not null,
  estado text not null check (estado in ('enviado', 'fallido', 'omitido_tope', 'duplicado')),
  urgente boolean not null default false,
  message_id text,
  error text,
  created_at timestamptz not null default now()
);

comment on table public.correo_envio is
  'Intentos de correo de los avisos del flujo (topes diarios, anti-duplicado y auditoría). Solo service_role.';

-- Conteo diario de enviados (tope total).
create index if not exists correo_envio_estado_created_at_idx
  on public.correo_envio (estado, created_at desc);
-- Envíos de hoy por destinatario (tope por usuario y anti-duplicado).
create index if not exists correo_envio_usuario_created_at_idx
  on public.correo_envio (usuario_id, created_at desc);

alter table public.correo_envio enable row level security;
revoke all on public.correo_envio from anon, authenticated;

commit;

-- =============================================================================
-- Verificación posterior (solo lectura)
-- =============================================================================
-- select 'SOLICITUD_INSISTENCIA' = any(enum_range(null::public.tipo_notificacion)::text[]);   -> true
-- select relrowsecurity from pg_class where relname = 'correo_envio';                          -> true
-- select count(*) from pg_policies where tablename = 'correo_envio';                           -> 0
-- select estado, count(*) from public.correo_envio
--   where created_at >= date_trunc('day', now() at time zone 'America/Santiago') at time zone 'America/Santiago'
--   group by estado;                                                                            -> envíos de hoy
