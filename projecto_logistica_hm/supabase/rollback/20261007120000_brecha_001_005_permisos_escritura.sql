-- =============================================================================
-- ROLLBACK de 20261007120000_brecha_001_005_permisos_escritura.sql
-- =============================================================================
-- ADVERTENCIA: revertir reabre las brechas 001 (escalamiento a administrador)
-- y 005 (escritura directa en solicitud, solicitud_vehiculo y vehiculo).
-- Usar solo si la migración rompe un flujo y mientras se corrige.
--
-- Las policies originales (USING / WITH CHECK y roles) deben restaurarse a
-- partir de la consulta 1 de supabase/scripts/00_respaldo_antes_de_migrar.sql.
-- =============================================================================

begin;

drop trigger if exists tr_proteger_columnas_usuario on public.usuario;
drop function if exists public.fn_proteger_columnas_usuario();

-- Privilegios por defecto de Supabase antes de la migración
grant all on all tables in schema public to anon, authenticated;
grant all on all sequences in schema public to anon, authenticated;

alter default privileges for role postgres in schema public
  grant all on tables to anon, authenticated;
alter default privileges for role postgres in schema public
  grant all on sequences to anon, authenticated;

-- Policies: restaurar desde el respaldo. Valores registrados en la auditoría:
-- alter policy "Administradores pueden actualizar usuarios" on public.usuario
--   to public using (public.es_administrador() or auth.uid() = id);
-- (el WITH CHECK original era NULL: para quitarlo hay que recrear la policy)
-- alter policy solicitud_update_participantes on public.solicitud
--   using (<qual original del respaldo>) with check (public.usuario_activo());

commit;
