-- =============================================================================
-- Migración: 20260928_triggers_fechas.sql
-- Fase 1 / Paso 3 — Trigger de trazabilidad de fechas del flujo
-- -----------------------------------------------------------------------------
-- ⚠️  EJECUTAR DESPUÉS de `20260928_enum_despachada.sql` (sesión separada),
--     porque usa el valor 'despachada' del enum.
--
-- 1) Registra automáticamente los 4 timestamps de trazabilidad en cada
--    transición de estado (respaldo en DB de lo que hace el servicio TS).
-- 2) Actualiza `fn_recalcular_slots_ocupados` para considerar 'despachada'
--    como estado que mantiene el slot reservado en la sucursal destino.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) Trigger de fechas del flujo
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_registrar_fechas_flujo()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.estado IS NOT DISTINCT FROM NEW.estado THEN
    RETURN NEW;
  END IF;

  -- aprobación / confirmación del Jefe Local
  IF NEW.estado = 'aprobada' AND NEW.fecha_confirmacion IS NULL THEN
    NEW.fecha_confirmacion := now();
  END IF;

  -- despacho:(Logística saca el vehículo de la sucursal origen)
  IF NEW.estado = 'despachada' AND NEW.fecha_inicio_transito IS NULL THEN
    NEW.fecha_inicio_transito := now();
  END IF;

  -- recepción en sucursal destino (UI: "Recepcionada")
  IF NEW.estado = 'entregada' AND NEW.fecha_recepcion IS NULL THEN
    NEW.fecha_recepcion := now();
  END IF;

  -- entrega al cliente final (UI: "Entregado a cliente")
  IF NEW.estado = 'finalizada' AND NEW.fecha_entrega_cliente IS NULL THEN
    NEW.fecha_entrega_cliente := now();
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.fn_registrar_fechas_flujo() IS
  'Registra fecha_confirmacion / fecha_inicio_transito / fecha_recepcion / fecha_entrega_cliente segun la transicion de estado de la solicitud';

DROP TRIGGER IF EXISTS tr_registrar_fechas_flujo ON public.solicitud;

CREATE TRIGGER tr_registrar_fechas_flujo
  BEFORE UPDATE ON public.solicitud
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_registrar_fechas_flujo();

-- -----------------------------------------------------------------------------
-- 2) Recálculo de slots: 'despachada' mantiene el slot reservado en destino
--    (el vehículo sigue en tránsito, no se puede liberar aún)
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

  IF v_slots IS NOT NULL AND v_ocupados > v_slots THEN
    RAISE EXCEPTION 'Sucursal % excede su capacidad: ocupados % > slots %',
      p_sucursal_id, v_ocupados, v_slots;
  END IF;

  UPDATE public.sucursal
  SET slots_ocupados = v_ocupados
  WHERE id = p_sucursal_id;
END;
$$ LANGUAGE plpgsql;

-- -----------------------------------------------------------------------------
-- Verificación (P1.3)
-- -----------------------------------------------------------------------------
-- SELECT tgname, tgtype FROM pg_trigger
--  WHERE tgrelid = 'public.solicitud'::regclass
--    AND tgname = 'tr_registrar_fechas_flujo';
-- ESPERADO: 1 fila
