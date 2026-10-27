-- =============================================================================
-- Recrear la tabla vehiculo con las columnas del Excel de stock (2026-10-27)
-- =============================================================================
-- El 2026-10-26, al borrar las sucursales de prueba, se ejecutó
-- `DROP TABLE vehiculo CASCADE` desde el SQL Editor. Eso eliminó el
-- inventario completo: la tabla, sus triggers de slots, sus políticas y las FK
-- desde solicitud_vehiculo y traslado_interno_vehiculo. La app y las funciones
-- de la BD (traslados, slots, entregas) siguen leyendo public.vehiculo.
--
-- Qué hace:
--   1. Crea public.vehiculo con TODAS las columnas que usaba la app (id,
--      chasis, patente, marca, modelo, anio, color, precio, ubicacion,
--      created_at, updated_at) y suma las del Excel de stock y compras
--      (modelo_excel/): tipo_vehiculo ("Tipo de vehículo", VN), marca_codigo
--      ("Marca": HY, TO...) e idv ("IDV"). `marca` guarda la "Marca completa".
--      anio deja de ser obligatorio: el Excel no lo trae.
--   2. Vuelve a crear las FK con los nombres que usa la app en los embeds de
--      PostgREST (vehiculo_ubicacion_fkey, solicitud_vehiculo_vehiculo_fk) y
--      traslado_interno_vehiculo_vehiculo_id_fkey. ubicacion queda ON DELETE
--      RESTRICT (brecha 016): una sucursal con vehículos no se borra.
--   3. Vuelve a crear los 3 triggers por sentencia que recalculan los slots
--      físicos (20261013150000; las funciones siguen existiendo) y el de
--      updated_at.
--   4. RLS: lectura para usuarios activos; la app escribe con service_role
--      (brecha 001: authenticated no escribe).
--
-- solicitud_vehiculo y traslado_interno_vehiculo deben estar vacías o apuntar
-- a vehículos existentes (al 2026-10-27 están vacías, tras
-- scripts/04_limpiar_datos_prueba.sql).
--
-- Rollback: supabase/rollback/20261027120000_recrear_vehiculo_formato_stock.sql
-- =============================================================================

begin;

create table if not exists public.vehiculo (
  id             uuid primary key default gen_random_uuid(),
  chasis         varchar not null,
  patente        varchar,
  tipo_vehiculo  varchar,
  marca_codigo   varchar,
  marca          varchar not null,
  modelo         varchar not null,
  idv            varchar,
  anio           integer,
  color          varchar,
  precio         numeric,
  ubicacion      bigint,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint vehiculo_chasis_key unique (chasis),
  constraint vehiculo_ubicacion_fkey foreign key (ubicacion)
    references public.sucursal (id) on delete restrict,
  constraint vehiculo_anio_rango check (anio is null or anio between 1900 and 2100),
  constraint vehiculo_precio_no_negativo check (precio is null or precio >= 0)
);

create index if not exists vehiculo_ubicacion_idx on public.vehiculo (ubicacion);
create index if not exists vehiculo_marca_idx on public.vehiculo (marca);
create index if not exists vehiculo_patente_idx on public.vehiculo (patente);
create index if not exists vehiculo_idv_idx on public.vehiculo (idv);

-- FK desde las tablas de vínculo (nombres que usa la app en los embeds)
alter table public.solicitud_vehiculo
  drop constraint if exists solicitud_vehiculo_vehiculo_fk;
alter table public.solicitud_vehiculo
  add constraint solicitud_vehiculo_vehiculo_fk foreign key (vehiculo_id)
  references public.vehiculo (id) on delete restrict;

alter table public.traslado_interno_vehiculo
  drop constraint if exists traslado_interno_vehiculo_vehiculo_id_fkey;
alter table public.traslado_interno_vehiculo
  add constraint traslado_interno_vehiculo_vehiculo_id_fkey foreign key (vehiculo_id)
  references public.vehiculo (id) on delete restrict;

-- updated_at
drop trigger if exists tr_vehiculo_updated_at on public.vehiculo;
create trigger tr_vehiculo_updated_at
  before update on public.vehiculo
  for each row execute function public.handle_updated_at();

-- Slots físicos: un recálculo por sucursal afectada y por sentencia
drop trigger if exists tr_recalcular_slots_vehiculos_insertados on public.vehiculo;
create trigger tr_recalcular_slots_vehiculos_insertados
  after insert on public.vehiculo
  referencing new table as nuevos
  for each statement execute function public.fn_recalcular_slots_vehiculos_insertados();

drop trigger if exists tr_recalcular_slots_vehiculos_actualizados on public.vehiculo;
create trigger tr_recalcular_slots_vehiculos_actualizados
  after update on public.vehiculo
  referencing old table as viejos new table as nuevos
  for each statement execute function public.fn_recalcular_slots_vehiculos_actualizados();

drop trigger if exists tr_recalcular_slots_vehiculos_eliminados on public.vehiculo;
create trigger tr_recalcular_slots_vehiculos_eliminados
  after delete on public.vehiculo
  referencing old table as viejos
  for each statement execute function public.fn_recalcular_slots_vehiculos_eliminados();

-- RLS y permisos
alter table public.vehiculo enable row level security;

drop policy if exists vehiculo_select_activos on public.vehiculo;
create policy vehiculo_select_activos on public.vehiculo
  for select to authenticated
  using (public.usuario_activo());

revoke all on public.vehiculo from anon;
revoke insert, update, delete, truncate, references, trigger on public.vehiculo from authenticated;
grant select on public.vehiculo to authenticated;
grant all on public.vehiculo to service_role;

commit;

-- -----------------------------------------------------------------------------
-- Verificación posterior (ejecutar por separado)
-- -----------------------------------------------------------------------------
-- select count(*) from information_schema.columns
-- where table_schema = 'public' and table_name = 'vehiculo';            -- 14
-- select conname from pg_constraint
-- where conname in ('vehiculo_ubicacion_fkey', 'solicitud_vehiculo_vehiculo_fk',
--                   'traslado_interno_vehiculo_vehiculo_id_fkey');      -- 3 filas
-- select tgname from pg_trigger
-- where tgrelid = 'public.vehiculo'::regclass and not tgisinternal;     -- 4 filas
