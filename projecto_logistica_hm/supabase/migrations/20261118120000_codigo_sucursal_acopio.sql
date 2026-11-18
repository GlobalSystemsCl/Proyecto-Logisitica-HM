-- =============================================================================
-- Código visible de sucursal (número + letra) y sucursales de acopio
-- (2026-11-18)
-- =============================================================================
-- Hasta ahora el código de una sucursal era su `id` (101, 119…). Lonquén y
-- Torquemada tienen un acopio que comparte su número: las sucursales actuales
-- pasan a 119A / 120A y los acopios nuevos son 119B / 120B. Como `id` es
-- numérico y no se puede repetir, el código visible pasa a una columna propia.
--
--   1. `sucursal.codigo` (texto, único, no nulo). Por defecto el id ("101");
--      119 → "119A" y 120 → "120A". Un trigger lo completa con el id al
--      insertar si no viene.
--   2. Sucursales nuevas "LONQUEN ACOPIO-SANTIAGO" (119B) y
--      "TORQUEMADA ACOPIO-VIÑA DEL MAR" (120B), con la zona, dirección y slots
--      de su sucursal madre y sin jefe de local. Su `id` lo da la secuencia.
--   3. `solicitud.codigo_sucursal`: copia del código de la sucursal al crear
--      la solicitud, para armar "119A-5" sin otra consulta. Lo asigna el
--      trigger de numeración y no cambia después (igual que `numero`).
--
-- Transaccional. Rollback: rollback/20261118120000_codigo_sucursal_acopio.sql
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1. Código de sucursal
-- -----------------------------------------------------------------------------
alter table public.sucursal add column if not exists codigo text;

update public.sucursal set codigo = id::text where codigo is null;
update public.sucursal set codigo = id::text || 'A' where id in (119, 120) and codigo = id::text;

alter table public.sucursal alter column codigo set not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'sucursal_codigo_unico') then
    alter table public.sucursal add constraint sucursal_codigo_unico unique (codigo);
  end if;
end $$;

create or replace function public.fn_codigo_sucursal()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.codigo := upper(nullif(trim(coalesce(new.codigo, '')), ''));
  if new.codigo is null then
    new.codigo := new.id::text;
  end if;
  return new;
end;
$$;

revoke execute on function public.fn_codigo_sucursal() from public, anon, authenticated;

drop trigger if exists tr_codigo_sucursal on public.sucursal;
create trigger tr_codigo_sucursal
  before insert or update of codigo on public.sucursal
  for each row execute function public.fn_codigo_sucursal();

-- -----------------------------------------------------------------------------
-- 2. Sucursales de acopio (solo si existe la sucursal madre)
-- -----------------------------------------------------------------------------
insert into public.sucursal (nombre, direccion, slots, zona_id, codigo)
select 'LONQUEN ACOPIO-SANTIAGO', s.direccion, s.slots, s.zona_id, '119B'
from public.sucursal s
where s.id = 119
  and not exists (select 1 from public.sucursal where codigo = '119B');

insert into public.sucursal (nombre, direccion, slots, zona_id, codigo)
select 'TORQUEMADA ACOPIO-VIÑA DEL MAR', s.direccion, s.slots, s.zona_id, '120B'
from public.sucursal s
where s.id = 120
  and not exists (select 1 from public.sucursal where codigo = '120B');

-- -----------------------------------------------------------------------------
-- 3. Código de sucursal en la solicitud
-- -----------------------------------------------------------------------------
alter table public.solicitud add column if not exists codigo_sucursal text;

update public.solicitud s
set codigo_sucursal = su.codigo
from public.sucursal su
where su.id = s.sucursal
  and s.codigo_sucursal is distinct from su.codigo;

create or replace function public.fn_asignar_numero_solicitud()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'UPDATE' then
    if new.sucursal is not distinct from old.sucursal then
      new.numero := old.numero;
      new.codigo_sucursal := old.codigo_sucursal;
      return new;
    end if;
    -- ON UPDATE CASCADE de sucursal.id: la sucursal antigua ya no existe y el
    -- contador se fue con la fila renombrada; el número sigue siendo válido.
    if old.sucursal is not null
       and not exists (select 1 from public.sucursal where id = old.sucursal) then
      new.numero := old.numero;
      new.codigo_sucursal := old.codigo_sucursal;
      return new;
    end if;
  end if;

  if new.sucursal is null then
    new.numero := null;
    new.codigo_sucursal := null;
    return new;
  end if;

  update public.sucursal
  set ultimo_numero_solicitud = ultimo_numero_solicitud + 1
  where id = new.sucursal
  returning ultimo_numero_solicitud, codigo into new.numero, new.codigo_sucursal;

  return new;
end;
$$;

revoke execute on function public.fn_asignar_numero_solicitud() from public, anon, authenticated;

drop trigger if exists tr_asignar_numero_solicitud on public.solicitud;
create trigger tr_asignar_numero_solicitud
  before insert or update of sucursal, numero, codigo_sucursal on public.solicitud
  for each row execute function public.fn_asignar_numero_solicitud();

commit;

-- Verificación (solo lectura):
--   select id, codigo, nombre from public.sucursal where codigo like '119%' or codigo like '120%';
--   -> 119 119A LONQUEN-SANTIAGO · 120 120A TORQUEMADA-… · <id> 119B LONQUEN ACOPIO-… · <id> 120B TORQUEMADA ACOPIO-…
--   select count(*) from public.solicitud where sucursal is not null and codigo_sucursal is null;  -> 0
