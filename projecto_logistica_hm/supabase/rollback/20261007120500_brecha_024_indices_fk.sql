-- ROLLBACK de 20261007120500_brecha_024_indices_fk.sql
drop index if exists public.idx_solicitud_ejecutivo_id;
drop index if exists public.idx_solicitud_jefe_local_id;
drop index if exists public.idx_solicitud_logistica_id;
drop index if exists public.idx_observacion_solicitud_id;
drop index if exists public.idx_sv_vehiculo_id;
drop index if exists public.idx_usuario_sucursal_id;
