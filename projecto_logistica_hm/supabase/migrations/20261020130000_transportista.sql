-- =============================================================================
-- Transportista de cada traslado (pedido del cliente, 2026-10-19)
-- =============================================================================
-- Cuando Logística programa un traslado debe quedar registrado el
-- transportista (nombre y RUT). Lo usa el reporte de traslados con el que
-- Logística revisa la factura del transportista.
--
-- Qué hace:
--   1. Tabla transportista: catálogo reutilizable (nombre, RUT único, activo).
--      El RUT se guarda normalizado, sin puntos y con guion: 12345678-9 / K.
--      La app valida el dígito verificador (src/lib/rut.ts).
--   2. solicitud.transportista_id y traslado_interno.transportista_id
--      (FK, ON DELETE RESTRICT: un transportista con traslados no se borra,
--      se desactiva). Nulas: las solicitudes y traslados anteriores no tienen.
--   3. RLS: lectura para usuarios activos con sesión. La app escribe con
--      service_role (brecha 001: authenticated no escribe).
--
-- Aplicar ANTES de desplegar el código: las listas de solicitudes y traslados
-- leen transportista_id; sin la columna, quedan vacías.
--
-- Rollback: supabase/rollback/20261020130000_transportista.sql
-- =============================================================================

begin;

create table if not exists public.transportista (
  id          uuid primary key default gen_random_uuid(),
  nombre      text not null,
  rut         text not null,
  activo      boolean not null default true,
  creado_por  uuid references public.usuario (id) on delete set null,
  created_at  timestamptz not null default now(),
  constraint transportista_rut_key unique (rut),
  constraint transportista_rut_formato check (rut ~ '^[0-9]{7,8}-[0-9K]$'),
  constraint transportista_nombre_largo check (char_length(btrim(nombre)) between 3 and 120)
);

alter table public.transportista enable row level security;

drop policy if exists transportista_select_activos on public.transportista;
create policy transportista_select_activos on public.transportista
  for select to authenticated
  using (public.usuario_activo());

revoke all on public.transportista from anon;
revoke insert, update, delete, truncate, references, trigger on public.transportista from authenticated;
grant select on public.transportista to authenticated;

alter table public.solicitud
  add column if not exists transportista_id uuid
  references public.transportista (id) on delete restrict;

alter table public.traslado_interno
  add column if not exists transportista_id uuid
  references public.transportista (id) on delete restrict;

create index if not exists solicitud_transportista_id_idx on public.solicitud (transportista_id);
create index if not exists traslado_interno_transportista_id_idx on public.traslado_interno (transportista_id);

commit;

-- -----------------------------------------------------------------------------
-- Verificación posterior (ejecutar por separado)
-- -----------------------------------------------------------------------------
-- select column_name from information_schema.columns
-- where table_schema = 'public' and column_name = 'transportista_id';   -- 2 filas
-- select count(*) from public.transportista;                            -- 0
