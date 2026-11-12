-- =============================================================================
-- Número de guía de despacho por vehículo (R15, 2026-11-11)
-- =============================================================================
-- Pedido del cliente: antes de despachar, Logística ingresa el número de guía;
-- sin guía no se despacha. La guía se asocia al chasis (a cada vehículo del
-- traslado) y se puede repetir en varios vehículos (una guía puede amparar
-- varios autos).
--
-- Qué hace:
--   1. numero_guia en solicitud_vehiculo y en traslado_interno_vehiculo.
--      Nula: los vínculos anteriores y los que aún no se despachan no tienen.
--      No es única (se repite entre vehículos). Si viene, entre 1 y 40
--      caracteres sin contar espacios de los extremos.
--   2. Índices para buscar por guía.
-- La obligatoriedad la valida la app al despachar (src/lib/guiaDespacho.ts).
--
-- Aplicar ANTES de desplegar el código: las listas de solicitudes y traslados
-- leen numero_guia; sin la columna, quedan vacías.
--
-- Rollback: supabase/rollback/20261111120000_numero_guia_despacho.sql
-- =============================================================================

begin;

alter table public.solicitud_vehiculo
  add column if not exists numero_guia text;
alter table public.solicitud_vehiculo
  drop constraint if exists solicitud_vehiculo_numero_guia_largo;
alter table public.solicitud_vehiculo
  add constraint solicitud_vehiculo_numero_guia_largo
  check (numero_guia is null or char_length(btrim(numero_guia)) between 1 and 40);

alter table public.traslado_interno_vehiculo
  add column if not exists numero_guia text;
alter table public.traslado_interno_vehiculo
  drop constraint if exists traslado_interno_vehiculo_numero_guia_largo;
alter table public.traslado_interno_vehiculo
  add constraint traslado_interno_vehiculo_numero_guia_largo
  check (numero_guia is null or char_length(btrim(numero_guia)) between 1 and 40);

create index if not exists solicitud_vehiculo_numero_guia_idx on public.solicitud_vehiculo (numero_guia);
create index if not exists traslado_interno_vehiculo_numero_guia_idx on public.traslado_interno_vehiculo (numero_guia);

commit;

-- -----------------------------------------------------------------------------
-- Verificación posterior (ejecutar por separado)
-- -----------------------------------------------------------------------------
-- select table_name from information_schema.columns
-- where table_schema = 'public' and column_name = 'numero_guia';   -- 2 filas
