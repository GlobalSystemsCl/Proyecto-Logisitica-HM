-- =============================================================================
-- Brecha 024 (punto 6) — FKs sin índice
-- =============================================================================
-- Índices para las FKs señaladas por el advisor de rendimiento que se usan en
-- los filtros de la app (listados por ejecutivo, jefe, logística, observaciones
-- por solicitud, reservas por vehículo y usuarios por sucursal).
-- Las otras FKs del advisor y el reemplazo de auth.uid() por (select auth.uid())
-- en las policies quedan pendientes: requieren la definición actual de cada
-- policy (ver respaldo) y se harán en una migración aparte.
--
-- Rollback: supabase/rollback/20261007120500_brecha_024_indices_fk.sql
-- =============================================================================

create index if not exists idx_solicitud_ejecutivo_id   on public.solicitud (ejecutivo_id);
create index if not exists idx_solicitud_jefe_local_id  on public.solicitud (jefe_local_id);
create index if not exists idx_solicitud_logistica_id   on public.solicitud (logistica_id);
create index if not exists idx_observacion_solicitud_id on public.observacion (solicitud_id);
create index if not exists idx_sv_vehiculo_id           on public.solicitud_vehiculo (vehiculo_id);
create index if not exists idx_usuario_sucursal_id      on public.usuario (sucursal_id);
