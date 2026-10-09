-- =============================================================================
-- Requisitos R16 y R17 — Índices para el calendario y la reportería
-- =============================================================================
-- El calendario consulta por rango de `fecha_tentativa_despacho` y estado; la
-- reportería y el contador de reprogramaciones leen la auditoría por entidad
-- y acción. Solo crea índices: no cambia datos ni comportamiento.
--
-- Rollback: supabase/rollback/20261009130000_req_indices_calendario_reportes.sql
-- =============================================================================

create index if not exists idx_solicitud_fecha_tentativa_despacho
  on public.solicitud (fecha_tentativa_despacho);

create index if not exists idx_solicitud_estado
  on public.solicitud (estado);

create index if not exists idx_auditoria_entidad_accion
  on public.auditoria (entidad, accion, entidad_id);
