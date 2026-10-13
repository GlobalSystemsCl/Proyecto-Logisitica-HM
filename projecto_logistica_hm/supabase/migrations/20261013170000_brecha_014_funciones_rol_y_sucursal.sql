-- =============================================================================
-- Brecha 014 (puntos pendientes) — Funciones de rol y de sucursal
-- =============================================================================
-- 1. es_administrador(), tiene_rol() y usuario_activo() trataban activo NULL
--    como activo (COALESCE(activo, true)). Sostienen casi todas las policies
--    RLS. Además, el CHECK usuario_no_aprobado_inactivo (aprobado OR NOT activo)
--    no se cumple ni se viola con activo NULL, así que una cuenta no aprobada con
--    activo NULL habría pasado por activa. Ahora solo cuenta activo = true, y la
--    columna pasa a NOT NULL (verificado el 2026-10-13: 0 filas con NULL; todas
--    las escrituras de la app usan un booleano explícito; default true).
--
-- 2. usuario_tiene_sucursal(p_usuario_id, p_sucursal_id) aceptaba cualquier
--    usuario: un usuario autenticado podía consultar por RPC las sucursales de
--    otro. Se conserva la firma (la usan 6 policies con auth.uid() y la app con
--    service_role), pero un usuario con sesión solo puede consultar las suyas.
--    service_role (sin auth.uid()) sigue consultando cualquiera.
--
-- Definiciones de partida: las de producción del 2026-10-13.
-- Rollback: supabase/rollback/20261013170000_brecha_014_funciones_rol_y_sucursal.sql
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1. activo obligatorio y funciones de rol estrictas
-- -----------------------------------------------------------------------------
update public.usuario set activo = false where activo is null;
alter table public.usuario alter column activo set not null;

create or replace function public.es_administrador()
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_rol    text;
  v_activo boolean;
begin
  select rol, activo into v_rol, v_activo
  from public.usuario
  where id = auth.uid();

  return (v_rol = 'administrador' and coalesce(v_activo, false));
end;
$$;

create or replace function public.tiene_rol(variadic roles text[])
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.usuario
    where id = auth.uid()
      and activo is true
      and rol::text = any(roles)
  );
$$;

create or replace function public.usuario_activo()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.usuario
    where id = auth.uid()
      and activo is true
  );
$$;

-- -----------------------------------------------------------------------------
-- 2. usuario_tiene_sucursal: con sesión, solo las propias
-- -----------------------------------------------------------------------------
create or replace function public.usuario_tiene_sucursal(p_usuario_id uuid, p_sucursal_id bigint)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case
    -- Un usuario con sesión no puede sondear las asignaciones de otro.
    when auth.uid() is not null and p_usuario_id is distinct from auth.uid() then false
    else exists (
      select 1 from public.usuario u
      where u.id = p_usuario_id and u.sucursal_id = p_sucursal_id
      union all
      select 1 from public.sucursal s
      where s.id = p_sucursal_id and s.usuario_id = p_usuario_id
    )
  end;
$$;

commit;

-- -----------------------------------------------------------------------------
-- Verificación posterior (ejecutar por separado)
-- -----------------------------------------------------------------------------
-- 1. Ninguna función de rol trata NULL como activo:
--    select proname from pg_proc
--    where proname in ('es_administrador', 'tiene_rol', 'usuario_activo')
--      and pg_get_functiondef(oid) ilike '%, true)%';            -> 0 filas
-- 2. La columna es obligatoria:
--    select is_nullable from information_schema.columns
--    where table_schema = 'public' and table_name = 'usuario' and column_name = 'activo';  -> NO
-- 3. Iniciar sesión con un usuario de cada rol y navegar a su módulo (las
--    policies dependen de estas funciones).
