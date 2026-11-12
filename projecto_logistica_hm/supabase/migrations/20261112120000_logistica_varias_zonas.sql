-- =============================================================================
-- Logística con varias zonas (R3, 2026-11-12)
-- =============================================================================
-- Pedido del cliente: un usuario de Logística puede atender más de una zona.
-- La migración 20261013155000 (punto D) limitó a una zona por usuario con el
-- índice único usuario_zona_una_por_usuario. Esta migración lo quita.
--
-- Se mantiene la clave primaria (usuario_id, zona_id): un usuario no puede
-- tener la misma zona dos veces. Las lecturas (alcance de Logística,
-- notificaciones por zona, RLS) ya trabajan con listas de zonas.
--
-- Rollback: supabase/rollback/20261112120000_logistica_varias_zonas.sql
-- =============================================================================

begin;

drop index if exists public.usuario_zona_una_por_usuario;

commit;

-- -----------------------------------------------------------------------------
-- Verificación posterior (ejecutar por separado)
-- -----------------------------------------------------------------------------
-- select indexname from pg_indexes where tablename = 'usuario_zona';
--   -> usuario_zona_pkey e idx_usuario_zona_zona; ya no usuario_zona_una_por_usuario
