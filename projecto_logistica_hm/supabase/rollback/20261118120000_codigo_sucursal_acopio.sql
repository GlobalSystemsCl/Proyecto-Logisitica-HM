-- =============================================================================
-- Rollback de 20261118120000_codigo_sucursal_acopio.sql
-- =============================================================================
-- Antes, desplegar una versión de la app que no lea `sucursal.codigo` ni
-- `solicitud.codigo_sucursal`. Las sucursales de acopio (119B y 120B) solo se
-- borran si no tienen vehículos, usuarios ni solicitudes; si los tienen, el
-- rollback se detiene: moverlos antes.
-- =============================================================================

begin;

delete from public.sucursal where codigo in ('119B', '120B');

-- Trigger de numeración como en 20261024120000 (sin codigo_sucursal).
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
      return new;
    end if;
    if old.sucursal is not null
       and not exists (select 1 from public.sucursal where id = old.sucursal) then
      new.numero := old.numero;
      return new;
    end if;
  end if;

  if new.sucursal is null then
    new.numero := null;
    return new;
  end if;

  update public.sucursal
  set ultimo_numero_solicitud = ultimo_numero_solicitud + 1
  where id = new.sucursal
  returning ultimo_numero_solicitud into new.numero;

  return new;
end;
$$;

revoke execute on function public.fn_asignar_numero_solicitud() from public, anon, authenticated;

drop trigger if exists tr_asignar_numero_solicitud on public.solicitud;
create trigger tr_asignar_numero_solicitud
  before insert or update of sucursal, numero on public.solicitud
  for each row execute function public.fn_asignar_numero_solicitud();

alter table public.solicitud drop column if exists codigo_sucursal;

drop trigger if exists tr_codigo_sucursal on public.sucursal;
drop function if exists public.fn_codigo_sucursal();
alter table public.sucursal drop constraint if exists sucursal_codigo_unico;
alter table public.sucursal drop column if exists codigo;

commit;
