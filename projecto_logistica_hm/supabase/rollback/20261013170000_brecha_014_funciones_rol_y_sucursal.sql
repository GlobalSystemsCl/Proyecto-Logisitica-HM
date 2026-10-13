-- ROLLBACK de 20261013170000_brecha_014_funciones_rol_y_sucursal.sql
-- Restaura las funciones tal como estaban en producción el 2026-10-13
-- (activo NULL = activo; usuario_tiene_sucursal acepta cualquier usuario) y
-- vuelve a permitir NULL en usuario.activo. Reabre los puntos de la brecha 014.
begin;

alter table public.usuario alter column activo drop not null;

create or replace function public.es_administrador()
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_rol text;
    v_activo boolean;
begin
    select rol, activo into v_rol, v_activo
    from public.usuario
    where id = auth.uid();

    return (v_rol = 'administrador' and coalesce(v_activo, true) = true);
end;
$$;

create or replace function public.tiene_rol(variadic roles text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (
        select 1 from public.usuario
        where id = auth.uid()
          and coalesce(activo, true) = true
          and rol::text = any(roles)
    );
$$;

create or replace function public.usuario_activo()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (
        select 1 from public.usuario
        where id = auth.uid()
          and coalesce(activo, true) = true
    );
$$;

create or replace function public.usuario_tiene_sucursal(p_usuario_id uuid, p_sucursal_id bigint)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (
        select 1 from public.usuario u
        where u.id = p_usuario_id and u.sucursal_id = p_sucursal_id
        union all
        select 1 from public.sucursal s
        where s.id = p_sucursal_id and s.usuario_id = p_usuario_id
    );
$$;

commit;
