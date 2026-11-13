-- =============================================================================
-- Hallazgos #48 y #49 de la prueba QA (decisiones del 2026-11-13)
-- =============================================================================
-- 1. #48: correlativo propio para los traslados internos, visible como "T-15"
--    (antes se mostraban con un fragmento del uuid: "#529ACF6B"). Es global
--    (no por sucursal) y lo asigna la BD: la app nunca lo escribe.
--    Los existentes se numeran por fecha de creación.
-- 2. #49: tabla `traslado_documento` para las fotos que se adjuntan al recibir
--    un traslado. Mismo bucket que las solicitudes (`solicitud-documentos`),
--    con rutas `traslados/<traslado_id>/...`. Igual que `solicitud_documento`:
--    RLS activo y sin políticas (solo la clave de servicio, desde la app).
--
-- La app lee `traslado_interno.numero`: aplicar ANTES de desplegar el código.
-- Rollback: supabase/rollback/20261113110000_traslado_numero_documentos.sql
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1. Número de traslado
-- -----------------------------------------------------------------------------
create sequence if not exists public.traslado_interno_numero_seq;

alter table public.traslado_interno
  add column if not exists numero bigint;

with numerados as (
  select id, row_number() over (order by created_at, id) as n
  from public.traslado_interno
  where numero is null
)
update public.traslado_interno t
set numero = numerados.n + coalesce((select max(numero) from public.traslado_interno), 0)
from numerados
where t.id = numerados.id;

select setval(
  'public.traslado_interno_numero_seq',
  greatest(coalesce((select max(numero) from public.traslado_interno), 0), 1),
  (select count(*) > 0 from public.traslado_interno)
);

alter table public.traslado_interno
  alter column numero set default nextval('public.traslado_interno_numero_seq');
alter sequence public.traslado_interno_numero_seq owned by public.traslado_interno.numero;
alter table public.traslado_interno
  alter column numero set not null;

create unique index if not exists traslado_interno_numero_key on public.traslado_interno (numero);

comment on column public.traslado_interno.numero is
  'Correlativo visible del traslado (T-<numero>). Lo asigna la secuencia; la app no lo escribe.';

-- -----------------------------------------------------------------------------
-- 2. Documentos (fotos) de traslado
-- -----------------------------------------------------------------------------
create table if not exists public.traslado_documento (
  id uuid primary key default gen_random_uuid(),
  traslado_id uuid not null references public.traslado_interno(id) on delete cascade,
  nombre_archivo text not null,
  tipo_mime text not null,
  tamano_bytes bigint not null check (tamano_bytes > 0),
  ruta_storage text not null unique,
  subido_por uuid references public.usuario(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists traslado_documento_traslado_idx on public.traslado_documento (traslado_id, created_at);

alter table public.traslado_documento enable row level security;
revoke all on table public.traslado_documento from anon, authenticated;

comment on table public.traslado_documento is
  'Fotos y documentos de un traslado interno (se adjuntan al recibirlo). Solo acceso con la clave de servicio.';

commit;
