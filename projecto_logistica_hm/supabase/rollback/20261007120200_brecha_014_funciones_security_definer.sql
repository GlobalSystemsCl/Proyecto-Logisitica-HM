-- =============================================================================
-- ROLLBACK de 20261007120200_brecha_014_funciones_security_definer.sql
-- =============================================================================
-- Restaura EXECUTE para PUBLIC, anon y authenticated en todas las funciones de
-- public. El search_path fijado no se revierte: es inocuo y revertirlo
-- reabriría el riesgo de secuestro. Si una función concreta falla por el
-- search_path, quitarlo solo en ella:
--   alter function public.<nombre>(<args>) reset search_path;
-- =============================================================================

begin;

do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as firma
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind = 'f'
      and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
  loop
    execute format('grant execute on function %s to public, anon, authenticated', f.firma);
  end loop;
end;
$$;

alter default privileges for role postgres in schema public
  grant execute on functions to public, anon;

commit;
