-- =============================================================================
-- Migración: 20261002_restaurar_contadores_slots.sql
-- -----------------------------------------------------------------------------
-- Objetivo (aclaración 2026-10-01, usuario):
--   "Todo el sistema debe seguir igual que como estaba; lo único que ahora se
--   permite es que los slots se sobrepasen."
--
-- La migración 20260930 desactivó la VALIDACIÓN de capacidad (RAISE EXCEPTION) —
-- eso se mantiene — pero además eliminó de más la RESERVA de slots de traslados:
-- los contadores informativos (slots_reservados / slots_ocupados / "suma de
-- autos" del recount) deben volver a funcionar exactamente como antes.
--
-- Cambios de esta migración (idempotente y autosuficiente: no depende de si
-- 20260930/20261001 están aplicadas):
--   a) Re-ejecuta los DROPs de las validaciones que bloqueaban por capacidad
--      (traslados y solicitudes), por si no se aplicó 20260930.
--   b) fn_recalcular_slots_ocupados: recalcula el conteo real de la sucursal
--      SIN lanzar excepción (RAISE NOTICE informativo). No bloquea.
--   c) Restaura el contador de reserva de traslados (fn_reservar_slots_
--      traslado_vehiculo + trigger): al crear un traslado, destino suma
--      slots_reservados y slots_ocupados.
--   d) fn_recibir_traslado_vehiculos: vuelve a DECREMENTAR slots_reservados
--      del destino al recepcionar (como el original 20260928), pero la fila del
--      traslado pasa a 'liberado' (semántica de inventario, no de venta).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- a) Validaciones de capacidad: eliminadas (los slots son informativos)
-- -----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS tr_validar_slots_traslado_vehiculo       ON public.traslado_interno_vehiculo;
DROP TRIGGER IF EXISTS tr_validar_slots_traslado_vehiculo_after  ON public.traslado_interno_vehiculo;
DROP FUNCTION IF EXISTS public.fn_validar_slots_traslado_vehiculo();
DROP FUNCTION IF EXISTS public.fn_validar_slots_traslado_vehiculo_after();

DROP TRIGGER IF EXISTS tr_validar_slots_solicitud_vehiculo ON public.solicitud_vehiculo;
DROP FUNCTION IF EXISTS public.fn_validar_slots_solicitud_vehiculo();

-- -----------------------------------------------------------------------------
-- b) fn_recalcular_slots_ocupados: conteo real, SIN bloqueo por capacidad
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_recalcular_slots_ocupados(p_sucursal_id bigint)
RETURNS void AS $$
DECLARE
  v_ocupados bigint;
  v_slots    bigint;
BEGIN
  IF p_sucursal_id IS NULL THEN
    RETURN;
  END IF;

  SELECT
      (SELECT count(*) FROM public.vehiculo v WHERE v.ubicacion = p_sucursal_id)
    + (SELECT count(*)
         FROM public.solicitud_vehiculo sv
         JOIN public.solicitud sol ON sol.id = sv.solicitud_id
        WHERE sol.sucursal_destino = p_sucursal_id
          AND sv.disponibilidad = 'reservado'
          AND sol.estado IN ('pendiente_aprobacion','aprobada','pendiente',
                             'priorizada','asignada','calendarizada',
                             'despachada','en_transito'))
    INTO v_ocupados;

  SELECT slots INTO v_slots
  FROM public.sucursal
  WHERE id = p_sucursal_id;

  -- Informativo: ya NO valida ni bloquea la capacidad de la sucursal.
  IF v_slots IS NOT NULL AND v_ocupados > v_slots THEN
    RAISE NOTICE 'Sucursal % excede su capacidad: ocupados % > slots %',
      p_sucursal_id, v_ocupados, v_slots;
  END IF;

  UPDATE public.sucursal
  SET slots_ocupados = v_ocupados
  WHERE id = p_sucursal_id;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION public.fn_recalcular_slots_ocupados(bigint) IS
  'Recalcula slots_ocupados como dato informativo (sin validar capacidad; no bloquea)';

-- -----------------------------------------------------------------------------
-- c) Contador de reserva de traslados: RESTAURADO (igual que 20260928)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_reservar_slots_traslado_vehiculo()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_destino BIGINT;
BEGIN
  IF NEW.disponibilidad <> 'reservado' THEN
    RETURN NEW;
  END IF;

  SELECT t.destino_id INTO v_destino
  FROM public.traslado_interno t
  WHERE t.id = NEW.traslado_id;

  IF v_destino IS NULL THEN
    RETURN NEW;
  END IF;

  UPDATE public.sucursal
     SET slots_reservados = slots_reservados + 1,
         slots_ocupados   = slots_ocupados + 1
   WHERE id = v_destino;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_reservar_slots_traslado_vehiculo ON public.traslado_interno_vehiculo;
CREATE TRIGGER tr_reservar_slots_traslado_vehiculo
  AFTER INSERT ON public.traslado_interno_vehiculo
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_reservar_slots_traslado_vehiculo();

-- -----------------------------------------------------------------------------
-- d) Recepción de traslado: vuelve a liberar la reserva del destino
--    (fila del traslado -> 'liberado'; decremento de slots_reservados)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_recibir_traslado_vehiculos()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_cantidad INTEGER;
BEGIN
  IF NEW.estado <> 'recepcionado' OR OLD.estado IS NOT DISTINCT FROM NEW.estado THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO v_cantidad
  FROM public.traslado_interno_vehiculo
  WHERE traslado_id = NEW.id AND disponibilidad = 'reservado';

  -- el registro del traslado deja de estar 'reservado': vuelve a 'liberado'
  -- (el vehículo puede tomar una nueva solicitud; NO se marca 'vendido')
  UPDATE public.traslado_interno_vehiculo
     SET disponibilidad = 'liberado'
   WHERE traslado_id = NEW.id AND disponibilidad = 'reservado';

  -- el vehículo pasa a estar físicamente en el destino
  -- (NO se toca public.vehiculo.disponibilidad: conserva su estado original)
  UPDATE public.vehiculo v
     SET ubicacion = NEW.destino_id
    FROM public.traslado_interno_vehiculo tv
   WHERE tv.traslado_id = NEW.id
     AND tv.vehiculo_id = v.id;

  -- libera la reserva del destino (contador informativo, como en el original)
  IF v_cantidad > 0 THEN
    UPDATE public.sucursal
       SET slots_reservados = GREATEST(slots_reservados - v_cantidad, 0)
     WHERE id = NEW.destino_id;
  END IF;

  -- el vehiculo.ubicacion = destino ya cuenta en fn_recalcular_slots_ocupados
  PERFORM public.fn_recalcular_slots_ocupados(NEW.destino_id);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_recibir_traslado_vehiculos ON public.traslado_interno;
CREATE TRIGGER tr_recibir_traslado_vehiculos
  AFTER UPDATE ON public.traslado_interno
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_recibir_traslado_vehiculos();

-- -----------------------------------------------------------------------------
-- Verificación (opcional)
-- -----------------------------------------------------------------------------
-- SELECT tgname FROM pg_trigger WHERE tgrelid = 'public.traslado_interno_vehiculo'::regclass;
--   ESPERADO: tr_reservar_slots_traslado_vehiculo presente;
--             tr_validar_slots_traslado_vehiculo* AUSENTES
-- SELECT tgname FROM pg_trigger WHERE tgrelid = 'public.solicitud_vehiculo'::regclass;
--   ESPERADO: tr_validar_slots_solicitud_vehiculo AUSENTE