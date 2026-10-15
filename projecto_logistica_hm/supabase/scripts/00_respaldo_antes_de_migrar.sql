-- =============================================================================
-- RESPALDO PREVIO A LAS MIGRACIONES DE LA AUDITORÍA 2026-10-07
-- =============================================================================
-- Ejecutar en el SQL Editor de Supabase (producción) ANTES de aplicar cualquier
-- archivo de supabase/migrations/20261007*. Solo lectura: no modifica nada.
--
-- Guardar el resultado de cada consulta (botón "Download CSV" o copiar) en
-- auditoria/respaldos/2026-10-07/ fuera del repositorio público si contiene
-- datos sensibles. Es la base para los scripts de supabase/rollback/.
--
-- Además, hacer un respaldo completo con la CLI (requiere la contraseña de BD):
--   supabase db dump --linked -f respaldo_esquema_2026-10-07.sql
--   supabase db dump --linked --data-only -f respaldo_datos_2026-10-07.sql
-- =============================================================================

-- 1. Policies RLS (public y storage)
select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies
where schemaname in ('public', 'storage')
order by tablename, policyname;

-- 2. Definición completa de todas las funciones de public
select p.oid::regprocedure as firma,
       p.prosecdef as security_definer,
       p.proconfig as config,
       pg_get_functiondef(p.oid) as definicion
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
order by 1;

-- 3. Triggers (public y auth.users)
select event_object_schema, event_object_table, trigger_name, action_timing,
       event_manipulation, action_statement
from information_schema.triggers
where event_object_schema in ('public', 'auth')
order by 1, 2, 3;

-- 4. Privilegios de tablas para anon y authenticated
select table_name, grantee, string_agg(privilege_type, ', ' order by privilege_type) as privilegios
from information_schema.role_table_grants
where table_schema = 'public' and grantee in ('anon', 'authenticated')
group by table_name, grantee
order by table_name, grantee;

-- 5. Privilegios EXECUTE de funciones
select p.oid::regprocedure as firma, a.grantee::regrole as rol, a.privilege_type
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
where n.nspname = 'public'
order by 1, 2;

-- 6. Constraints de FK (para revertir la brecha 016)
select conrelid::regclass as tabla, conname, pg_get_constraintdef(oid) as definicion
from pg_constraint
where contype = 'f' and connamespace = 'public'::regnamespace
order by 1, 2;

-- 7. Columnas de usuario (confirmar que `aprobado` todavía no existe)
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'usuario'
order by ordinal_position;

-- 8. Estado de usuarios (para la auditoría post-incidente de la brecha 001)
select id, email, rol, activo, created_at, updated_at
from public.usuario
order by created_at;
