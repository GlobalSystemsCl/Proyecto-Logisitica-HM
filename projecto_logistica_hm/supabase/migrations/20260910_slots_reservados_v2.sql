-- Migracion: Slots Reservados V2 — slots por ubicacion + reserva + estado 'vendido'
-- Fecha: 2026-09-10
-- Referencia: src/app/documentation/PLAN_20260910_slots_reservados.md (paso 2)
--
-- IMPORTANTE (orden de ejecucion en el SQL Editor de Supabase):
--   1. PRIMERO ejecutar el script 20260910_enum_disponibilidad_vendido.sql
--      (agrega el valor 'vendido' al enum y lo deja commiteado).
--   2. DESPUES ejecutar ESTE script.
--   Motivo: PostgreSQL (error 55P04) no permite USAR un valor de enum en la misma
--   transaccion donde se agrego (ALTER TYPE ... ADD VALUE). El SQL Editor de
--   Supabase corre todo el buffer en una sola transaccion.
--
-- Descripcion:
--   1. Nueva columna sucursal.slots_reservados (BIGINT NOT NULL DEFAULT 0): cantidad de
--      vehiculos comprometidos/por llegar a la sucursal por solicitudes activas.
--   2. Nuevo valor 'vendido' en el enum public.disponibilidad (solicitud_vehiculo):
--      el vehiculo fue entregado al cliente y sale del inventario (ubicacion = NULL).
--   3. Se elimina la columna booleana vehiculo.vendido (reemplazada por el enum).
--   4. slots_ocupados pasa a calcularse como: COUNT(vehiculo.ubicacion = sucursal)
--      + COUNT(reservas pendientes con destino = sucursal). Fuente de verdad:
--      funcion fn_recalcular_slots_ocupados(p_sucursal_id).
--   5. La validacion slots_ocupados <= slots es INMEDIATA al reservar (BEFORE INSERT
--      en solicitud_vehiculo, con bloqueo FOR UPDATE para evitar carreras).
--
-- Nota semantica (confirmada con el usuario):
--   - Al ENTREGAR (estado 'entregada'): los vehiculos pasan a la sucursal destino
--     (vehiculo.ubicacion = sucursal_destino) y liberan su reserva.
--   - Al FINALIZAR (estado 'finalizada'): el vehiculo se entrega al cliente (lo ve el
--     ejecutivo de ventas) -> solicitud_vehiculo.disponibilidad = 'vendido' y
--     vehiculo.ubicacion = NULL (sale del inventario; ya no ocupa slots en ninguna sucursal).
--   - Solicitudes tipo 'evento' (sin sucursal_destino): no reservan slots; al entregar,
--     los vehiculos retornan al inventario (disponibilidad = 'liberado', ubicacion sin cambio).

-- ============================================================================
-- 1. SUCURSAL: columna slots_reservados
-- ============================================================================

ALTER TABLE public.sucursal
  ADD COLUMN IF NOT EXISTS slots_reservados bigint NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.sucursal.slots_reservados IS
  'Vehiculos comprometidos (reservados) por solicitudes activas con destino en esta sucursal';

-- ============================================================================
-- 2. ENUM disponibilidad: nuevo valor 'vendido'
--    > EJECUTADO APARTE en 20260910_enum_disponibilidad_vendido.sql
--    ALTER TYPE public.disponibilidad ADD VALUE IF NOT EXISTS 'vendido';
-- ============================================================================

-- ============================================================================
-- 3. VEHICULO: eliminar columna booleana vendido (reemplazada por el enum)
-- ============================================================================

ALTER TABLE public.vehiculo DROP COLUMN IF EXISTS vendido;

-- ============================================================================
-- 4. FUNCION: fn_recalcular_slots_ocupados  (fuente de verdad del conteo)
--    ocupados = vehiculos fisicos en la sucursal (ubicacion) + reservas pendientes
--    (solicitudes activas pre-entrega con destino = sucursal)
-- ============================================================================

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
                             'priorizada','asignada','calendarizada','en_transito'))
    INTO v_ocupados;

  SELECT slots INTO v_slots
  FROM public.sucursal
  WHERE id = p_sucursal_id;

  -- La columna slots_ocupados JAMAS debe superar slots
  IF v_slots IS NOT NULL AND v_ocupados > v_slots THEN
    RAISE EXCEPTION 'Sucursal % excede su capacidad: ocupados % > slots %',
      p_sucursal_id, v_ocupados, v_slots;
  END IF;

  UPDATE public.sucursal
  SET slots_ocupados = v_ocupados
  WHERE id = p_sucursal_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 5. FUNCION (BEFORE INSERT solicitud_vehiculo): validar slots INMEDIATAMENTE
--    Solo aplica a tipo 'venta' con sucursal_destino. La reserva aumenta en 1
--    slots_reservados y slots_ocupados; aqui se valida que no exceda slots.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_validar_slots_solicitud_vehiculo()
RETURNS TRIGGER AS $$
DECLARE
  v_destino bigint;
  v_tipo    tipo_solicitud;
  v_slots   bigint;
  v_ocupados bigint;
BEGIN
  SELECT sol.sucursal_destino, sol.tipo_solicitud
    INTO v_destino, v_tipo
  FROM public.solicitud sol
  WHERE sol.id = NEW.solicitud_id;

  IF v_tipo = 'evento' OR v_destino IS NULL THEN
    RETURN NEW;
  END IF;

  -- Bloqueo de fila: serializa las reservas concurrentes sobre la misma sucursal
  SELECT slots, slots_ocupados INTO v_slots, v_ocupados
  FROM public.sucursal
  WHERE id = v_destino
  FOR UPDATE;

  -- +1 porque esta fila aun no incremento el contador (BEFORE INSERT)
  IF v_slots IS NOT NULL AND (v_ocupados + 1) > v_slots THEN
    RAISE EXCEPTION 'No hay slots disponibles en la sucursal destino %. Slots: %, ocupados: %',
      v_destino, v_slots, v_ocupados;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 6. FUNCION (AFTER INSERT solicitud_vehiculo): reservar slots (misma operacion
--    sobre slots_reservados y slots_ocupados en la sucursal DESTINO)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_reservar_slots_solicitud_vehiculo()
RETURNS TRIGGER AS $$
DECLARE
  v_destino bigint;
  v_tipo    tipo_solicitud;
BEGIN
  SELECT sol.sucursal_destino, sol.tipo_solicitud
    INTO v_destino, v_tipo
  FROM public.solicitud sol
  WHERE sol.id = NEW.solicitud_id;

  IF v_tipo = 'evento' OR v_destino IS NULL OR NEW.disponibilidad <> 'reservado' THEN
    RETURN NEW;
  END IF;

  -- slots_reservados y slots_ocupados reciben la misma operacion (+1)
  UPDATE public.sucursal
  SET slots_reservados = slots_reservados + 1,
      slots_ocupados   = slots_ocupados + 1
  WHERE id = v_destino;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 7. FUNCION (AFTER DELETE solicitud_vehiculo): liberar la reserva del vehiculo
--    retirado de una solicitud activa (pre-entrega)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_liberar_slots_solicitud_vehiculo_eliminado()
RETURNS TRIGGER AS $$
DECLARE
  v_destino bigint;
  v_tipo    tipo_solicitud;
  v_estado  estado_solicitud;
BEGIN
  SELECT sol.sucursal_destino, sol.tipo_solicitud, sol.estado
    INTO v_destino, v_tipo, v_estado
  FROM public.solicitud sol
  WHERE sol.id = OLD.solicitud_id;

  IF v_tipo = 'evento' OR v_destino IS NULL
     OR OLD.disponibilidad <> 'reservado'
     OR v_estado NOT IN ('pendiente_aprobacion','aprobada','pendiente',
                         'priorizada','asignada','calendarizada','en_transito')
  THEN
    RETURN OLD;
  END IF;

  UPDATE public.sucursal
  SET slots_reservados = GREATEST(slots_reservados - 1, 0),
      slots_ocupados   = GREATEST(slots_ocupados - 1, 0)
  WHERE id = v_destino;

  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 8. FUNCION (AFTER UPDATE solicitud): liberar slots al RECHAZAR o CANCELAR
--    (reemplaza el trigger anterior; tambien decrementa slots_reservados)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_liberar_slots_rechazo_cancelacion()
RETURNS TRIGGER AS $$
DECLARE
  v_cantidad integer;
  v_destino  bigint;
BEGIN
  IF NEW.estado NOT IN ('rechazada','cancelada') OR OLD.estado = NEW.estado THEN
    RETURN NEW;
  END IF;

  v_destino := NEW.sucursal_destino;
  IF v_destino IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO v_cantidad
  FROM public.solicitud_vehiculo
  WHERE solicitud_id = NEW.id AND disponibilidad = 'reservado';

  IF v_cantidad > 0 THEN
    -- Vehiculos liberados (vuelven a estar disponibles)
    UPDATE public.solicitud_vehiculo
    SET disponibilidad = 'liberado'
    WHERE solicitud_id = NEW.id AND disponibilidad = 'reservado';

    -- Misma operacion sobre reservados y ocupados
    UPDATE public.sucursal
    SET slots_reservados = GREATEST(slots_reservados - v_cantidad, 0),
        slots_ocupados   = GREATEST(slots_ocupados - v_cantidad, 0)
    WHERE id = v_destino;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 9. FUNCION (AFTER UPDATE solicitud): ENTREGADA
--    - tipo venta: vehiculo.ubicacion = sucursal_destino (llego al destino);
--      se libera la reserva pendiente del destino y se recalcula origen+destino.
--    - tipo evento: los vehiculos retornan al inventario (liberado, ubicacion intacta).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_entregar_solicitud_vehiculos()
RETURNS TRIGGER AS $$
DECLARE
  v_cantidad integer;
  v_destino  bigint;
  v_origen   bigint;
BEGIN
  IF NEW.estado <> 'entregada' OR OLD.estado = NEW.estado THEN
    RETURN NEW;
  END IF;

  v_destino := NEW.sucursal_destino;
  v_origen  := NEW.sucursal;

  -- Evento: sin sucursal destino; el vehiculo vuelve al inventario
  IF NEW.tipo_solicitud = 'evento' OR v_destino IS NULL THEN
    UPDATE public.solicitud_vehiculo
    SET disponibilidad = 'liberado'
    WHERE solicitud_id = NEW.id AND disponibilidad = 'reservado';
    RETURN NEW;
  END IF;

  SELECT count(*) INTO v_cantidad
  FROM public.solicitud_vehiculo
  WHERE solicitud_id = NEW.id AND disponibilidad = 'reservado';

  -- El vehiculo llega y queda estacionado en la sucursal destino
  UPDATE public.vehiculo v
  SET ubicacion = v_destino
  FROM public.solicitud_vehiculo sv
  WHERE sv.solicitud_id = NEW.id
    AND sv.vehiculo_id = v.id
    AND sv.disponibilidad = 'reservado';

  -- Se libera la reserva pendiente (los vehiculos ya no estan "por llegar")
  IF v_cantidad > 0 THEN
    UPDATE public.sucursal
    SET slots_reservados = GREATEST(slots_reservados - v_cantidad, 0)
    WHERE id = v_destino;
  END IF;

  -- Recalcular ocupacion (fuente de verdad): el destino sube (llegan), el origen baja
  PERFORM public.fn_recalcular_slots_ocupados(v_destino);
  IF v_origen IS NOT NULL AND v_origen <> v_destino THEN
    PERFORM public.fn_recalcular_slots_ocupados(v_origen);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 10. FUNCION (AFTER UPDATE solicitud): FINALIZADA
--     El vehiculo se entrega al cliente (paso final, lo ve el ejecutivo de ventas):
--     disponibilidad = 'vendido' y vehiculo.ubicacion = NULL (sale del inventario,
--     ya no ocupa slots en ninguna sucursal).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_finalizar_solicitud_vehiculos()
RETURNS TRIGGER AS $$
DECLARE
  v_destino bigint;
BEGIN
  IF NEW.estado <> 'finalizada' OR OLD.estado = NEW.estado THEN
    RETURN NEW;
  END IF;

  IF NEW.tipo_solicitud = 'evento' THEN
    RETURN NEW;
  END IF;

  v_destino := NEW.sucursal_destino;
  IF v_destino IS NULL THEN
    RETURN NEW;
  END IF;

  -- Vehiculo entregado al cliente -> vendido
  UPDATE public.solicitud_vehiculo
  SET disponibilidad = 'vendido'
  WHERE solicitud_id = NEW.id AND disponibilidad = 'reservado';

  -- Vendido: deja el inventario de las sucursales
  UPDATE public.vehiculo v
  SET ubicacion = NULL
  FROM public.solicitud_vehiculo sv
  WHERE sv.solicitud_id = NEW.id
    AND sv.vehiculo_id = v.id
    AND sv.disponibilidad = 'vendido';

  -- Recalcular ocupacion del destino (los vendidos ya no ocupan slots)
  PERFORM public.fn_recalcular_slots_ocupados(v_destino);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 11. FUNCION (BEFORE UPDATE solicitud): destino invariante
--     Evita cambiar sucursal_destino una vez asignado
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_validar_destino_invariante()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.sucursal_destino IS NOT NULL
     AND OLD.sucursal_destino IS DISTINCT FROM NEW.sucursal_destino THEN
    RAISE EXCEPTION 'El destino de la solicitud es invariante (sucursal_destino = %, intento %)',
      OLD.sucursal_destino, NEW.sucursal_destino;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 12. TRIGGERS
-- ============================================================================

-- Limpiar triggers anteriores (20260902_validar_slots_sucursal.sql)
DROP TRIGGER IF EXISTS tr_validar_slots_solicitud_vehiculo ON public.solicitud_vehiculo;
DROP TRIGGER IF EXISTS tr_incrementar_slots_ocupados ON public.solicitud_vehiculo;
DROP TRIGGER IF EXISTS tr_decrementar_slots_ocupados ON public.solicitud_vehiculo;
DROP TRIGGER IF EXISTS tr_liberar_slots_rechazo_cancelacion ON public.solicitud;

-- solicitud_vehiculo
CREATE TRIGGER tr_validar_slots_solicitud_vehiculo
  BEFORE INSERT ON public.solicitud_vehiculo
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_validar_slots_solicitud_vehiculo();

CREATE TRIGGER tr_reservar_slots_solicitud_vehiculo
  AFTER INSERT ON public.solicitud_vehiculo
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_reservar_slots_solicitud_vehiculo();

CREATE TRIGGER tr_liberar_slots_solicitud_vehiculo_eliminado
  AFTER DELETE ON public.solicitud_vehiculo
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_liberar_slots_solicitud_vehiculo_eliminado();

-- solicitud
CREATE TRIGGER tr_liberar_slots_rechazo_cancelacion
  AFTER UPDATE ON public.solicitud
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_liberar_slots_rechazo_cancelacion();

CREATE TRIGGER tr_entregar_solicitud_vehiculos
  AFTER UPDATE ON public.solicitud
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_entregar_solicitud_vehiculos();

CREATE TRIGGER tr_finalizar_solicitud_vehiculos
  AFTER UPDATE ON public.solicitud
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_finalizar_solicitud_vehiculos();

CREATE TRIGGER tr_solicitud_destino_invariante
  BEFORE UPDATE OF sucursal_destino ON public.solicitud
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_validar_destino_invariante();

-- ============================================================================
-- 13. MIGRACION DE DATOS (backfill)
-- ============================================================================

-- 13.1 Solicitudes ya 'entregada': los vehiculos reservados ya llegaron al destino
UPDATE public.vehiculo v
SET ubicacion = sol.sucursal_destino
FROM public.solicitud_vehiculo sv
JOIN public.solicitud sol ON sol.id = sv.solicitud_id
WHERE sv.vehiculo_id = v.id
  AND sol.estado = 'entregada'
  AND sol.sucursal_destino IS NOT NULL
  AND sv.disponibilidad = 'reservado';

-- 13.2 Solicitudes ya 'finalizada': vehiculos entregados al cliente -> vendido
UPDATE public.solicitud_vehiculo sv
SET disponibilidad = 'vendido'
FROM public.solicitud sol
WHERE sol.id = sv.solicitud_id
  AND sol.estado = 'finalizada'
  AND sol.sucursal_destino IS NOT NULL
  AND sv.disponibilidad = 'reservado';

UPDATE public.vehiculo v
SET ubicacion = NULL
FROM public.solicitud_vehiculo sv
JOIN public.solicitud sol ON sol.id = sv.solicitud_id
WHERE sv.vehiculo_id = v.id
  AND sol.estado = 'finalizada'
  AND sol.sucursal_destino IS NOT NULL;

-- 13.3 Recalcular slots_ocupados y slots_reservados para todas las sucursales
UPDATE public.sucursal s
SET slots_ocupados = v.calculado_ocupados,
    slots_reservados = v.calculado_reservados
FROM (
  SELECT
    suc.id,
      (SELECT count(*) FROM public.vehiculo vv WHERE vv.ubicacion = suc.id)
    + (SELECT count(*)
         FROM public.solicitud_vehiculo sv
         JOIN public.solicitud sol ON sol.id = sv.solicitud_id
        WHERE sol.sucursal_destino = suc.id
          AND sv.disponibilidad = 'reservado'
          AND sol.estado IN ('pendiente_aprobacion','aprobada','pendiente',
                             'priorizada','asignada','calendarizada','en_transito')
      ) AS calculado_ocupados,
      (SELECT count(*)
         FROM public.solicitud_vehiculo sv
         JOIN public.solicitud sol ON sol.id = sv.solicitud_id
        WHERE sol.sucursal_destino = suc.id
          AND sv.disponibilidad = 'reservado'
          AND sol.estado IN ('pendiente_aprobacion','aprobada','pendiente',
                             'priorizada','asignada','calendarizada','en_transito')
      ) AS calculado_reservados
  FROM public.sucursal suc
) v
WHERE s.id = v.id;

-- ============================================================================
-- 14. DIAGNOSTICO (no falla, solo informa)
-- ============================================================================

-- Sucursales que exceden capacidad tras el backfill (deben revisarse)
SELECT id, nombre, slots, slots_ocupados, slots_reservados
FROM public.sucursal
WHERE slots IS NOT NULL AND slots_ocupados > slots;