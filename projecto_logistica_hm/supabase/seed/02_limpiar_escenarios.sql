-- =============================================================================
-- Limpieza de los datos de prueba creados por 01_poblar_escenarios.sql
-- =============================================================================
--
-- Borra solo lo marcado con el prefijo `5eed` y lo que la app haya colgado de
-- esas solicitudes y traslados mientras se probaba (observaciones, auditoría,
-- vehículos agregados, documentos). Deja los vehículos como estaban antes del
-- poblamiento y recalcula los contadores de slots de las sucursales tocadas.
--
-- Idempotente: si no hay datos de prueba, no cambia nada.
--
-- Documentos: si durante las pruebas se subieron archivos a una solicitud de
-- prueba, aquí se borran sus filas, pero los archivos quedan en el bucket
-- `solicitud-documentos`. Sus rutas se listan con NOTICE para borrarlos desde
-- el dashboard de Storage.
-- =============================================================================

begin;

do $$
declare
  v_suc     bigint;
  v_ids     uuid[];
  v_rutas   text;
  v_sol     int;
  v_tras    int;
  v_aud     int;
begin
  create temp table seed_sol on commit drop as
    select id, sucursal, sucursal_destino from public.solicitud where id::text like '5eed0001-%';
  create temp table seed_tras on commit drop as
    select id, origen_id, destino_id, estado from public.traslado_interno where id::text like '5eed0006-%';

  select count(*) into v_sol from seed_sol;
  select count(*) into v_tras from seed_tras;
  if v_sol = 0 and v_tras = 0 then
    raise notice 'No hay datos de prueba que limpiar.';
    return;
  end if;

  -- Todas las reservas de las solicitudes de prueba, incluidas las que la app
  -- haya agregado durante las pruebas (sus ids no llevan el prefijo).
  create temp table seed_sv on commit drop as
    select sv.id, sv.vehiculo_id from public.solicitud_vehiculo sv where sv.solicitud_id in (select id from seed_sol);

  create temp table seed_suc on commit drop as
    select sucursal as id from seed_sol
    union select sucursal_destino from seed_sol where sucursal_destino is not null
    union select origen_id from seed_tras
    union select destino_id from seed_tras;

  -- ---- Traslados internos --------------------------------------------------
  -- El vehículo de un traslado recepcionado volvió a quedar en el destino:
  -- regresa al origen, salvo que después se haya movido por otra vía.
  update public.vehiculo v
  set ubicacion = t.origen_id
  from public.traslado_interno_vehiculo tv
  join seed_tras t on t.id = tv.traslado_id
  where tv.vehiculo_id = v.id
    and t.estado = 'recepcionado'
    and v.ubicacion = t.destino_id;

  -- Traslados aún pendientes o en tránsito: su reserva sumó 1 a los slots
  -- reservados del destino y no hay trigger de borrado que la descuente.
  update public.sucursal s
  set slots_reservados = greatest(s.slots_reservados - x.cantidad, 0)
  from (
    select t.destino_id, count(*) as cantidad
    from public.traslado_interno_vehiculo tv
    join seed_tras t on t.id = tv.traslado_id
    where tv.disponibilidad = 'reservado'
    group by t.destino_id
  ) x
  where s.id = x.destino_id;

  delete from public.traslado_interno_vehiculo where traslado_id in (select id from seed_tras);
  delete from public.traslado_interno where id in (select id from seed_tras);

  -- ---- Solicitudes ------------------------------------------------------------
  select string_agg(ruta_storage, ', ') into v_rutas
  from public.solicitud_documento where solicitud_id in (select id from seed_sol);
  if v_rutas is not null then
    raise notice 'Archivos de Storage que quedan huérfanos (bucket solicitud-documentos): %', v_rutas;
  end if;
  delete from public.solicitud_documento where solicitud_id in (select id from seed_sol);

  -- Las reservas se borran antes que la solicitud: el trigger de borrado lee
  -- el estado de la solicitud para descontar los slots de las activas.
  delete from public.solicitud_vehiculo where id in (select id from seed_sv);
  delete from public.insistencia where solicitud_id in (select id from seed_sol);
  delete from public.observacion where solicitud_id in (select id from seed_sol);
  delete from public.solicitud where id in (select id from seed_sol);

  -- Los vehículos de las solicitudes de prueba salieron del stock sin
  -- ubicación. Vuelven a quedar así, salvo que otra solicitud o traslado real
  -- los esté usando.
  update public.vehiculo v
  set ubicacion = null
  where v.id in (select vehiculo_id from seed_sv)
    and v.ubicacion is not null
    and not exists (select 1 from public.solicitud_vehiculo sv where sv.vehiculo_id = v.id)
    and not exists (select 1 from public.traslado_interno_vehiculo tv where tv.vehiculo_id = v.id);

  -- ---- Notificaciones ----------------------------------------------------------
  -- Las de 06_poblar_notificaciones.sql y las que la app creó al avanzar
  -- solicitudes o traslados de prueba.
  delete from public.notificacion n
  where n.id::text like '5eed0008-%'
     or n.entidad_id in (select id from seed_sol)
     or n.entidad_id in (select id from seed_tras);

  -- ---- Auditoría --------------------------------------------------------------
  delete from public.auditoria a
  where a.id::text like '5eed0004-%'
     or a.entidad_id in (select id from seed_sol)
     or a.entidad_id in (select id from seed_tras)
     or a.entidad_id in (select id from seed_sv);
  get diagnostics v_aud = row_count;

  -- ---- Colas y contadores ------------------------------------------------------
  -- Compacta las colas de prioridad (como eliminarSolicitud) y recalcula la
  -- ocupación con la función de la BD.
  for v_suc in select id from seed_suc loop
    update public.solicitud set posicion_prioridad = null
    where sucursal = v_suc and estado <> 'priorizada' and posicion_prioridad is not null;

    select array_agg(id order by posicion_prioridad) into v_ids
    from public.solicitud
    where sucursal = v_suc and estado = 'priorizada' and posicion_prioridad is not null;
    if v_ids is not null then
      update public.solicitud set posicion_prioridad = null where id = any(v_ids);
      for i in 1 .. array_length(v_ids, 1) loop
        update public.solicitud set posicion_prioridad = i where id = v_ids[i];
      end loop;
    end if;

    perform public.fn_recalcular_slots_ocupados(v_suc);
  end loop;

  raise notice 'Limpieza terminada: % solicitudes, % traslados y % registros de auditoría eliminados.', v_sol, v_tras, v_aud;
end
$$;

commit;
