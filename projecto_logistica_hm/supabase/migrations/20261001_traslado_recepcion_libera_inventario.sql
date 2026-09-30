-- =============================================================================
-- Migración: 20261001_traslado_recepcion_libera_inventario.sql
-- El traslado interno es SOLO movimiento de inventario (semántica de estados).
-- -----------------------------------------------------------------------------
-- Decisión (2026-10-01, usuario):
--   Los traslados solo se hacen con vehículos en estado `liberado`. Al crear el
--   traslado, la fila de `traslado_interno_vehiculo` queda `reservado` y, cuando
--   el jefe de local RECEPCIONA en destino, vuelve a `liberado` (puede volver a
--   tomar una solicitud).
--
--   El estado `vendido` es EXCLUSIVO del flujo de solicitudes de ejecutivos
--   (se marca al entregar el vehículo al cliente); los traslados jamás marcan
--   venta.
--
-- Cambio:
--   `fn_recibir_traslado_vehiculos`: al recepcionar, la fila del traslado pasa
--   de `reservado` a `liberado` (antes quedaba `vendido`). Se mantiene el alta
--   física en el destino (`vehiculo.ubicacion`) y el recount informativo de
--   slots. NO se toca `solicitud_vehiculo`.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.fn_recibir_traslado_vehiculos()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.estado <> 'recepcionado' OR OLD.estado IS NOT DISTINCT FROM NEW.estado THEN
    RETURN NEW;
  END IF;

  -- el registro del traslado deja de estar 'reservado': el vehículo vuelve a
  -- estar 'liberado' en destino y puede tomar una nueva solicitud
  UPDATE public.traslado_interno_vehiculo
     SET disponibilidad = 'liberado'
   WHERE traslado_id = NEW.id AND disponibilidad = 'reservado';

  -- el vehículo pasa a estar físicamente en el destino
  -- (NO se toca public.solicitud_vehiculo: los traslados no marcan venta)
  UPDATE public.vehiculo v
     SET ubicacion = NEW.destino_id
    FROM public.traslado_interno_vehiculo tv
   WHERE tv.traslado_id = NEW.id
     AND tv.vehiculo_id = v.id;

  -- recalcula el conteo informativo de slots del destino (sin validar capacidad)
  PERFORM public.fn_recalcular_slots_ocupados(NEW.destino_id);

  RETURN NEW;
END;
$$;

COMMENT ON TRIGGER tr_recibir_traslado_vehiculos ON public.traslado_interno IS
  'Recepción de traslado: el vehículo vuelve a quedar liberado en el destino (movimiento de inventario).';