-- Migracion: Cola de prioridad por sucursal
-- Fecha: 2026-08-26
-- Descripcion: Cambia el UNIQUE(posicion_prioridad) global por UNIQUE(sucursal, posicion_prioridad)
-- para permitir que cada sucursal tenga su propia cola de prioridades 1..N sin colisiones.

-- 1. Quitar el UNIQUE global sobre posicion_prioridad
ALTER TABLE public.solicitud
  DROP CONSTRAINT solicitud_posicion_prioridad_key;

-- 2. Agregar UNIQUE compuesto (sucursal, posicion_prioridad)
--    Cada sucursal mantiene su propio rango 1..N
ALTER TABLE public.solicitud
  ADD CONSTRAINT solicitud_sucursal_posicion_prioridad_key
  UNIQUE (sucursal, posicion_prioridad);
