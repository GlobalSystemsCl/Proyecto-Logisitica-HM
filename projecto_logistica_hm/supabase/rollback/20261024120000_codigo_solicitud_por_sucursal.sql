-- =============================================================================
-- Rollback de 20261024120000_codigo_solicitud_por_sucursal.sql
-- =============================================================================
-- Quita el trigger de numeración y las columnas solicitud.numero y
-- sucursal.ultimo_numero_solicitud (se pierden los números asignados).
-- Desplegar antes el código anterior: el código nuevo lee solicitud.numero.
--
-- Las 42 sucursales del Excel (101-145) NO se borran: pueden tener
-- solicitudes, vehículos o usuarios asignados. Si no tienen nada, se quitan a
-- mano con la consulta comentada al final.
-- =============================================================================

begin;

drop trigger if exists tr_asignar_numero_solicitud on public.solicitud;
drop function if exists public.fn_asignar_numero_solicitud();

alter table public.solicitud drop constraint if exists solicitud_sucursal_numero_key;
alter table public.solicitud drop column if exists numero;

alter table public.sucursal drop constraint if exists sucursal_ultimo_numero_solicitud_check;
alter table public.sucursal drop column if exists ultimo_numero_solicitud;

commit;

-- delete from public.sucursal su
-- where su.id between 101 and 145
--   and not exists (select 1 from public.solicitud s where s.sucursal = su.id or s.sucursal_destino = su.id)
--   and not exists (select 1 from public.vehiculo v where v.ubicacion = su.id)
--   and not exists (select 1 from public.usuario u where u.sucursal_id = su.id)
--   and not exists (select 1 from public.traslado_interno t where t.origen_id = su.id or t.destino_id = su.id);
