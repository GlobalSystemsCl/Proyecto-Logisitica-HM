-- =============================================================================
-- Rollback de 20261020120000_fn_vehiculos_disponibles_traslado.sql
-- =============================================================================
-- Elimina la función. El código nuevo vuelve solo a la consulta anterior
-- (exclusión con `not id in (...)`) si la función no existe, así que no hace
-- falta desplegar antes el código anterior.
-- =============================================================================

begin;

drop function if exists public.fn_vehiculos_disponibles_traslado(text, bigint, text, int, int);

commit;
