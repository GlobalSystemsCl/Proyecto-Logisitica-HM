-- =============================================================================
-- Rollback de 20261112140000_reserva_incluye_recepcionada.sql
-- =============================================================================
-- Quita el trigger que impide trasladar vehículos reservados o vendidos.
-- `fn_validar_reserva_unica_vehiculo` se deja como está: ya bloqueaba
-- `entregada` en producción antes de esta migración, así que volver a la
-- versión del repo (sin `entregada`) reabriría el bug #1.
-- =============================================================================

begin;

drop trigger if exists tr_validar_vehiculo_trasladable on public.traslado_interno_vehiculo;
drop function if exists public.fn_validar_vehiculo_trasladable();

-- fn_vehiculos_disponibles_traslado: para volver a la versión anterior,
-- ejecutar de nuevo la sección de la función de
-- migrations/20261020120000_fn_vehiculos_disponibles_traslado.sql.

commit;
