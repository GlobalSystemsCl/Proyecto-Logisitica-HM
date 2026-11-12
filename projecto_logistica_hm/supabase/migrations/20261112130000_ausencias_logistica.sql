-- =============================================================================
-- Ausencias de Logística con sustituto (R9, 2026-11-12)
-- =============================================================================
-- Pedido del cliente: si un usuario de Logística sale de vacaciones, se congela
-- su cuenta y lo cubre un sustituto. Decisiones (2026-11-03): sus solicitudes
-- y traslados en curso se traspasan al sustituto, que además atiende sus
-- zonas; al volver, lo traspasado que siga abierto vuelve solo al titular.
--
-- Qué hace:
--   1. ausencia_usuario: titular, sustituto, desde y hasta (días inclusive),
--      estado (programada, activa, finalizada, cancelada) y quién la creó.
--      Un titular no puede tener dos ausencias programadas o activas a la vez.
--   2. ausencia_traspaso: qué solicitudes y traslados se traspasaron, para
--      devolver solo eso al terminar.
--   3. usuario_zona.ausencia_id: las zonas que el sustituto recibe por la
--      ausencia (nula = zona propia). Se borran al terminar.
--   4. RLS: lectura solo del administrador; la app escribe con service_role.
-- El inicio y el fin los aplica la app (AusenciaService.procesarPendientes):
-- un cron diario de Vercel y, como respaldo, al abrir la pantalla.
--
-- Rollback: supabase/rollback/20261112130000_ausencias_logistica.sql
-- =============================================================================

begin;

create table if not exists public.ausencia_usuario (
  id             uuid primary key default gen_random_uuid(),
  titular_id     uuid not null references public.usuario (id) on delete cascade,
  sustituto_id   uuid not null references public.usuario (id) on delete restrict,
  desde          date not null,
  hasta          date not null,
  estado         text not null default 'programada',
  motivo         text,
  creada_por     uuid references public.usuario (id) on delete set null,
  created_at     timestamptz not null default now(),
  iniciada_at    timestamptz,
  finalizada_at  timestamptz,
  constraint ausencia_usuario_estado check (estado in ('programada', 'activa', 'finalizada', 'cancelada')),
  constraint ausencia_usuario_rango check (hasta >= desde),
  constraint ausencia_usuario_distintos check (titular_id <> sustituto_id)
);

create unique index if not exists ausencia_usuario_una_vigente_por_titular
  on public.ausencia_usuario (titular_id)
  where estado in ('programada', 'activa');
create index if not exists ausencia_usuario_sustituto_idx on public.ausencia_usuario (sustituto_id);

create table if not exists public.ausencia_traspaso (
  ausencia_id  uuid not null references public.ausencia_usuario (id) on delete cascade,
  entidad      text not null,
  entidad_id   uuid not null,
  primary key (ausencia_id, entidad, entidad_id),
  constraint ausencia_traspaso_entidad check (entidad in ('solicitud', 'traslado_interno'))
);

alter table public.usuario_zona
  add column if not exists ausencia_id uuid references public.ausencia_usuario (id) on delete cascade;
create index if not exists usuario_zona_ausencia_idx on public.usuario_zona (ausencia_id);

alter table public.ausencia_usuario enable row level security;
alter table public.ausencia_traspaso enable row level security;

drop policy if exists ausencia_usuario_select_admin on public.ausencia_usuario;
create policy ausencia_usuario_select_admin on public.ausencia_usuario
  for select to authenticated
  using (public.es_administrador());

drop policy if exists ausencia_traspaso_select_admin on public.ausencia_traspaso;
create policy ausencia_traspaso_select_admin on public.ausencia_traspaso
  for select to authenticated
  using (public.es_administrador());

revoke all on public.ausencia_usuario from anon;
revoke all on public.ausencia_traspaso from anon;
revoke insert, update, delete, truncate, references, trigger on public.ausencia_usuario from authenticated;
revoke insert, update, delete, truncate, references, trigger on public.ausencia_traspaso from authenticated;
grant select on public.ausencia_usuario to authenticated;
grant select on public.ausencia_traspaso to authenticated;

commit;

-- -----------------------------------------------------------------------------
-- Verificación posterior (ejecutar por separado)
-- -----------------------------------------------------------------------------
-- select count(*) from public.ausencia_usuario;                                   -- 0
-- select column_name from information_schema.columns
-- where table_name = 'usuario_zona' and column_name = 'ausencia_id';             -- 1 fila
