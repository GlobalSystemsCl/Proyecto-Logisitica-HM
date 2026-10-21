-- =============================================================================
-- Notificación al administrador cuando se registra un usuario nuevo (fase F)
-- =============================================================================
-- Quien se registra en /registro queda pendiente de aprobación. Desde ahora,
-- los administradores activos reciben una notificación en la campana (sin
-- correo) para activar la cuenta. Es la única notificación que recibe el
-- administrador: no participa del flujo de solicitudes (decisión 2026-10-20).
--
-- Qué hace:
--   1. Agrega 'NUEVO_USUARIO' al enum tipo_notificacion.
--
-- La fila usa entidad = 'usuario' y entidad_id = id del usuario registrado,
-- que también va como emisor_id. La columna entidad es varchar sin check, así
-- que no requiere cambios. La app (NotificacionService.notificarNuevoUsuario)
-- inserta con service_role; la RLS de lectura no cambia.
--
-- ADD VALUE va fuera de una transacción explícita (no se puede usar el valor
-- nuevo en la misma transacción que lo agrega).
--
-- Rollback: supabase/rollback/20261020140000_notificacion_nuevo_usuario.sql
-- =============================================================================

alter type public.tipo_notificacion add value if not exists 'NUEVO_USUARIO';

-- =============================================================================
-- Verificación posterior (solo lectura)
-- =============================================================================
-- select 'NUEVO_USUARIO' = any(enum_range(null::public.tipo_notificacion)::text[]);  -> true
