-- ROLLBACK de 20261007120600_brecha_012_intentos_fallidos_atomico.sql
-- La app vuelve automáticamente al incremento no atómico (respaldo en AuthService).
drop function if exists public.fn_registrar_intento_fallido(uuid, integer, integer);
