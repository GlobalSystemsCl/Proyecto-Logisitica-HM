-- =============================================================================
-- Limpieza única — Sucursales de prueba TEST-SUC (ids 407 y 408)
-- =============================================================================
-- Restos de la suite de integración antigua (creadas el 2026-09-07) que
-- quedaron en producción. Decisión del responsable (2026-10-13): borrarlas.
--
-- Estado verificado el 2026-10-13:
--   * 2 solicitudes priorizadas (una por sucursal, origen = destino) que
--     reservaban 2 vehículos reales del stock (BAI, chasis LNBSCUAK4TR244549 y
--     LNBSCUAK7TR230452). Al borrarlas, esos vehículos vuelven a estar
--     disponibles.
--   * Sin vehículos ubicados, usuarios asignados, traslados, observaciones,
--     documentos ni insistencias. Quedan 4 registros en `auditoria` como
--     historial (no tienen FK a solicitud).
--
-- Orden: primero las solicitudes (la FK solicitud.sucursal es RESTRICT; sus
-- reservas, observaciones, documentos e insistencias se borran en cascada) y
-- después las sucursales. Si algo no coincide con lo esperado, aborta sin
-- borrar nada.
--
-- Ejecutar UNA vez en el SQL Editor. No es una migración (es una corrección de
-- datos de producción) y no tiene rollback: los datos borrados son de prueba.
-- =============================================================================

begin;

do $$
declare
  v_ids constant bigint[] := array[407, 408];
  v_n   bigint;
begin
  -- Solo sucursales de prueba
  select count(*) into v_n
  from public.sucursal
  where id = any (v_ids) and nombre like 'TEST-SUC-%';
  if v_n <> 2 then
    raise exception 'Abortado: se esperaban 2 sucursales TEST-SUC con ids 407 y 408 (hay %).', v_n;
  end if;

  -- Ninguna dependencia fuera de las solicitudes de prueba
  if exists (select 1 from public.usuario where sucursal_id = any (v_ids))
     or exists (select 1 from public.vehiculo where ubicacion = any (v_ids))
     or exists (select 1 from public.traslado_interno where origen_id = any (v_ids) or destino_id = any (v_ids)) then
    raise exception 'Abortado: hay usuarios, vehículos o traslados que apuntan a las sucursales TEST-SUC.';
  end if;

  -- Ninguna solicitud mezcla una sucursal de prueba con una real
  if exists (
    select 1 from public.solicitud
    where (sucursal = any (v_ids) and sucursal_destino is not null and not sucursal_destino = any (v_ids))
       or (sucursal_destino = any (v_ids) and not sucursal = any (v_ids))
  ) then
    raise exception 'Abortado: hay solicitudes reales con origen o destino en una sucursal TEST-SUC.';
  end if;

  delete from public.solicitud
  where sucursal = any (v_ids) or sucursal_destino = any (v_ids);
  get diagnostics v_n = row_count;
  raise notice 'Solicitudes de prueba borradas: %', v_n;

  delete from public.sucursal where id = any (v_ids);
  get diagnostics v_n = row_count;
  raise notice 'Sucursales de prueba borradas: %', v_n;
end;
$$;

commit;

-- -----------------------------------------------------------------------------
-- Verificación (ejecutar por separado)
-- -----------------------------------------------------------------------------
-- select count(*) from public.sucursal where nombre like 'TEST-SUC-%';      -> 0
-- Los 2 vehículos ya no están reservados en ninguna solicitud activa:
-- select v.chasis, sv.disponibilidad, s.estado
-- from public.vehiculo v
-- left join public.solicitud_vehiculo sv on sv.vehiculo_id = v.id
-- left join public.solicitud s on s.id = sv.solicitud_id
-- where v.chasis in ('LNBSCUAK4TR244549', 'LNBSCUAK7TR230452');
