-- Migracion: Vehiculo - columna ubicacion (sucursal de partida)
-- Fecha: 2026-09-09
-- Descripcion: Agrega la columna ubicacion (id de sucursal) al inventario de
-- vehiculos, indicando la sucursal desde la que parte/partira el vehiculo.
-- Es nula por defecto para no romper los vehiculos preexistentes.

ALTER TABLE public.vehiculo
  ADD COLUMN ubicacion bigint REFERENCES public.sucursal(id);

CREATE INDEX idx_vehiculo_ubicacion ON public.vehiculo USING btree (ubicacion);

COMMENT ON COLUMN public.vehiculo.ubicacion IS 'Sucursal desde la que parte el vehiculo';