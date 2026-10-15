-- =============================================================================
-- Brechas 002, 003 y 025 — Registro, aprobación de cuentas y email hardcodeado
-- =============================================================================
-- 002: handle_new_auth_user tomaba `rol` de raw_user_meta_data (dato que
--      controla quien se registra). Ahora todo perfil creado por el trigger es
--      'ejecutivo', inactivo y no aprobado. El rol real de los usuarios creados
--      por el administrador lo fija UsersService.createUser con service_role.
-- 003: la columna `aprobado` que usa el código no existía. Se crea y se marca
--      como aprobados a los usuarios existentes.
-- 025: se elimina el email del administrador principal del trigger.
--
-- Invariante nuevo (CHECK): una cuenta no aprobada nunca está activa. Así las
-- funciones de RLS que ya filtran por `activo` (usuario_activo, tiene_rol,
-- es_administrador) bloquean también a los no aprobados, sin reescribirlas.
--
-- Rollback: supabase/rollback/20261007120100_brecha_002_003_025_registro_y_aprobacion.sql
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1. Columna aprobado (brecha 003)
-- -----------------------------------------------------------------------------
alter table public.usuario
  add column if not exists aprobado boolean not null default false;

-- Los usuarios existentes ya operaban en el sistema: quedan aprobados.
update public.usuario set aprobado = true where aprobado is false;

alter table public.usuario
  drop constraint if exists usuario_no_aprobado_inactivo;
alter table public.usuario
  add constraint usuario_no_aprobado_inactivo check (aprobado or not activo);

comment on column public.usuario.aprobado is
  'Cuenta autorizada por un administrador. Mientras sea false, activo debe ser false (CHECK usuario_no_aprobado_inactivo).';

-- -----------------------------------------------------------------------------
-- 2. Trigger de alta de perfiles (brechas 002 y 025)
-- -----------------------------------------------------------------------------
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_nombre    text := nullif(btrim(new.raw_user_meta_data ->> 'nombre'), '');
  v_apellido  text := coalesce(btrim(new.raw_user_meta_data ->> 'apellido'), '');
  v_sucursal  bigint;
begin
  -- La sucursal informada en el registro solo se acepta si existe.
  begin
    v_sucursal := (new.raw_user_meta_data ->> 'sucursal_id')::bigint;
  exception when others then
    v_sucursal := null;
  end;
  if v_sucursal is not null
     and not exists (select 1 from public.sucursal s where s.id = v_sucursal) then
    v_sucursal := null;
  end if;

  -- Nunca se lee `rol`, `activo` ni `aprobado` de los metadatos del cliente.
  insert into public.usuario (
    id, email, nombre, apellido, rol, activo, aprobado,
    requiere_cambio_clave, intentos_fallidos, bloqueado_hasta, sucursal_id
  ) values (
    new.id, lower(new.email), coalesce(v_nombre, 'Usuario'), v_apellido,
    'ejecutivo', false, false,
    false, 0, null, v_sucursal
  )
  on conflict (id) do nothing;   -- no reactiva ni modifica perfiles existentes

  return new;
exception when others then
  -- No bloquear la creación en Auth, pero dejar rastro en los logs de Postgres.
  raise log 'handle_new_auth_user: no se pudo crear el perfil de % (%): %',
    new.id, new.email, sqlerrm;
  return new;
end;
$$;

revoke execute on function public.handle_new_auth_user() from public, anon, authenticated;

commit;

-- -----------------------------------------------------------------------------
-- Verificación posterior (ejecutar por separado)
-- -----------------------------------------------------------------------------
-- select count(*) filter (where aprobado) as aprobados,
--        count(*) filter (where not aprobado) as pendientes
-- from public.usuario;                         -- pendientes = 0 tras migrar
--
-- Auditoría post-incidente (brecha 002, paso 7): cuentas con rol elevado.
-- select u.id, u.email, u.rol, u.created_at, a.raw_user_meta_data ->> 'rol' as rol_en_metadatos
-- from public.usuario u join auth.users a on a.id = u.id
-- where u.rol <> 'ejecutivo'
-- order by u.created_at;
