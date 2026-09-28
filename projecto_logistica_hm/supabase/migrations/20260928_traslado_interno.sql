-- =============================================================================
-- Migración: 20260928_traslado_interno.sql
-- Fase 1 / Paso 4 — Traslados internos entre sucursales
-- -----------------------------------------------------------------------------
-- Un traslado interno mueve VEHÍCULOS YA VENDIDOS desde una sucursal a otra.
-- A diferencia de una solicitud normal:
--   - el vehículo NO cambia de disponibilidad (sigue 'vendido')
--   - al recepcionar, vehiculo.ubicacion pasa a ser la sucursal destino
--   - el slot se reserva en destino al crear y se libera de slots_reservados
--     al recepcionar
--
-- Flujo de estados: pendiente -> en_transito -> recepcionado
-- (el JL destino solo puede recepcionar, no puede rechazar)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 0) Tipo de estado
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'estado_traslado') THEN
    CREATE TYPE public.estado_traslado AS ENUM ('pendiente', 'en_transito', 'recepcionado');
  END IF;
END
$$;

-- -----------------------------------------------------------------------------
-- 1) Tablas
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.traslado_interno (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  origen_id       BIGINT NOT NULL REFERENCES public.sucursal(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  destino_id      BIGINT NOT NULL REFERENCES public.sucursal(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  logistica_id    UUID NOT NULL REFERENCES public.usuario(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  estado          public.estado_traslado NOT NULL DEFAULT 'pendiente',
  fecha_despacho  TIMESTAMPTZ,
  fecha_recepcion TIMESTAMPTZ,
  observacion     TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT traslado_interno_destino_distinto CHECK (origen_id <> destino_id)
);

CREATE TABLE IF NOT EXISTS public.traslado_interno_vehiculo (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  traslado_id    UUID NOT NULL REFERENCES public.traslado_interno(id) ON UPDATE CASCADE ON DELETE CASCADE,
  vehiculo_id    UUID NOT NULL REFERENCES public.vehiculo(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  disponibilidad public.disponibilidad NOT NULL DEFAULT 'reservado',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT traslado_interno_vehiculo_unique UNIQUE (traslado_id, vehiculo_id)
);

COMMENT ON TABLE public.traslado_interno IS
  'Traslado interno de vehiculos ya vendidos entre sucursales (Logistica crea, JL destino recepciona)';
COMMENT ON COLUMN public.traslado_interno.logistica_id IS
  'Usuario de Logistica responsable del traslado (encargado)';

CREATE INDEX IF NOT EXISTS idx_traslado_interno_logistica ON public.traslado_interno(logistica_id);
CREATE INDEX IF NOT EXISTS idx_traslado_interno_destino   ON public.traslado_interno(destino_id);
CREATE INDEX IF NOT EXISTS idx_traslado_interno_origen    ON public.traslado_interno(origen_id);
CREATE INDEX IF NOT EXISTS idx_traslado_interno_estado    ON public.traslado_interno(estado);
CREATE INDEX IF NOT EXISTS idx_traslado_veh_traslado      ON public.traslado_interno_vehiculo(traslado_id);
CREATE INDEX IF NOT EXISTS idx_traslado_veh_vehiculo      ON public.traslado_interno_vehiculo(vehiculo_id);

-- -----------------------------------------------------------------------------
-- 2) updated_at automático
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_traslado_touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_traslado_interno_touch ON public.traslado_interno;
CREATE TRIGGER tr_traslado_interno_touch
  BEFORE UPDATE ON public.traslado_interno
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_traslado_touch_updated_at();

-- -----------------------------------------------------------------------------
-- 3) Validación de slots en destino (BEFORE INSERT)
--    Mismo modelo que fn_validar_slots_solicitud_vehiculo: lock + validación
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_validar_slots_traslado_vehiculo()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_destino  BIGINT;
  v_slots    BIGINT;
  v_ocupados BIGINT;
BEGIN
  SELECT destino_id INTO v_destino
  FROM public.traslado_interno
  WHERE id = NEW.traslado_id;

  IF v_destino IS NULL THEN
    RAISE EXCEPTION 'El traslado % no existe', NEW.traslado_id;
  END IF;

  SELECT slots, slots_ocupados INTO v_slots, v_ocupados
  FROM public.sucursal
  WHERE id = v_destino
  FOR UPDATE;

  IF v_slots IS NOT NULL AND (COALESCE(v_ocupados, 0) + 1) > v_slots THEN
    RAISE EXCEPTION 'Sucursal % excede su capacidad: ocupados % > slots %',
      v_destino, COALESCE(v_ocupados, 0) + 1, v_slots;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_validar_slots_traslado_vehiculo ON public.traslado_interno_vehiculo;
CREATE TRIGGER tr_validar_slots_traslado_vehiculo
  BEFORE INSERT ON public.traslado_interno_vehiculo
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_validar_slots_traslado_vehiculo();

-- -----------------------------------------------------------------------------
-- 3b) Permite multiples filas por traslado: bloquea la sucursal completa y
--     revalida contra los slots ya reservados por las filas previas del mismo
--     INSERT, evitando exceder capacidad en inserciones por lote.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_validar_slots_traslado_vehiculo_after()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_destino  BIGINT;
  v_slots    BIGINT;
  v_reservados BIGINT;
BEGIN
  SELECT destino_id INTO v_destino
  FROM public.traslado_interno
  WHERE id = NEW.traslado_id;

  IF v_destino IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT slots, slots_reservados INTO v_slots, v_reservados
  FROM public.sucursal
  WHERE id = v_destino
  FOR UPDATE;

  IF v_slots IS NOT NULL AND COALESCE(v_reservados, 0) > v_slots THEN
    RAISE EXCEPTION 'Sucursal % excede su capacidad: reservados % > slots %',
      v_destino, COALESCE(v_reservados, 0), v_slots;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_validar_slots_traslado_vehiculo_after ON public.traslado_interno_vehiculo;
CREATE TRIGGER tr_validar_slots_traslado_vehiculo_after
  AFTER INSERT ON public.traslado_interno_vehiculo
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_validar_slots_traslado_vehiculo_after();

-- -----------------------------------------------------------------------------
-- 4) Reserva de slot en destino (AFTER INSERT)
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
-- 5) Fechas de despacho / recepción (BEFORE UPDATE)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_registrar_fechas_traslado()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.estado = 'en_transito' AND NEW.fecha_despacho IS NULL THEN
    NEW.fecha_despacho := now();
  END IF;

  IF NEW.estado = 'recepcionado' AND NEW.fecha_recepcion IS NULL THEN
    NEW.fecha_recepcion := now();
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_registrar_fechas_traslado ON public.traslado_interno;
CREATE TRIGGER tr_registrar_fechas_traslado
  BEFORE UPDATE ON public.traslado_interno
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_registrar_fechas_traslado();

-- -----------------------------------------------------------------------------
-- 6) Recepción: el vehículo queda en el destino y SIGUE VENDIDO
--    (AFTER UPDATE sobre traslado_interno)
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

  -- libera la reserva del traslado (deja de estar 'reservado' en el traslado)
  UPDATE public.traslado_interno_vehiculo
     SET disponibilidad = 'vendido'
   WHERE traslado_id = NEW.id AND disponibilidad = 'reservado';

  -- el vehículo pasa a estar físicamente en el destino
  -- (NO se toca public.vehiculo.disponibilidad: sigue 'vendido')
  UPDATE public.vehiculo v
     SET ubicacion = NEW.destino_id
    FROM public.traslado_interno_vehiculo tv
   WHERE tv.traslado_id = NEW.id
     AND tv.vehiculo_id = v.id;

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
-- 7) RLS habilitado (políticas en 20260928_rls_nuevas_tablas.sql)
-- -----------------------------------------------------------------------------
ALTER TABLE public.traslado_interno ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.traslado_interno_vehiculo ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- Verificación (P1.4 / P1.5 / P1.6)
-- -----------------------------------------------------------------------------
-- SELECT table_name FROM information_schema.tables
--  WHERE table_schema = 'public'
--    AND table_name IN ('traslado_interno','traslado_interno_vehiculo','insistencia');
-- SELECT typname FROM pg_type WHERE typname = 'estado_traslado';
-- SELECT tablename, rowsecurity FROM pg_tables
--  WHERE schemaname = 'public'
--    AND tablename IN ('traslado_interno','traslado_interno_vehiculo','insistencia');
