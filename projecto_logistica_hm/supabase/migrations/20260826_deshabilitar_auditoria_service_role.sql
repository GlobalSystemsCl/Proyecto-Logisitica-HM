-- Migracion: Deshabilitar triggers de auditoria automatica
-- Fecha: 2026-08-26
-- Descripcion: Desactiva los triggers que insertan en public.auditoria como efecto
-- colateral de INSERT/UPDATE en solicitud_vehiculo y de cambios de estado en solicitud.
--
-- Motivo: la aplicacion escribe con el cliente service-role (createAdminClient), por lo
-- que auth.uid() es NULL y los triggers SECURITY DEFINER violaban
-- `auditoria.usuario_id NOT NULL` (error 23502), abortando la reserva de vehiculos y
-- cualquier transicion de estado (aprobacion, rechazo, priorizacion, cancelacion).
--
-- Solucion: la auditoria se registra ahora desde la capa de servicios
-- (SolicitudesService.registrarAuditoria) con el usuario autenticado real,
-- no desde la base de datos.
--
-- Reversible: las funciones se conservan; basta recrear los triggers
-- cuando las escrituras se hagan con el cliente anonimo (auth.uid() presente).

DROP TRIGGER IF EXISTS trigger_auditoria_insert_disponibilidad
  ON public.solicitud_vehiculo;

DROP TRIGGER IF EXISTS trigger_auditoria_update_disponibilidad
  ON public.solicitud_vehiculo;

DROP TRIGGER IF EXISTS trigger_cambio_estado_auditoria
  ON public.solicitud;