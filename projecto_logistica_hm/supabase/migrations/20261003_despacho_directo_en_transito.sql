-- =============================================================================
-- Migración: 20261003_despacho_directo_en_transito.sql
-- -----------------------------------------------------------------------------
-- Objetivo (usuario, 2026-09-30):
--   "Al apretar Despachar debe inmediatamente pasar a En Tránsito; no es
--    necesario pasar por otro botón antes (Iniciar ruta)."
--
-- El flujo pasa de:
--     calendarizada -> despachada -> (botón "Iniciar ruta") -> en_transito
-- a:
--     calendarizada -> en_transito
--
-- El valor 'despachada' se conserva en el enum `estado_solicitud` de Postgres
-- (los enums son inmutables y quedan en los tipos/labels de UI), pero deja de
-- usarse: ninguna transición del sistema lo produce ni lo consume.
--
-- Cambios (idempotente y autosuficiente):
--   a) Backfill: solicitudes varadas en 'despachada' -> 'en_transito'
--      (con fecha_inicio_transito resuelta).
--   b) fn_registrar_fechas_flujo: el respaldo de `fecha_inicio_transito` pasa
--      a dispararse con 'en_transito' (antes 'despachada', estado ya inalcanzable).
--   c) fn_recalcular_slots_ocupados: 'despachada' sale de la lista de estados que
--      mantienen la reserva (queda igual que ESTADOS_ACTIVOS_RESERVA en el
--      servicio TS). Se conserva el conteo informativo sin validar capacidad
--      (20260930 / 20261002).
--
-- ⚠️  El backfill (a) va PRIMERO a propósito: si se reemplazara (c) antes, las
--     filas aún en 'despachada' quedarían fuera del conteo de reserva.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- a) Backfill de datos: ninguna solicitud debe quedar en un estado inalcanzable
--    (los triggers AFTER UPDATE de `solicitud` — liberar_slots_rechazo_cancelacion,
--    entregar_solicitud_vehiculos, finalizar_solicitud_vehiculos — solo actúan
--    sobre 'rechazada'/'cancelada'/'entregada'/'finalizada', así que este UPDATE
--    no tiene efectos secundarios sobre slots ni vehículos).
-- -----------------------------------------------------------------------------
UPDATE public.solicitud
   SET estado              = 'en_transito',
       fecha_inicio_transito = COALESCE(fecha_inicio_transito, fecha_despacho, now())
 WHERE estado = 'despachada';

-- -----------------------------------------------------------------------------
-- b) Trazabilidad: el respaldo de fecha_inicio_transito sigue al despacho directo
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

  -- despacho (Logística saca el vehículo de la sucursal origen e inicia la ruta)
  IF NEW.estado = 'en_transito' AND NEW.fecha_inicio_transito IS NULL THEN
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

-- -----------------------------------------------------------------------------
-- c) Recálculo de slots: 'despachada' ya no forma parte de los estados que
--    mantienen la reserva del destino (coincide con ESTADOS_ACTIVOS_RESERVA).
--    El conteo sigue siendo INFORMATIVO: no valida ni bloquea capacidad.
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
                             'en_transito'))
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
-- Verificación (opcional)
-- -----------------------------------------------------------------------------
-- SELECT estado, count(*) FROM public.solicitud GROUP BY estado ORDER BY estado;
--   ESPERADO: 0 filas en 'despachada'
-- SELECT prosrc ~ 'despachada' FROM pg_proc WHERE proname = 'fn_registrar_fechas_flujo';
--   ESPERADO: f
-- SELECT prosrc ~ 'despachada' FROM pg_proc WHERE proname = 'fn_recalcular_slots_ocupados';
--   ESPERADO: f