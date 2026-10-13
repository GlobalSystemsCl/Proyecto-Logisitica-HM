-- =============================================================================
-- Brecha 011 (paso 4) — Recálculo único de los contadores de todas las sucursales
-- =============================================================================
-- Corrige los contadores que quedaron desfasados con el mecanismo anterior.
-- Medido en producción el 2026-10-13 (guardado -> real):
--   7 CONCON:      ocupados 5 -> 6,  reservados 3 -> 2
--   9 VALPARAISO:  ocupados 41 -> 40
--   408 TEST-SUC:  ocupados 2 -> 1,  reservados 2 -> 1
-- El resto ya coincidía y no cambia (fn_recalcular_slots_sucursal solo
-- escribe si algún valor es distinto). Se puede volver a ejecutar sin efectos
-- secundarios.
--
-- Requiere: 20261013130000, 20261013140000 y 20261013150000.
-- Rollback: no aplica (corrección de datos; los valores anteriores eran
-- incorrectos y quedan registrados arriba).
-- =============================================================================

begin;

do $$
declare
  v_sucursal bigint;
begin
  for v_sucursal in select s.id from public.sucursal s order by s.id loop
    perform public.fn_recalcular_slots_sucursal(v_sucursal);
  end loop;
end;
$$;

commit;

-- -----------------------------------------------------------------------------
-- Verificación posterior (ejecutar por separado): debe devolver 0 filas
-- -----------------------------------------------------------------------------
-- with f as (select ubicacion sid, count(*) n from public.vehiculo where ubicacion is not null group by 1),
-- rs as (select sol.sucursal_destino sid, count(*) n
--        from public.solicitud_vehiculo sv join public.solicitud sol on sol.id = sv.solicitud_id
--        where sv.disponibilidad = 'reservado' and sol.tipo_solicitud <> 'evento'
--          and sol.estado = any (public.fn_estados_reserva_activos()) group by 1),
-- rt as (select t.destino_id sid, count(*) n
--        from public.traslado_interno_vehiculo tiv join public.traslado_interno t on t.id = tiv.traslado_id
--        where tiv.disponibilidad = 'reservado' and t.estado in ('pendiente', 'en_transito') group by 1)
-- select s.id, s.slots_ocupados, s.slots_reservados
-- from public.sucursal s
-- left join f on f.sid = s.id left join rs on rs.sid = s.id left join rt on rt.sid = s.id
-- where s.slots_ocupados is distinct from coalesce(f.n, 0) + coalesce(rs.n, 0) + coalesce(rt.n, 0)
--    or s.slots_reservados is distinct from coalesce(rs.n, 0) + coalesce(rt.n, 0);
