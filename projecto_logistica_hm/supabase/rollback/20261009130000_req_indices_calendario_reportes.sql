-- ROLLBACK de 20261009130000_req_indices_calendario_reportes.sql
drop index if exists public.idx_solicitud_fecha_tentativa_despacho;
drop index if exists public.idx_solicitud_estado;
drop index if exists public.idx_auditoria_entidad_accion;
