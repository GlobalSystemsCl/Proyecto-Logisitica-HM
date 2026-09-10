-- Migracion: Recalculate slots_ocupados al crear/editar/eliminar vehiculo
-- Fecha: 2026-09-11
-- Referencia: src/app/documentation/PLAN_20260910_slots_reservados.md (modelo de slots,
--   fila "Crear / editar vehiculo" = recount si ubicacion = sucursal).
--
-- Problema: no existia un trigger sobre public.vehiculo, por lo que crear/editar/eliminar
-- un vehiculo con ubicacion en una sucursal NO actualizaba supuesta slots_ocupados.
--
-- Descripcion:
--   1. Funcion fn_recalcular_slots_por_vehiculo(): AFTER trigger que recalcula
--      SLOTS_OCUPADOS (y valida <= slots) via fn_recalcular_slots_ocupados para las
--      sucursales afectadas por el cambio de ubicacion (antes y/o despues).
--   2. Trigger tr_recalcular_slots_vehiculo: INSERT, UPDATE OF ubicacion, DELETE.
--   3. Deploy de consistencia: recalcula TODAS las sucursales para corregir el estado
--      actual (incluye el vehiculo que el usuario creo sin recount).
--
-- Nota de comportamiento (validacion inquebrantable):
--   Si al crear/editar un vehiculo la sucursal de ubicacion EXCEDE su capacidad
--   (slots_ocupados > slots), fn_recalcular_slots_ocupados lanza RAISE EXCEPTION y el
--   INSERT/UPDATE de vehiculo FALLA. Es el mismo criterio de la reserva de solicitudes.

CREATE OR REPLACE FUNCTION public.fn_recalcular_slots_por_vehiculo()
RETURNS TRIGGER AS $$
DECLARE
  v_antes   bigint;
  v_despues bigint;
BEGIN
  v_antes   := NULL;
  v_despues := NULL;

  IF TG_OP = 'INSERT' THEN
    v_despues := NEW.ubicacion;
  ELSIF TG_OP = 'UPDATE' THEN
    v_antes   := OLD.ubicacion;
    v_despues := NEW.ubicacion;
  ELSIF TG_OP = 'DELETE' THEN
    v_antes := OLD.ubicacion;
  END IF;

  IF v_antes IS NOT NULL THEN
    PERFORM public.fn_recalcular_slots_ocupados(v_antes);
  END IF;

  IF v_despues IS NOT NULL AND (v_antes IS NULL OR v_despues <> v_antes) THEN
    PERFORM public.fn_recalcular_slots_ocupados(v_despues);
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_recalcular_slots_vehiculo ON public.vehiculo;

CREATE TRIGGER tr_recalcular_slots_vehiculo
  AFTER INSERT OR UPDATE OF ubicacion OR DELETE ON public.vehiculo
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_recalcular_slots_por_vehiculo();

-- ============================================================================
-- Deploy de consistencia: corregir el estado actual de todas las sucursales
-- (incluye vehiculos creados/actualizados antes de existir el trigger).
-- Si alguna sucursal excede capacidad, este bloque lanzara la excepcion y
-- habra que regularla antes de continuar.
-- ============================================================================

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT id, nombre, slots FROM public.sucursal ORDER BY id LOOP
    BEGIN
      PERFORM public.fn_recalcular_slots_ocupados(r.id);
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Sucursal id=% (nombre=%) excede capacidad — la consola la reporta abajo', r.id, r.nombre;
      RAISE;
    END;
  END LOOP;
END $$;