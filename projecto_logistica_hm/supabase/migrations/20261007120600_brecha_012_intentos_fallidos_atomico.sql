-- =============================================================================
-- Brecha 012 (punto 2) y 010 (punto 5) — Contador de intentos fallidos atómico
-- =============================================================================
-- AuthService.signIn leía intentos_fallidos, sumaba 1 en TypeScript y
-- escribía: intentos en paralelo se perdían. Esta función hace el incremento y
-- el bloqueo en una sola sentencia. Solo la ejecuta service_role.
--
-- La app tiene un respaldo: si la función no existe, usa la actualización
-- anterior. Aplicar esta migración activa el comportamiento atómico.
--
-- Rollback: supabase/rollback/20261007120600_brecha_012_intentos_fallidos_atomico.sql
-- =============================================================================

begin;

create or replace function public.fn_registrar_intento_fallido(
  p_usuario_id uuid,
  p_max_intentos integer default 5,
  p_minutos_bloqueo integer default 15
)
returns table (intentos_fallidos integer, bloqueado_hasta timestamptz)
language sql
security definer
set search_path = public, pg_temp
as $$
  update public.usuario u
  set intentos_fallidos = coalesce(u.intentos_fallidos, 0) + 1,
      bloqueado_hasta = case
        when coalesce(u.intentos_fallidos, 0) + 1 >= p_max_intentos
          then now() + make_interval(mins => p_minutos_bloqueo)
        else u.bloqueado_hasta
      end
  where u.id = p_usuario_id
  returning u.intentos_fallidos, u.bloqueado_hasta;
$$;

revoke execute on function public.fn_registrar_intento_fallido(uuid, integer, integer)
  from public, anon, authenticated;
grant execute on function public.fn_registrar_intento_fallido(uuid, integer, integer)
  to service_role;

commit;
