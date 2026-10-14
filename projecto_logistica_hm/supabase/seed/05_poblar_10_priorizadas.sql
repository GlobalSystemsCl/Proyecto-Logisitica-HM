-- =============================================================================
-- Datos de prueba: 10 solicitudes priorizadas creadas hoy (S1101..S1110)
-- =============================================================================
--
-- Para probar el módulo de Logística (asignar encargado, programar, despachar)
-- con "joaquin logistica" (zona 1: 15 Norte, Concón y Valparaíso).
--
-- Cada solicitud recorre las mismas transiciones que SolicitudesService, con
-- horas de hoy ya pasadas:
--   S1101..S1104  ejecutivo de Valparaíso crea → jefe de local aprueba → prioriza
--   S1105..S1108  ejecutivo de 15 Norte crea → jefe de local aprueba → prioriza
--   S1109..S1110  jefe de local de Concón crea (aprobada al crear) → prioriza
-- Quedan al final de la cola de cada sucursal. Vehículos del stock sin
-- ubicación ni historial (1 o 2 por solicitud). Los triggers reales reservan
-- los vehículos y recalculan los slots.
--
-- Marca `5eed`: 02_limpiar_escenarios.sql las borra junto con las demás.
-- No envía correos ni crea notificaciones (escribe directo en la BD).
-- Idempotente: si S1101 ya existe, no hace nada. Una sola transacción.
-- =============================================================================

begin;

do $$
declare
  c_ej9 constant uuid := 'ec508755-1bed-40df-9c2e-023919047520';  -- ejecutivo, VALPARAISO
  c_ej6 constant uuid := '1ab3340c-2698-4728-8591-c9b7b829a9ce';  -- ejecutivo, 15 NORTE
  c_jl6 constant uuid := '1442fbe2-a3d8-42d4-bf76-b581bb6562e0';  -- jefe de local 15 NORTE (encargado de VALPARAISO)
  c_jl7 constant uuid := 'c984ae01-e66a-4d18-a025-57638567fa86';  -- jefe de local CONCON
  v_hoy  date := (now() at time zone 'America/Santiago')::date;
  v_n    int;
  v_id   uuid;
  v_suc  bigint;
  v_crea uuid;
  v_jefe uuid;
  v_nveh int;
  v_lim  timestamptz;
  v_t0   timestamptz;
  v_pos  int;
  v_veh  uuid;
  v_filas int;
  v_obs  text[] := array[
    'Cliente confirmó la compra; necesita el vehículo antes de fin de mes.',
    'Venta cerrada con crédito aprobado.',
    'Cliente pide entrega en la mañana.',
    null, null
  ];
begin
  if exists (select 1 from public.solicitud where id = '5eed0001-0000-4000-8000-000000001101') then
    raise notice 'S1101..S1110 ya existen. No se hizo nada. Para regenerarlas ejecuta antes 02_limpiar_escenarios.sql.';
    return;
  end if;

  -- Validaciones de los actores (igual que la app)
  if (select sucursal_id from public.usuario where id = c_ej9 and rol = 'ejecutivo' and activo) is distinct from 9
     or (select sucursal_id from public.usuario where id = c_ej6 and rol = 'ejecutivo' and activo) is distinct from 6
     or not exists (select 1 from public.sucursal where id in (6, 9) and usuario_id = c_jl6 having count(*) = 2)
     or not exists (select 1 from public.usuario where id = c_jl7 and rol = 'jefe_local' and activo and sucursal_id = 7) then
    raise exception 'Los usuarios de prueba no tienen las sucursales esperadas; revisar antes de poblar.';
  end if;

  for v_n in 1101..1110 loop
    v_id := ('5eed0001-0000-4000-8000-' || lpad(v_n::text, 12, '0'))::uuid;
    v_suc  := case when v_n <= 1104 then 9 when v_n <= 1108 then 6 else 7 end;
    v_crea := case when v_n <= 1104 then c_ej9 when v_n <= 1108 then c_ej6 else c_jl7 end;
    v_jefe := case when v_suc = 7 then c_jl7 else c_jl6 end;
    v_nveh := case when v_n % 3 = 0 then 2 else 1 end;
    v_lim  := (v_hoy + 5 + (v_n % 5))::timestamp at time zone 'UTC';   -- fecha límite como la guarda la app
    v_t0   := now() - make_interval(mins => (1111 - v_n) * 25 + 90);     -- creada hoy, horas atrás

    -- 1. Crear (createSolicitud)
    insert into public.solicitud (
      id, ejecutivo_id, jefe_local_id, estado, fecha_creacion, fecha_actualizacion,
      tipo_solicitud, sucursal, sucursal_destino, fecha_limite
    ) values (
      v_id,
      case when v_crea = c_jl7 then null else v_crea end,
      v_jefe,
      case when v_crea = c_jl7 then 'aprobada' else 'pendiente_aprobacion' end::public.estado_solicitud,
      v_t0, v_t0, 'venta', v_suc, v_suc, v_lim
    );

    for v_veh in
      select v.id from public.vehiculo v
      where v.ubicacion is null
        and not exists (select 1 from public.solicitud_vehiculo sv where sv.vehiculo_id = v.id)
        and not exists (select 1 from public.traslado_interno_vehiculo tv where tv.vehiculo_id = v.id)
      order by v.id
      limit v_nveh
    loop
      insert into public.solicitud_vehiculo (id, solicitud_id, vehiculo_id, disponibilidad, created_at)
      values (('5eed0002' || substr(gen_random_uuid()::text, 9))::uuid, v_id, v_veh, 'reservado', v_t0);
      insert into public.auditoria (id, usuario_id, entidad, entidad_id, accion, valor_anterior, valor_nuevo, created_at)
      values (('5eed0004' || substr(gen_random_uuid()::text, 9))::uuid, v_crea, 'solicitud_vehiculo', v_id,
              'ASIGNACION_VEHICULO', null, jsonb_build_object('solicitud_id', v_id, 'vehiculo_id', v_veh), v_t0);
    end loop;

    if v_obs[1 + v_n % 5] is not null then
      insert into public.observacion (id, solicitud_id, usuario_id, observacion, created_at, updated_at)
      values (('5eed0003' || substr(gen_random_uuid()::text, 9))::uuid, v_id, v_crea, v_obs[1 + v_n % 5], v_t0, v_t0);
    end if;

    -- 2. Aprobar (aprobarSolicitud), salvo las creadas por el jefe de local
    if v_crea <> c_jl7 then
      update public.solicitud
      set estado = 'aprobada', fecha_limite = v_lim, fecha_confirmacion = v_t0 + interval '30 minutes'
      where id = v_id and estado = 'pendiente_aprobacion';
      get diagnostics v_filas = row_count;
      if v_filas <> 1 then raise exception 'S%: no se pudo aprobar', v_n; end if;
      insert into public.auditoria (id, usuario_id, entidad, entidad_id, accion, valor_anterior, valor_nuevo, created_at)
      values (('5eed0004' || substr(gen_random_uuid()::text, 9))::uuid, v_jefe, 'solicitud', v_id, 'aprobacion',
              jsonb_build_object('estado', 'pendiente_aprobacion'),
              jsonb_build_object('estado', 'aprobada', 'fecha_entrega', to_char(v_lim at time zone 'UTC', 'YYYY-MM-DD'),
                                 'fecha_confirmacion', to_char((v_t0 + interval '30 minutes') at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
              v_t0 + interval '30 minutes');
    end if;

    -- 3. Priorizar (priorizarSolicitud): al final de la cola de la sucursal
    select coalesce(max(posicion_prioridad), 0) + 1 into v_pos
    from public.solicitud where sucursal = v_suc and posicion_prioridad is not null;
    update public.solicitud set estado = 'priorizada', posicion_prioridad = v_pos
    where id = v_id and estado = 'aprobada';
    get diagnostics v_filas = row_count;
    if v_filas <> 1 then raise exception 'S%: no se pudo priorizar', v_n; end if;
    insert into public.auditoria (id, usuario_id, entidad, entidad_id, accion, valor_anterior, valor_nuevo, created_at)
    values (('5eed0004' || substr(gen_random_uuid()::text, 9))::uuid, v_jefe, 'solicitud', v_id, 'priorizacion',
            jsonb_build_object('estado', 'aprobada', 'posicion_prioridad', null),
            jsonb_build_object('estado', 'priorizada', 'posicion_prioridad', v_pos),
            v_t0 + interval '50 minutes');
  end loop;

  -- Control final
  select count(*) into v_filas from public.solicitud s
  where s.id between '5eed0001-0000-4000-8000-000000001101' and '5eed0001-0000-4000-8000-000000001110'
    and s.estado = 'priorizada' and s.posicion_prioridad is not null
    and exists (select 1 from public.solicitud_vehiculo sv where sv.solicitud_id = s.id);
  if v_filas <> 10 then raise exception 'Control: se esperaban 10 priorizadas con vehículos (hay %).', v_filas; end if;

  raise notice 'Listo: 10 solicitudes priorizadas (S1101..S1110).';
end
$$;

commit;

-- Verificación (solo lectura):
--   select right(id::text, 4) as s, sucursal, posicion_prioridad, estado, fecha_creacion, fecha_limite
--   from public.solicitud
--   where id between '5eed0001-0000-4000-8000-000000001101' and '5eed0001-0000-4000-8000-000000001110'
--   order by sucursal, posicion_prioridad;
