-- =============================================================================
-- Brecha 014 — Funciones SECURITY DEFINER expuestas y search_path mutable
-- =============================================================================
-- 1. Funciones de trigger / event trigger: nadie fuera del servidor necesita
--    EXECUTE (Postgres las invoca sin revisar ese privilegio).
-- 2. anon: sin EXECUTE en ninguna función de public (no tiene acceso a tablas,
--    así que ninguna policy necesita evaluarse para anon).
-- 3. authenticated conserva EXECUTE en las funciones normales porque las
--    policies RLS llaman a tiene_rol, usuario_activo, es_administrador y
--    usuario_tiene_sucursal.
-- 4. search_path fijo (public, pg_temp) en todas las funciones de public que
--    no lo tengan. Se usa `public, pg_temp` y no '' para no tener que calificar
--    los nombres dentro de cada cuerpo (no se dispone de su código en el repo).
--
-- Se trabaja por catálogo (pg_proc) porque las firmas exactas no están
-- versionadas (brecha 015).
--
-- Rollback: supabase/rollback/20261007120200_brecha_014_funciones_security_definer.sql
-- =============================================================================

begin;

do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as firma,
           t.typname as retorno,
           p.proconfig as config
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    join pg_type t on t.oid = p.prorettype
    where n.nspname = 'public'
      and p.prokind = 'f'
      -- funciones que pertenecen a extensiones se dejan intactas
      and not exists (
        select 1 from pg_depend d
        where d.objid = p.oid and d.deptype = 'e'
      )
  loop
    -- anon y PUBLIC: nunca
    execute format('revoke execute on function %s from public, anon', f.firma);

    if f.retorno in ('trigger', 'event_trigger') then
      execute format('revoke execute on function %s from authenticated', f.firma);
    else
      execute format('grant execute on function %s to authenticated', f.firma);
    end if;

    execute format('grant execute on function %s to service_role', f.firma);

    if f.config is null
       or not exists (select 1 from unnest(f.config) c where c like 'search_path=%') then
      execute format('alter function %s set search_path = public, pg_temp', f.firma);
    end if;
  end loop;
end;
$$;

-- Funciones nuevas: sin EXECUTE para PUBLIC/anon por defecto.
alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon;

commit;

-- -----------------------------------------------------------------------------
-- Pendiente (requiere el cuerpo actual de las funciones, ver respaldo):
--   * usuario_tiene_sucursal(p_usuario_id, p_sucursal_id) sigue permitiendo a un
--     usuario autenticado consultar asignaciones de otro usuario. Corregir con
--     una versión pública que use auth.uid() y otra interna para las policies.
--   * es_administrador, tiene_rol y usuario_activo tratan activo NULL como true
--     (COALESCE(v_activo, true)). Cambiar a COALESCE(v_activo, false).
-- -----------------------------------------------------------------------------
