-- =============================================================================
-- Brechas 001 y 005 — Escritura directa por la API REST con la clave pública
-- =============================================================================
-- Contexto verificado en el código (2026-10-07):
--   * Ninguna parte de la app escribe con el cliente anon/authenticated. Todas
--     las escrituras pasan por service_role (createAdminClient).
--   * El cliente con sesión de usuario (createClient) solo LEE usuario,
--     sucursal y usuario_zona en AuthService.getCurrentUserProfile.
--   * src/lib/supabase/client.ts (navegador) no se importa en ningún archivo.
--
-- Por eso la corrección principal es de privilegios, no de policies: sin
-- INSERT/UPDATE/DELETE para anon y authenticated, PostgREST rechaza cualquier
-- escritura directa sin importar lo que digan las policies. Las policies se
-- endurecen además como defensa en profundidad.
--
-- Rollback: supabase/rollback/20261007120000_brecha_001_005_permisos_escritura.sql
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1. Privilegios de tablas
-- -----------------------------------------------------------------------------
-- anon: no necesita ninguna tabla (el registro y el login van por el servidor).
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;

-- authenticated: solo lectura (las policies SELECT siguen filtrando filas).
revoke insert, update, delete, truncate, references, trigger
  on all tables in schema public from authenticated;
revoke usage, update on all sequences in schema public from authenticated;

-- Que las tablas nuevas no vuelvan a nacer con escritura pública.
alter default privileges for role postgres in schema public
  revoke all on tables from anon;
alter default privileges for role postgres in schema public
  revoke insert, update, delete, truncate, references, trigger on tables from authenticated;
alter default privileges for role postgres in schema public
  revoke all on sequences from anon, authenticated;

-- -----------------------------------------------------------------------------
-- 2. Columnas sensibles de usuario (brecha 001, defensa en profundidad)
-- -----------------------------------------------------------------------------
-- Aunque alguien vuelva a conceder UPDATE a authenticated, un usuario no
-- administrador no podrá cambiar su rol, estado, bloqueo ni sucursal.
-- service_role (la app) no tiene auth.uid(), por lo que no se ve afectado.
create or replace function public.fn_proteger_columnas_usuario()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    return new;
  end if;

  if exists (
    select 1 from public.usuario u
    where u.id = auth.uid() and u.rol = 'administrador' and u.activo is true
  ) then
    return new;
  end if;

  if tg_op = 'INSERT' then
    raise exception 'No autorizado para crear perfiles de usuario.'
      using errcode = '42501';
  end if;

  if new.rol is distinct from old.rol
     or new.activo is distinct from old.activo
     or new.requiere_cambio_clave is distinct from old.requiere_cambio_clave
     or new.intentos_fallidos is distinct from old.intentos_fallidos
     or new.bloqueado_hasta is distinct from old.bloqueado_hasta
     or new.sucursal_id is distinct from old.sucursal_id
     or new.email is distinct from old.email
     or new.id is distinct from old.id then
    raise exception 'No autorizado para modificar campos protegidos del usuario.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke execute on function public.fn_proteger_columnas_usuario() from public, anon, authenticated;

drop trigger if exists tr_proteger_columnas_usuario on public.usuario;
create trigger tr_proteger_columnas_usuario
  before insert or update on public.usuario
  for each row execute function public.fn_proteger_columnas_usuario();

-- -----------------------------------------------------------------------------
-- 3. Policies de escritura (defensa en profundidad)
-- -----------------------------------------------------------------------------
-- Se modifican solo si existen con el nombre registrado en la auditoría; si
-- alguna no existe se informa con NOTICE y la migración continúa (los
-- privilegios del paso 1 ya cierran la brecha).
do $$
declare
  r record;
begin
  -- usuario: UPDATE e INSERT solo para administradores
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'usuario'
             and policyname = 'Administradores pueden actualizar usuarios') then
    execute 'alter policy "Administradores pueden actualizar usuarios" on public.usuario
             to authenticated
             using (public.es_administrador())
             with check (public.es_administrador())';
  else
    raise notice 'Policy "Administradores pueden actualizar usuarios" no encontrada';
  end if;

  for r in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'usuario' and cmd = 'INSERT'
  loop
    execute format('alter policy %I on public.usuario to authenticated with check (public.es_administrador())',
                   r.policyname);
  end loop;

  -- solicitud: el WITH CHECK pasa a ser solo de administrador
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'solicitud'
             and policyname = 'solicitud_update_participantes') then
    execute 'alter policy solicitud_update_participantes on public.solicitud
             to authenticated
             using (public.es_administrador())
             with check (public.es_administrador())';
  else
    raise notice 'Policy solicitud_update_participantes no encontrada';
  end if;

  -- solicitud_vehiculo y vehiculo: escritura solo de administrador
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'solicitud_vehiculo'
             and policyname = 'sv_insert_logistica') then
    execute 'alter policy sv_insert_logistica on public.solicitud_vehiculo
             to authenticated with check (public.es_administrador())';
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'solicitud_vehiculo'
             and policyname = 'sv_update_logistica') then
    execute 'alter policy sv_update_logistica on public.solicitud_vehiculo
             to authenticated using (public.es_administrador()) with check (public.es_administrador())';
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'vehiculo'
             and policyname = 'vehiculo_update_gestores') then
    execute 'alter policy vehiculo_update_gestores on public.vehiculo
             to authenticated using (public.es_administrador()) with check (public.es_administrador())';
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'vehiculo'
             and policyname = 'vehiculo_insert_gestores') then
    execute 'alter policy vehiculo_insert_gestores on public.vehiculo
             to authenticated with check (public.es_administrador())';
  end if;

  -- Todas las policies de usuario dejan de aplicar al rol public (incluye anon)
  for r in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'usuario' and 'public' = any(roles)
  loop
    execute format('alter policy %I on public.usuario to authenticated', r.policyname);
  end loop;
end;
$$;

commit;

-- -----------------------------------------------------------------------------
-- Verificación posterior (ejecutar por separado)
-- -----------------------------------------------------------------------------
-- select table_name, grantee, string_agg(privilege_type, ', ')
-- from information_schema.role_table_grants
-- where table_schema = 'public' and grantee in ('anon', 'authenticated')
-- group by 1, 2 order by 1, 2;
--   -> anon: sin filas. authenticated: solo SELECT.
