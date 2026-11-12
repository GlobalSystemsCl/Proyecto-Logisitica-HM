-- =============================================================================
-- Rollback de 20261112120000_notificaciones_completas.sql
-- =============================================================================
-- Elimina el registro de correos. La app sigue enviando, sin topes (lo deja en
-- el log).
--
-- Postgres no permite quitar un valor de un enum sin recrear el tipo. Los
-- valores nuevos de tipo_notificacion quedan y no afectan a nada si la app
-- deja de usarlos. Para borrar las notificaciones ya creadas con ellos:
-- =============================================================================

begin;

drop table if exists public.correo_envio;

delete from public.notificacion
where tipo in ('SOLICITUD_INSISTENCIA', 'TRASLADO_INTERNO_CREADO', 'TRASLADO_INTERNO_EN_TRANSITO', 'TRASLADO_INTERNO_RECEPCIONADO');

commit;
