-- Migracion: Solicitudes V2 - Schema
-- Fecha: 2026-08-26
-- Descripcion: Agrega sucursal_destino, nuevos estados al enum, ejecutivo_id nullable, y trigger.

-- 1. Hacer ejecutivo_id nullable (jefe_local puede crear sin ejecutivo)
ALTER TABLE public.solicitud ALTER COLUMN ejecutivo_id DROP NOT NULL;

-- 2. Enum: agregar nuevos valores de estado (NO se pueden usar en el mismo transaction)
ALTER TYPE public.estado_solicitud ADD VALUE IF NOT EXISTS 'pendiente_aprobacion';
ALTER TYPE public.estado_solicitud ADD VALUE IF NOT EXISTS 'aprobada';
ALTER TYPE public.estado_solicitud ADD VALUE IF NOT EXISTS 'rechazada';

-- 3. Columna sucursal_destino (para tipo venta)
ALTER TABLE public.solicitud ADD COLUMN IF NOT EXISTS sucursal_destino bigint;

ALTER TABLE public.solicitud
  ADD CONSTRAINT solicitud_sucursal_destino_fkey
  FOREIGN KEY (sucursal_destino) REFERENCES public.sucursal(id);

CREATE INDEX IF NOT EXISTS idx_solicitud_sucursal_destino ON public.solicitud(sucursal_destino);

-- 4. Trigger: validacion por tipo_solicitud
DROP TRIGGER IF EXISTS tr_validate_solicitud_tipo ON public.solicitud;

CREATE OR REPLACE FUNCTION public.validate_solicitud_tipo()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.tipo_solicitud = 'venta' THEN
    IF NEW.sucursal_destino IS NULL THEN
      RAISE EXCEPTION 'Una solicitud de tipo venta debe tener sucursal destino.';
    END IF;
    IF NEW.sucursal_destino = NEW.sucursal THEN
      RAISE EXCEPTION 'La sucursal destino no puede ser igual a la sucursal origen.';
    END IF;
  END IF;

  IF NEW.tipo_solicitud = 'evento' THEN
    IF NEW.direccion_evento IS NULL OR TRIM(NEW.direccion_evento) = '' THEN
      RAISE EXCEPTION 'Una solicitud de tipo evento debe tener direccion del evento.';
    END IF;
    IF NEW.titulo_evento IS NULL OR TRIM(NEW.titulo_evento) = '' THEN
      RAISE EXCEPTION 'Una solicitud de tipo evento debe tener titulo del evento.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_validate_solicitud_tipo
  BEFORE INSERT OR UPDATE ON public.solicitud
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_solicitud_tipo();
