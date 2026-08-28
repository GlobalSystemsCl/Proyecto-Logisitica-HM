-- Migracion: Vehiculo - campo precio opcional
-- Fecha: 2026-08-28
-- Descripcion: Agrega el campo precio (opcional) al inventario de vehiculos
-- para registrar el valor comercial de cada vehiculo.

ALTER TABLE public.vehiculo
  ADD COLUMN precio numeric(14,2);