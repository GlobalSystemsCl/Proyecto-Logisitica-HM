-- Migracion: Validacion de Slots por Sucursal
-- Fecha: 2026-09-02
-- Descripcion: Valida que la sucursal destino tenga slots disponibles antes de
--              asignar vehiculos a una solicitud. Actualiza slots_ocupados
--              automaticamente al insertar/eliminar vehiculos o rechazar/cancelar solicitudes.

-- ============================================================================
-- 1. FUNCION: Obtener slots disponibles de una sucursal
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_obtener_slots_disponibles(p_sucursal_id bigint)
RETURNS integer AS $$
DECLARE
  v_slots integer;
  v_ocupados integer;
BEGIN
  SELECT slots, slots_ocupados INTO v_slots, v_ocupados
  FROM public.sucursal WHERE id = p_sucursal_id;

  IF NOT FOUND THEN
    RETURN -1;
  END IF;

  RETURN GREATEST(v_slots - v_ocupados, 0);
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================================================
-- 2. FUNCION: Validar slots antes de insertar vehiculos a una solicitud
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_validar_slots_solicitud_vehiculo()
RETURNS TRIGGER AS $$
DECLARE
  v_sucursal_destino bigint;
  v_cantidad_vehiculos integer;
  v_slots_disponibles integer;
  v_tipo_solicitud tipo_solicitud;
BEGIN
  -- Obtener la sucursal destino y tipo de la solicitud padre
  SELECT sucursal_destino, tipo_solicitud INTO v_sucursal_destino, v_tipo_solicitud
  FROM public.solicitud WHERE id = NEW.solicitud_id;

  -- Si es solicitud de evento, no validar slots (no aplica)
  IF v_tipo_solicitud = 'evento' THEN
    RETURN NEW;
  END IF;

  -- Si no hay sucursal destino, no validar (evento o error)
  IF v_sucursal_destino IS NULL THEN
    RETURN NEW;
  END IF;

  -- Contar cuantos vehiculos se estan insertando en esta operacion
  -- (el trigger se ejecuta por fila, pero podemos contar las filas pendientes)
  SELECT COUNT(*) INTO v_cantidad_vehiculos
  FROM public.solicitud_vehiculo
  WHERE solicitud_id = NEW.solicitud_id;

  -- Sumar 1 porque el trigger se ejecuta BEFORE INSERT (la fila actual aun no existe)
  v_cantidad_vehiculos := v_cantidad_vehiculos + 1;

  -- Obtener slots disponibles
  v_slots_disponibles := public.fn_obtener_slots_disponibles(v_sucursal_destino);

  -- Validar
  IF v_cantidad_vehiculos > v_slots_disponibles THEN
    RAISE EXCEPTION 'No hay slots disponibles en la sucursal destino. Slots disponibles: %, vehiculos solicitados: %',
      v_slots_disponibles, v_cantidad_vehiculos;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 3. FUNCION: Incrementar slots_ocupados al insertar vehiculo
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_incrementar_slots_ocupados()
RETURNS TRIGGER AS $$
DECLARE
  v_sucursal_destino bigint;
  v_tipo_solicitud tipo_solicitud;
BEGIN
  SELECT sucursal_destino, tipo_solicitud INTO v_sucursal_destino, v_tipo_solicitud
  FROM public.solicitud WHERE id = NEW.solicitud_id;

  IF v_tipo_solicitud = 'evento' OR v_sucursal_destino IS NULL THEN
    RETURN NEW;
  END IF;

  UPDATE public.sucursal
  SET slots_ocupados = slots_ocupados + 1
  WHERE id = v_sucursal_destino;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 4. FUNCION: Decrementar slots_ocupados al eliminar vehiculo
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_decrementar_slots_ocupados()
RETURNS TRIGGER AS $$
DECLARE
  v_sucursal_destino bigint;
  v_tipo_solicitud tipo_solicitud;
BEGIN
  SELECT sucursal_destino, tipo_solicitud INTO v_sucursal_destino, v_tipo_solicitud
  FROM public.solicitud WHERE id = OLD.solicitud_id;

  IF v_tipo_solicitud = 'evento' OR v_sucursal_destino IS NULL THEN
    RETURN OLD;
  END IF;

  UPDATE public.sucursal
  SET slots_ocupados = GREATEST(slots_ocupados - 1, 0)
  WHERE id = v_sucursal_destino;

  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 5. FUNCION: Liberar slots al rechazar o cancelar solicitud
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_liberar_slots_rechazo_cancelacion()
RETURNS TRIGGER AS $$
DECLARE
  v_cantidad_vehiculos integer;
BEGIN
  -- Solo ejecutar cuando el estado cambia a rechazada o cancelada
  IF NEW.estado NOT IN ('rechazada', 'cancelada') THEN
    RETURN NEW;
  END IF;

  -- Solo liberar si el estado anterior era diferente (no re-procesar)
  IF OLD.estado = NEW.estado THEN
    RETURN NEW;
  END IF;

  -- Contar vehiculos reservados en esta solicitud
  SELECT COUNT(*) INTO v_cantidad_vehiculos
  FROM public.solicitud_vehiculo
  WHERE solicitud_id = NEW.id
  AND disponibilidad = 'reservado';

  -- Decrementar slots_ocupados
  IF v_cantidad_vehiculos > 0 AND NEW.sucursal_destino IS NOT NULL THEN
    UPDATE public.sucursal
    SET slots_ocupados = GREATEST(slots_ocupados - v_cantidad_vehiculos, 0)
    WHERE id = NEW.sucursal_destino;

    -- Marcar vehiculos como liberados
    UPDATE public.solicitud_vehiculo
    SET disponibilidad = 'liberado'
    WHERE solicitud_id = NEW.id
    AND disponibilidad = 'reservado';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 6. TRIGGERS
-- ============================================================================

-- Trigger BEFORE INSERT en solicitud_vehiculo: validar slots
DROP TRIGGER IF EXISTS tr_validar_slots_solicitud_vehiculo ON public.solicitud_vehiculo;
CREATE TRIGGER tr_validar_slots_solicitud_vehiculo
  BEFORE INSERT ON public.solicitud_vehiculo
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_validar_slots_solicitud_vehiculo();

-- Trigger AFTER INSERT en solicitud_vehiculo: incrementar slots_ocupados
DROP TRIGGER IF EXISTS tr_incrementar_slots_ocupados ON public.solicitud_vehiculo;
CREATE TRIGGER tr_incrementar_slots_ocupados
  AFTER INSERT ON public.solicitud_vehiculo
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_incrementar_slots_ocupados();

-- Trigger AFTER DELETE en solicitud_vehiculo: decrementar slots_ocupados
DROP TRIGGER IF EXISTS tr_decrementar_slots_ocupados ON public.solicitud_vehiculo;
CREATE TRIGGER tr_decrementar_slots_ocupados
  AFTER DELETE ON public.solicitud_vehiculo
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_decrementar_slots_ocupados();

-- Trigger AFTER UPDATE en solicitud: liberar slots al rechazar/cancelar
DROP TRIGGER IF EXISTS tr_liberar_slots_rechazo_cancelacion ON public.solicitud;
CREATE TRIGGER tr_liberar_slots_rechazo_cancelacion
  AFTER UPDATE ON public.solicitud
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_liberar_slots_rechazo_cancelacion();

-- ============================================================================
-- 7. MIGRACION DE DATOS: Sincronizar slots_ocupados existentes
-- ============================================================================

-- Recalcular slots_ocupados basandose en solicitudes activas actuales
UPDATE public.sucursal s
SET slots_ocupados = COALESCE((
  SELECT COUNT(*)
  FROM public.solicitud_vehiculo sv
  JOIN public.solicitud sol ON sol.id = sv.solicitud_id
  WHERE sol.sucursal_destino = s.id
  AND sv.disponibilidad = 'reservado'
  AND sol.estado IN ('pendiente_aprobacion', 'aprobada', 'pendiente', 'priorizada', 'asignada', 'calendarizada', 'en_transito')
), 0);
