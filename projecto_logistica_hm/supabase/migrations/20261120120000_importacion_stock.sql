-- =============================================================================
-- Registro de importaciones de stock y reversión (2026-11-20)
-- =============================================================================
-- "Importar Stock" (admin/vehículos) inserta vehículos nuevos desde un Excel;
-- los chasis repetidos se omiten y nunca se modifican. Si se sube un archivo
-- por error, hay que poder deshacerlo: borrar exactamente lo que insertó.
--
--   1. `importacion_stock`: una fila por importación (quién, qué archivo,
--      cuántos) y, si se revirtió, cuándo, quién y cuántos se borraron.
--   2. `vehiculo.importacion_id`: la importación que creó el vehículo (null en
--      los creados a mano o antes de esta migración).
--   3. `fn_revertir_importacion_stock`: en una sola transacción borra los
--      vehículos de la importación que no se usan en ninguna solicitud ni
--      traslado (ni siquiera cerrados: son historial) y marca la importación
--      como revertida. Los que se usan se conservan y se informan.
--      Los triggers por sentencia de `vehiculo` recalculan los slots.
--
-- Solo acceso con la clave de servicio (la app escribe con service_role).
-- Transaccional. Rollback: rollback/20261120120000_importacion_stock.sql
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1. Registro de importaciones
-- -----------------------------------------------------------------------------
create table if not exists public.importacion_stock (
  id                    uuid primary key default gen_random_uuid(),
  usuario_id            uuid,
  archivo               text,
  total                 integer not null default 0,
  importados            integer not null default 0,
  duplicados            integer not null default 0,
  errores               integer not null default 0,
  created_at            timestamptz not null default now(),
  revertida_at          timestamptz,
  revertida_por         uuid,
  vehiculos_eliminados  integer,
  vehiculos_conservados integer,
  constraint importacion_stock_usuario_fkey foreign key (usuario_id)
    references public.usuario (id) on delete set null,
  constraint importacion_stock_revertida_por_fkey foreign key (revertida_por)
    references public.usuario (id) on delete set null
);

create index if not exists importacion_stock_created_idx on public.importacion_stock (created_at desc);

alter table public.importacion_stock enable row level security;
revoke all on table public.importacion_stock from anon, authenticated;

comment on table public.importacion_stock is
  'Importaciones de stock (admin/vehículos) y su reversión. Solo acceso con la clave de servicio.';

-- -----------------------------------------------------------------------------
-- 2. Importación que creó cada vehículo
-- -----------------------------------------------------------------------------
alter table public.vehiculo add column if not exists importacion_id uuid;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'vehiculo_importacion_fkey') then
    alter table public.vehiculo add constraint vehiculo_importacion_fkey foreign key (importacion_id)
      references public.importacion_stock (id) on delete set null;
  end if;
end $$;

create index if not exists vehiculo_importacion_idx on public.vehiculo (importacion_id)
  where importacion_id is not null;

-- -----------------------------------------------------------------------------
-- 3. Reversión
-- -----------------------------------------------------------------------------
create or replace function public.fn_revertir_importacion_stock(p_importacion_id uuid, p_usuario_id uuid)
returns table (eliminados integer, conservados integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_revertida timestamptz;
  v_eliminados integer;
  v_conservados integer;
begin
  -- Bloquea la fila: dos reversiones simultáneas no pueden pasar las dos.
  select revertida_at into v_revertida
  from public.importacion_stock
  where id = p_importacion_id
  for update;

  if not found then
    raise exception 'IMPORTACION_NO_EXISTE';
  end if;
  if v_revertida is not null then
    raise exception 'IMPORTACION_YA_REVERTIDA';
  end if;

  with borrados as (
    delete from public.vehiculo v
    where v.importacion_id = p_importacion_id
      and not exists (select 1 from public.solicitud_vehiculo sv where sv.vehiculo_id = v.id)
      and not exists (select 1 from public.traslado_interno_vehiculo tv where tv.vehiculo_id = v.id)
    returning v.id
  )
  select count(*)::integer into v_eliminados from borrados;

  select count(*)::integer into v_conservados
  from public.vehiculo
  where importacion_id = p_importacion_id;

  update public.importacion_stock
  set revertida_at = now(),
      revertida_por = p_usuario_id,
      vehiculos_eliminados = v_eliminados,
      vehiculos_conservados = v_conservados
  where id = p_importacion_id;

  return query select v_eliminados, v_conservados;
end;
$$;

revoke all on function public.fn_revertir_importacion_stock(uuid, uuid) from public, anon, authenticated;
grant execute on function public.fn_revertir_importacion_stock(uuid, uuid) to service_role;

commit;

-- -----------------------------------------------------------------------------
-- Verificación posterior (ejecutar por separado)
-- -----------------------------------------------------------------------------
-- select column_name from information_schema.columns
--   where table_name = 'vehiculo' and column_name = 'importacion_id';      -- 1 fila
-- select count(*) from public.importacion_stock;                           -- 0 al aplicar
