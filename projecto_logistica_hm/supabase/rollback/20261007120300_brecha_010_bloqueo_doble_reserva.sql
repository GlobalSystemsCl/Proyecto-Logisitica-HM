-- ROLLBACK de 20261007120300_brecha_010_bloqueo_doble_reserva.sql
-- Reabre la posibilidad de doble reserva concurrente (brecha 010).
begin;
drop trigger if exists tr_validar_reserva_unica_vehiculo on public.solicitud_vehiculo;
drop function if exists public.fn_validar_reserva_unica_vehiculo();
commit;
