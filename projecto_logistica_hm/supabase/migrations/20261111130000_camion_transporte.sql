-- =============================================================================
-- Empresas de transporte y sus camiones (R10, 2026-11-11)
-- =============================================================================
-- Decisión del cliente (2026-11-03): en vez de "transportista" se registra la
-- empresa de transporte (RUT y nombre), el nombre del transportista
-- (conductor) y la patente del camión. Al programar, Logística solo escribe la
-- patente y se completa el resto.
--
-- Qué hace:
--   1. public.transportista pasa a representar la EMPRESA (sin cambios de
--      columnas: nombre = razón social, rut = RUT de la empresa).
--   2. Tabla camion: patente única normalizada (mayúsculas, sin guion ni
--      espacios: ABCD12), empresa a la que pertenece (ON DELETE RESTRICT),
--      conductor habitual opcional y activo.
--   3. patente_camion y conductor_nombre en solicitud y traslado_interno:
--      guardan lo usado en ese traslado aunque el camión cambie después. Nulas:
--      lo programado antes no las tiene. Las escribe la app al programar.
--   4. RLS: lectura para usuarios activos; la app escribe con service_role.
--
-- Rollback: supabase/rollback/20261111130000_camion_transporte.sql
-- =============================================================================

begin;

create table if not exists public.camion (
  id                uuid primary key default gen_random_uuid(),
  patente           text not null,
  transportista_id  uuid not null references public.transportista (id) on delete restrict,
  conductor_nombre  text,
  activo            boolean not null default true,
  creado_por        uuid references public.usuario (id) on delete set null,
  created_at        timestamptz not null default now(),
  constraint camion_patente_key unique (patente),
  constraint camion_patente_formato check (patente ~ '^[A-Z0-9]{5,8}$'),
  constraint camion_conductor_largo check (conductor_nombre is null or char_length(btrim(conductor_nombre)) between 3 and 120)
);

create index if not exists camion_transportista_id_idx on public.camion (transportista_id);

alter table public.camion enable row level security;

drop policy if exists camion_select_activos on public.camion;
create policy camion_select_activos on public.camion
  for select to authenticated
  using (public.usuario_activo());

revoke all on public.camion from anon;
revoke insert, update, delete, truncate, references, trigger on public.camion from authenticated;
grant select on public.camion to authenticated;

alter table public.solicitud add column if not exists patente_camion text;
alter table public.solicitud add column if not exists conductor_nombre text;
alter table public.traslado_interno add column if not exists patente_camion text;
alter table public.traslado_interno add column if not exists conductor_nombre text;

create index if not exists solicitud_patente_camion_idx on public.solicitud (patente_camion);
create index if not exists traslado_interno_patente_camion_idx on public.traslado_interno (patente_camion);

commit;

-- -----------------------------------------------------------------------------
-- Verificación posterior (ejecutar por separado)
-- -----------------------------------------------------------------------------
-- select count(*) from public.camion;                                   -- 0
-- select table_name, column_name from information_schema.columns
-- where table_schema = 'public' and column_name in ('patente_camion', 'conductor_nombre');   -- 4 filas
