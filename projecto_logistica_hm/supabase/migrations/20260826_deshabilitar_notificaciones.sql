-- Migracion: Deshabilitar notificaciones (fuera de alcance actual)
-- Fecha: 2026-08-26
-- Descripcion: Desactiva los triggers que generan notificaciones automaticamente
-- al crear/actualizar solicitudes, reservar vehiculos y agregar observaciones.
--
-- Motivo: el modulo de notificaciones todavia no esta contemplado y los triggers
-- violan la restriccion NOT NULL de `notificacion.usuario_id` cuando el destinatario
-- (jefe_local de la sucursal o ejecutivo de la solicitud) aun no esta asignado.
--
-- Reversible: las funciones notificar_* se conservan; basta recrear los triggers
-- cuando se incorpore el modulo de notificaciones.

DROP TRIGGER IF EXISTS trigger_notificacion_solicitud
  ON public.solicitud;

DROP TRIGGER IF EXISTS trigger_notificacion_solicitud_vehiculo
  ON public.solicitud_vehiculo;

DROP TRIGGER IF EXISTS trigger_notificacion_observacion
  ON public.observacion;