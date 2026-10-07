-- =============================================================================
-- ROLLBACK de 20261007120100_brecha_002_003_025_registro_y_aprobacion.sql
-- =============================================================================
-- ADVERTENCIA: revertir reabre la brecha 002 (cualquiera puede registrarse
-- como administrador). El código de la app desde esta versión escribe
-- `usuario.aprobado`: si se elimina la columna, el registro, la creación y la
-- aprobación de usuarios vuelven a fallar (brecha 003). Revertir también el
-- código o, preferiblemente, revertir solo el trigger (paso 2) y conservar la
-- columna.
-- =============================================================================

begin;

-- 1. Trigger: restaurar la definición original desde la consulta 2 de
--    supabase/scripts/00_respaldo_antes_de_migrar.sql (pg_get_functiondef de
--    public.handle_new_auth_user). Pegar aquí el CREATE OR REPLACE FUNCTION.

-- 2. Restricción e invariante
alter table public.usuario drop constraint if exists usuario_no_aprobado_inactivo;

-- 3. Columna (solo si también se revierte el código)
-- alter table public.usuario drop column if exists aprobado;

commit;
