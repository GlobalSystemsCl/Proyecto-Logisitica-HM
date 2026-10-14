-- =============================================================================
-- Validación de los datos de prueba (solo lectura)
-- =============================================================================
--
-- Devuelve una fila por control: `ok` = true si se cumple, y el detalle de lo
-- que falla. Las pruebas de RLS cambian de rol dentro de la transacción y al
-- final se hace ROLLBACK: no modifica nada.
-- =============================================================================

begin;

create temp table seed_check (
  orden   serial,
  control text,
  ok      boolean,
  detalle text
) on commit drop;

create temp view seed_sol as
  select * from public.solicitud where id::text like '5eed0001-%';

-- Eventos de cambio de estado de la auditoría, en orden.
create temp view seed_hist as
  select a.entidad_id as solicitud_id, a.accion, a.created_at,
         a.valor_anterior->>'estado' as desde, a.valor_nuevo->>'estado' as hacia,
         row_number() over (partition by a.entidad_id order by a.created_at, a.id) as paso
  from public.auditoria a
  where a.entidad = 'solicitud'
    and a.entidad_id in (select id from seed_sol)
    and a.valor_nuevo ? 'estado'
    and a.valor_anterior ? 'estado'
    and a.valor_anterior->>'estado' is distinct from a.valor_nuevo->>'estado';

do $$
declare
  v_det text;
  v_n   int;
begin
  -- 1. Vehículos -----------------------------------------------------------------
  select string_agg(right(s.id::text, 2), ', ') into v_det
  from seed_sol s where not exists (select 1 from public.solicitud_vehiculo sv where sv.solicitud_id = s.id);
  insert into seed_check (control, ok, detalle) values
    ('Toda solicitud tiene al menos un vehículo', v_det is null, v_det);

  select string_agg(sv.vehiculo_id::text, ', ') into v_det
  from public.solicitud_vehiculo sv left join public.vehiculo v on v.id = sv.vehiculo_id
  where sv.solicitud_id in (select id from seed_sol) and v.id is null;
  insert into seed_check (control, ok, detalle) values
    ('Todos los vehículos existen en el inventario', v_det is null, v_det);

  select string_agg(x.vehiculo_id::text, ', ') into v_det from (
    select sv.vehiculo_id from public.solicitud_vehiculo sv join public.solicitud s on s.id = sv.solicitud_id
    where sv.disponibilidad = 'reservado'
      and s.estado in ('pendiente_aprobacion','aprobada','pendiente','priorizada','asignada','calendarizada','despachada','en_transito','entregada')
    group by sv.vehiculo_id having count(*) > 1) x;
  insert into seed_check (control, ok, detalle) values
    ('Ningún vehículo reservado en dos solicitudes activas (toda la BD)', v_det is null, v_det);

  select string_agg(right(s.id::text, 2) || ':' || s.estado || '/' || sv.disponibilidad, ', ') into v_det
  from seed_sol s join public.solicitud_vehiculo sv on sv.solicitud_id = s.id
  where not (
       (s.estado in ('pendiente_aprobacion','aprobada','priorizada','asignada','calendarizada','en_transito') and sv.disponibilidad = 'reservado')
    or (s.estado in ('rechazada','cancelada') and sv.disponibilidad = 'liberado')
    or (s.estado in ('entregada','finalizada') and s.tipo_solicitud = 'evento' and sv.disponibilidad = 'liberado')
    or (s.estado = 'entregada' and s.tipo_solicitud = 'venta' and sv.disponibilidad = 'reservado')
    or (s.estado = 'finalizada' and s.tipo_solicitud = 'venta' and sv.disponibilidad = 'vendido'));
  insert into seed_check (control, ok, detalle) values
    ('Disponibilidad del vehículo coherente con el estado', v_det is null, v_det);

  select string_agg(right(s.id::text, 2), ', ') into v_det
  from seed_sol s join public.solicitud_vehiculo sv on sv.solicitud_id = s.id join public.vehiculo v on v.id = sv.vehiculo_id
  where (s.estado = 'entregada' and s.tipo_solicitud = 'venta' and v.ubicacion is distinct from s.sucursal_destino)
     or (s.estado = 'finalizada' and s.tipo_solicitud = 'venta' and v.ubicacion is not null);
  insert into seed_check (control, ok, detalle) values
    ('Ubicación física: recibida = en destino, vendida = fuera del inventario', v_det is null, v_det);

  -- 2. Responsables ---------------------------------------------------------------
  select string_agg(right(s.id::text, 2), ', ') into v_det
  from seed_sol s
  left join public.usuario e on e.id = s.ejecutivo_id
  left join public.usuario j on j.id = s.jefe_local_id
  left join public.usuario l on l.id = s.logistica_id
  where (s.ejecutivo_id is not null and e.rol <> 'ejecutivo')
     or j.rol is distinct from 'jefe_local'
     or (s.logistica_id is not null and l.rol not in ('logistica', 'administrador'))
     or (e.id is not null and e.sucursal_id <> s.sucursal);
  insert into seed_check (control, ok, detalle) values
    ('Ejecutivo, jefe de local y encargado con el rol y la sucursal correctos', v_det is null, v_det);

  select string_agg(right(s.id::text, 2), ', ') into v_det
  from seed_sol s
  where s.estado in ('asignada','calendarizada','en_transito','entregada','finalizada') and s.logistica_id is null
     or s.estado in ('pendiente_aprobacion','aprobada','priorizada','rechazada') and s.logistica_id is not null
       and not exists (select 1 from seed_hist h where h.solicitud_id = s.id and h.hacia = 'asignada');
  insert into seed_check (control, ok, detalle) values
    ('Encargado de Logística solo desde la asignación o calendarización', v_det is null, v_det);

  -- 3. Historial ------------------------------------------------------------------
  -- Cada cambio parte del estado en que dejó la solicitud el cambio anterior.
  select string_agg(right(h.solicitud_id::text, 2) || ' paso ' || h.paso, ', ') into v_det
  from seed_hist h join seed_hist prev on prev.solicitud_id = h.solicitud_id and prev.paso = h.paso - 1
  where h.desde is distinct from prev.hacia;
  insert into seed_check (control, ok, detalle) values
    ('Historial encadenado (cada transición parte del estado anterior)', v_det is null, v_det);

  -- El primer cambio parte del estado inicial que fija el creador.
  select string_agg(right(s.id::text, 2), ', ') into v_det
  from seed_sol s join seed_hist h on h.solicitud_id = s.id and h.paso = 1
  join public.usuario c on c.id = coalesce(
    (select a.usuario_id from public.auditoria a where a.entidad_id = s.id and a.accion = 'ASIGNACION_VEHICULO' order by a.created_at limit 1),
    s.ejecutivo_id)
  where h.desde <> case when c.rol = 'jefe_local' then 'aprobada' else 'pendiente_aprobacion' end;
  insert into seed_check (control, ok, detalle) values
    ('Estado inicial según el rol creador (JL: aprobada; ejecutivo: pendiente)', v_det is null, v_det);

  -- El último cambio deja la solicitud en su estado actual.
  select string_agg(right(s.id::text, 2), ', ') into v_det
  from seed_sol s
  left join lateral (select hacia from seed_hist h where h.solicitud_id = s.id order by paso desc limit 1) u on true
  where coalesce(u.hacia, case when s.jefe_local_id is not null and s.ejecutivo_id is null then 'aprobada' else 'pendiente_aprobacion' end)
        is distinct from s.estado::text
    and not (u.hacia is null and s.estado in ('aprobada', 'pendiente_aprobacion'));
  insert into seed_check (control, ok, detalle) values
    ('El estado actual coincide con el último registro del historial', v_det is null, v_det);

  -- Pasos previos obligatorios por etapa.
  select string_agg(right(s.id::text, 2), ', ') into v_det
  from seed_sol s
  where (s.estado in ('en_transito','entregada','finalizada')
         and not exists (select 1 from seed_hist h where h.solicitud_id = s.id and h.hacia = 'calendarizada'))
     or (s.estado in ('entregada','finalizada')
         and not exists (select 1 from seed_hist h where h.solicitud_id = s.id and h.hacia = 'en_transito'))
     or (s.estado = 'finalizada'
         and not exists (select 1 from seed_hist h where h.solicitud_id = s.id and h.hacia = 'entregada'))
     or (s.estado = 'calendarizada'
         and not exists (select 1 from seed_hist h where h.solicitud_id = s.id and h.desde in ('priorizada','asignada') and h.hacia = 'calendarizada'))
     or (s.ejecutivo_id is not null and s.estado not in ('pendiente_aprobacion','rechazada')
         and not exists (select 1 from seed_hist h where h.solicitud_id = s.id and h.hacia in ('aprobada','cancelada'))
         and not exists (select 1 from public.auditoria a where a.entidad_id = s.id and a.accion = 'delegacion'));
  insert into seed_check (control, ok, detalle) values
    ('Cada etapa tiene registrados sus pasos previos', v_det is null, v_det);

  select string_agg(right(s.id::text, 2), ', ') into v_det
  from seed_sol s
  where (s.estado = 'rechazada' and not exists (
           select 1 from public.observacion o where o.solicitud_id = s.id and o.observacion like '[RECHAZO]%'))
     or (s.estado = 'cancelada' and length(coalesce(s.motivo_cancelacion, '')) < 5);
  insert into seed_check (control, ok, detalle) values
    ('Rechazos y cancelaciones con motivo', v_det is null, v_det);

  -- 4. Fechas ---------------------------------------------------------------------
  select string_agg(right(s.id::text, 2), ', ') into v_det
  from seed_sol s
  where s.fecha_creacion > now()
     or s.fecha_confirmacion < s.fecha_creacion
     or s.fecha_inicio_transito < coalesce(s.fecha_confirmacion, s.fecha_creacion)
     or s.fecha_recepcion < s.fecha_inicio_transito
     or s.fecha_entrega_cliente < s.fecha_recepcion
     or (s.estado in ('en_transito','entregada','finalizada') and s.fecha_despacho is null)
     or (s.estado in ('entregada','finalizada') and s.fecha_recepcion is null)
     or (s.estado = 'finalizada' and s.fecha_entrega_cliente is null)
     or (s.ejecutivo_id is not null and s.estado not in ('pendiente_aprobacion','rechazada','cancelada')
         and s.fecha_confirmacion is null
         and not exists (select 1 from public.auditoria a where a.entidad_id = s.id and a.accion = 'delegacion'));
  insert into seed_check (control, ok, detalle) values
    ('Fechas de flujo completas y en orden', v_det is null, v_det);

  select string_agg(distinct right(a.entidad_id::text, 2), ', ') into v_det
  from public.auditoria a join seed_sol s on s.id = a.entidad_id
  where a.created_at < s.fecha_creacion or a.created_at > now();
  insert into seed_check (control, ok, detalle) values
    ('Auditoría entre la creación y ahora', v_det is null, v_det);

  select string_agg(right(h.solicitud_id::text, 2), ', ') into v_det
  from seed_hist h join seed_hist prev on prev.solicitud_id = h.solicitud_id and prev.paso = h.paso - 1
  where h.created_at < prev.created_at;
  insert into seed_check (control, ok, detalle) values
    ('Transiciones en orden cronológico', v_det is null, v_det);

  select string_agg(distinct right(o.solicitud_id::text, 2), ', ') into v_det
  from public.observacion o join seed_sol s on s.id = o.solicitud_id
  where o.created_at < s.fecha_creacion or o.created_at > now();
  insert into seed_check (control, ok, detalle) values
    ('Observaciones entre la creación y ahora', v_det is null, v_det);

  select string_agg(right(s.id::text, 2), ', ') into v_det
  from seed_sol s where s.estado = 'calendarizada'
    and s.fecha_tentativa_despacho::date < (now() at time zone 'America/Santiago')::date;
  insert into seed_check (control, ok, detalle) values
    ('Calendarizadas con despacho programado desde hoy en adelante', v_det is null, v_det);

  -- 5. Colas de prioridad -----------------------------------------------------------
  select string_agg(right(s.id::text, 2), ', ') into v_det
  from seed_sol s where (s.estado = 'priorizada') <> (s.posicion_prioridad is not null);
  insert into seed_check (control, ok, detalle) values
    ('Solo las priorizadas tienen posición en la cola', v_det is null, v_det);

  select string_agg(sucursal::text, ', ') into v_det from (
    select sucursal from public.solicitud where estado = 'priorizada' and posicion_prioridad is not null
    group by sucursal having max(posicion_prioridad) <> count(*) or min(posicion_prioridad) <> 1) x;
  insert into seed_check (control, ok, detalle) values
    ('Colas compactas 1..N en todas las sucursales', v_det is null, v_det);

  -- 6. Traslados internos -------------------------------------------------------------
  select string_agg(right(t.id::text, 1) || ':' || t.estado || '/' || tv.disponibilidad, ', ') into v_det
  from public.traslado_interno t join public.traslado_interno_vehiculo tv on tv.traslado_id = t.id
  join public.vehiculo v on v.id = tv.vehiculo_id
  where t.id::text like '5eed0006-%'
    and not ((t.estado in ('pendiente','en_transito') and tv.disponibilidad = 'reservado' and v.ubicacion = t.origen_id)
          or (t.estado = 'recepcionado' and tv.disponibilidad = 'liberado' and v.ubicacion = t.destino_id)
          or (t.estado = 'cancelado' and tv.disponibilidad = 'liberado'));
  insert into seed_check (control, ok, detalle) values
    ('Traslados: reserva y ubicación del vehículo coherentes', v_det is null, v_det);

  -- 7. Duplicados -----------------------------------------------------------------------
  select count(*) into v_n from (
    select entidad_id, accion, created_at from public.auditoria where id::text like '5eed0004-%'
      and accion <> 'ASIGNACION_VEHICULO'
    group by 1, 2, 3 having count(*) > 1) x;
  insert into seed_check (control, ok, detalle) values
    ('Sin registros de auditoría duplicados', v_n = 0, case when v_n > 0 then v_n || ' duplicados' end);

  -- 8. Slots (informativo: los contadores ya estaban desfasados antes, brecha 011) ----
  select string_agg(format('%s: ocupados %s/%s, reservados %s/%s', x.id, x.ocupados, x.ocupados_calc, x.reservados, x.reservados_calc), '; ')
  into v_det from (
    select s.id, s.slots_ocupados as ocupados, s.slots_reservados as reservados,
      (select count(*) from public.vehiculo v where v.ubicacion = s.id)
      + (select count(*) from public.solicitud_vehiculo sv join public.solicitud so on so.id = sv.solicitud_id
         where so.sucursal_destino = s.id and sv.disponibilidad = 'reservado'
           and so.estado in ('pendiente_aprobacion','aprobada','pendiente','priorizada','asignada','calendarizada','despachada','en_transito')) as ocupados_calc,
      (select count(*) from public.solicitud_vehiculo sv join public.solicitud so on so.id = sv.solicitud_id
         where so.sucursal_destino = s.id and sv.disponibilidad = 'reservado'
           and so.estado in ('pendiente_aprobacion','aprobada','pendiente','priorizada','asignada','calendarizada','despachada','en_transito'))
      + (select count(*) from public.traslado_interno_vehiculo tv join public.traslado_interno t on t.id = tv.traslado_id
         where t.destino_id = s.id and tv.disponibilidad = 'reservado') as reservados_calc
    from public.sucursal s where s.id in (6, 7, 8, 9)) x
  where x.ocupados <> x.ocupados_calc or x.reservados <> x.reservados_calc;
  insert into seed_check (control, ok, detalle) values
    ('[Informativo] Slots guardados = recálculo (guardado/calculado)', v_det is null, v_det);
end
$$;

-- 9. RLS: qué ve cada usuario por la API REST con su sesión ------------------------
-- Se compara lo que devuelve la BD con la regla de la policy
-- solicitud_select_participantes, y se comprueba que solo el administrador lee
-- la auditoría.
do $$
declare
  u        record;
  v_ve     int;
  v_esp    int;
  v_aud    int;
  v_obs    int;
  v_obs_esp int;
begin
  for u in
    select id, rol, nombre || ' ' || apellido as nombre, sucursal_id
    from public.usuario
    where id in ('ec508755-1bed-40df-9c2e-023919047520', '1ab3340c-2698-4728-8591-c9b7b829a9ce',
                 '1442fbe2-a3d8-42d4-bf76-b581bb6562e0', 'c984ae01-e66a-4d18-a025-57638567fa86',
                 '9b0a00d5-7615-4d25-b418-cfb16061861a', '47ef25df-78f1-4ec2-9d33-e2187d3b6cdb',
                 '194aafc2-7fe3-47ac-937d-4e7d0b4915fc')
  loop
    select count(*) into v_esp from seed_sol s
    where u.rol = 'administrador' or s.ejecutivo_id = u.id or s.jefe_local_id = u.id or s.logistica_id = u.id
       or (u.rol = 'jefe_local' and s.estado in ('pendiente', 'priorizada') and s.sucursal = u.sucursal_id);
    select count(*) into v_obs_esp from public.observacion o join seed_sol s on s.id = o.solicitud_id
    where u.rol = 'administrador' or s.ejecutivo_id = u.id or s.jefe_local_id = u.id or s.logistica_id = u.id;

    perform set_config('request.jwt.claims', json_build_object('sub', u.id, 'role', 'authenticated')::text, true);
    perform set_config('role', 'authenticated', true);
    select count(*) into v_ve from public.solicitud where id::text like '5eed0001-%';
    select count(*) into v_aud from public.auditoria where id::text like '5eed0004-%';
    select count(*) into v_obs from public.observacion where solicitud_id::text like '5eed0001-%';
    perform set_config('role', 'none', true);

    insert into seed_check (control, ok, detalle) values (
      format('RLS %s (%s)', u.rol, u.nombre),
      v_ve = v_esp and v_obs = v_obs_esp and ((u.rol = 'administrador') = (v_aud > 0)),
      format('solicitudes %s (esperado %s), observaciones %s (esperado %s), auditoría %s', v_ve, v_esp, v_obs, v_obs_esp, v_aud));
  end loop;
end
$$;

select control, ok, detalle from seed_check order by orden;

rollback;
