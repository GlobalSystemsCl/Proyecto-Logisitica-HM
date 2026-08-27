-- Migracion: Solicitudes V2.2 - Destino igual al origen permitido
-- Fecha: 2026-08-27
-- Descripcion: Permite que sucursal_destino sea igual a la sucursal origen (venta interna).

CREATE OR REPLACE FUNCTION public.validate_solicitud_tipo()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.tipo_solicitud = 'venta' THEN
    IF NEW.sucursal_destino IS NULL THEN
      RAISE EXCEPTION 'Una solicitud de tipo venta debe tener sucursal destino.';
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

DROP TRIGGER IF EXISTS tr_validate_solicitud_tipo ON public.solicitud;

CREATE TRIGGER tr_validate_solicitud_tipo
  BEFORE INSERT OR UPDATE ON public.solicitud
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_solicitud_tipo();