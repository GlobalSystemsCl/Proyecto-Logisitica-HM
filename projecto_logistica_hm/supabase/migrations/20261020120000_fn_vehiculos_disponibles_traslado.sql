-- =============================================================================
-- Búsqueda de vehículos para traslados internos: fn_vehiculos_disponibles_traslado
-- =============================================================================
-- Problema: TrasladoService.getVehiculosParaTraslado leía todos los vehículos
-- reservados o vendidos y los excluía con `not id in (uuid, uuid, ...)` dentro
-- de la URL de PostgREST. Cada uuid suma ~37 caracteres: con unos cientos de
-- vendidos (crecen ~1200 al mes) la petición falla por largo de URL y la UI
-- muestra "No se encontraron vehículos". Además esas listas se cortaban en
-- 1000 filas y el orden por patente (todas NULL hoy) no era estable al paginar.
--
-- Qué hace: la exclusión, los filtros, el orden y la paginación pasan a SQL.
--   * Excluye los vehículos reservados en una solicitud activa
--     (fn_estados_reserva_activos, misma lista que ESTADOS_ACTIVOS_RESERVA) y
--     los vendidos.
--   * Filtros opcionales: búsqueda por patente o chasis (solo alfanuméricos y
--     guiones, como sanitizarTerminoBusqueda), sucursal y marca.
--   * Orden por chasis (único) y paginación con límite de 1 a 100.
--   * total = cantidad de coincidencias (igual en todas las filas).
--
-- Solo service_role la ejecuta (la app consulta con el cliente admin).
--
-- Rollback: supabase/rollback/20261020120000_fn_vehiculos_disponibles_traslado.sql
-- =============================================================================

begin;

create or replace function public.fn_vehiculos_disponibles_traslado(
  p_busqueda       text   default null,
  p_sucursal_id    bigint default null,
  p_marca          text   default null,
  p_limite         int    default 12,
  p_desplazamiento int    default 0
)
returns table (
  id               uuid,
  chasis           varchar,
  patente          varchar,
  marca            varchar,
  modelo           varchar,
  anio             int,
  color            varchar,
  ubicacion        bigint,
  ubicacion_nombre varchar,
  total            bigint
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with filtro as (
    select nullif(left(regexp_replace(coalesce(p_busqueda, ''), '[^A-Za-z0-9-]', '', 'g'), 30), '') as termino
  ),
  candidatos as (
    select v.id, v.chasis, v.patente, v.marca, v.modelo, v.anio, v.color, v.ubicacion
    from public.vehiculo v, filtro f
    where not exists (
            select 1
            from public.solicitud_vehiculo sv
            join public.solicitud s on s.id = sv.solicitud_id
            where sv.vehiculo_id = v.id
              and sv.disponibilidad = 'reservado'
              and s.estado = any (public.fn_estados_reserva_activos())
          )
      and not exists (
            select 1
            from public.solicitud_vehiculo sv
            where sv.vehiculo_id = v.id
              and sv.disponibilidad = 'vendido'
          )
      and (p_sucursal_id is null or v.ubicacion = p_sucursal_id)
      and (p_marca is null or v.marca = p_marca)
      and (f.termino is null
           or v.patente ilike '%' || f.termino || '%'
           or v.chasis  ilike '%' || f.termino || '%')
  )
  select c.id, c.chasis, c.patente, c.marca, c.modelo, c.anio, c.color, c.ubicacion,
         su.nombre as ubicacion_nombre,
         count(*) over () as total
  from candidatos c
  left join public.sucursal su on su.id = c.ubicacion
  order by c.chasis, c.id
  limit greatest(least(coalesce(p_limite, 12), 100), 1)
  offset greatest(coalesce(p_desplazamiento, 0), 0);
$$;

revoke execute on function public.fn_vehiculos_disponibles_traslado(text, bigint, text, int, int) from public, anon, authenticated;
grant execute on function public.fn_vehiculos_disponibles_traslado(text, bigint, text, int, int) to service_role;

commit;
