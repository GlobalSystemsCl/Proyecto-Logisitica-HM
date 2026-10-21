-- =============================================================================
-- Rollback de 20261020140000_notificacion_nuevo_usuario.sql
-- =============================================================================
-- Postgres no permite quitar un valor de un enum sin recrear el tipo. El valor
-- 'NUEVO_USUARIO' queda y no afecta a nada si la app deja de usarlo.
--
-- Para borrar las notificaciones de usuarios nuevos ya creadas:
-- =============================================================================

begin;

delete from public.notificacion where tipo = 'NUEVO_USUARIO';

commit;
