-- =============================================================================
-- Migración: 20260930_desactivar_validacion_slots.sql
-- Desactiva la validación de capacidad (slots) en TODOS los flujos.
-- -----------------------------------------------------------------------------
-- Decisión (2026-09-30, usuario):
--   1. Los slots pasan a ser SOLO informativos: ninguna capa (app ni BD) bloquea
--      una operación por exceder capacidad.
--   2. Se elimina por completo la reserva de slots de TRASLADOS (el contador de
--      traslado sobrecapacitado no es necesario en esta etapa).
--   3. Se MANTIENEN los contadores del flujo de solicitudes (tr_reservar_slots_
--      solicitud_vehiculo, liberaciones) porque alimentan el badge "libres" del
--      header; solo desaparece la validación.
--
-- Cambios:
--   a) Traslados: se eliminan tr_validar_slots_traslado_vehiculo,
--      tr_validar_slots_traslado_vehiculo_after y tr_reservar_slots_traslado_vehiculo
--      (+ sus funciones).
--   b) Solicitudes: se elimina tr_validar_slots_solicitud_vehiculo (+ su función).
--   c) fn_recalcular_slots_ocupados: deja de lanzar RAISE EXCEPTION al exceder
--      capacidad; sigue actualizando el conteo real (RAISE NOTICE informativo).
--   d) fn_recibir_traslado_vehiculos: ya no toca slots_reservados (no se reserva);
--      conserva el alta física en el destino y el recount informativo.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- a) Traslados: sin validación ni reserva de slots en destino
-- -----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS tr_validar_slots_traslado_vehiculo ON public.traslado_interno_vehiculo;
DROP TRIGGER IF EXISTS tr_validar_slots_traslado_vehiculo_after ON public.traslado_interno_vehiculo;
DROP TRIGGER IF EXISTS tr_reservar_slots_traslado_vehiculo ON public.traslado_interno_vehiculo;

DROP FUNCTION IF EXISTS public.fn_validar_slots_traslado_vehiculo();
DROP FUNCTION IF EXISTS public.fn_validar_slots_traslado_vehiculo_after();
DROP FUNCTION IF EXISTS public.fn_reservar_slots_traslado_vehiculo();

-- -----------------------------------------------------------------------------
-- b) Solicitudes: sin validación de capacidad al reservar
--    (se conservan los contadores informativos)
-- -----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS tr_validar_slots_solicitud_vehiculo ON public.solicitud_vehiculo;
DROP FUNCTION IF EXISTS public.fn_validar_slots_solicitud_vehiculo();

-- -----------------------------------------------------------------------------
-- c) fn_recalcular_slots_ocupados: SOLO informativo, no bloquea
--    (mantiene la lista de estados de 20260928_triggers_fechas.sql)
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
-- d) fn_recibir_traslado_vehiculos: sin liberación de slots_reservados
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_recibir_traslado_vehiculos()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.estado <> 'recepcionado' OR OLD.estado IS NOT DISTINCT FROM NEW.estado THEN
    RETURN NEW;
  END IF;

  -- el vehículo deja de estar 'reservado' en el registro del traslado
  UPDATE public.traslado_interno_vehiculo
     SET disponibilidad = 'vendido'
   WHERE traslado_id = NEW.id AND disponibilidad = 'reservado';

  -- el vehículo pasa a estar físicamente en el destino
  -- (NO se toca public.vehiculo.disponibilidad: conserva su estado original)
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