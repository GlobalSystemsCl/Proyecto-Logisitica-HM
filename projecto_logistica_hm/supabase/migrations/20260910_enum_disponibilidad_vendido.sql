-- Migracion: Enum disponibilidad -> nuevo valor 'vendido'
-- Fecha: 2026-09-10
-- Descripcion: Agrega el valor 'vendido' al enum public.disponibilidad (solicitud_vehiculo).
--
-- IMPORTANTE: DEBE ejecutarse ANTES de 20260910_slots_reservados_v2.sql y como un
-- script SEPARADO (una sola transaccion por script). PostgreSQL (error 55P04) no permite
-- usar un valor de enum recien agregado dentro de la misma transaccion del ALTER TYPE.
-- Al ejecutarlo de forma aislada, el commit queda registrado y luego el resto de la
-- migracion puede usar 'vendido' libremente.

ALTER TYPE public.disponibilidad ADD VALUE IF NOT EXISTS 'vendido';