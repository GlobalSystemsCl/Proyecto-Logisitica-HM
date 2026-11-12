-- =============================================================================
-- Rollback de 20261112130000_ausencias_logistica.sql
-- =============================================================================
-- Antes, terminar las ausencias activas desde la app ("Terminar ahora"): así
-- vuelven las solicitudes al titular, se reactiva su cuenta y se quitan las
-- zonas temporales. Este rollback borra las zonas temporales que queden, la
-- columna usuario_zona.ausencia_id y las tablas de ausencias. Desplegar antes
-- el código anterior.
-- =============================================================================

begin;

delete from public.usuario_zona where ausencia_id is not null;
drop index if exists public.usuario_zona_ausencia_idx;
alter table public.usuario_zona drop column if exists ausencia_id;
drop table if exists public.ausencia_traspaso;
drop table if exists public.ausencia_usuario;

commit;
