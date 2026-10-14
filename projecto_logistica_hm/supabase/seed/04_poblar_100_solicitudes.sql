-- =============================================================================
-- Datos de prueba: 100 solicitudes generadas en todas las etapas del flujo
-- =============================================================================
--
-- Genera 100 solicitudes (S1001..S1100) y 6 traslados internos (T1001..T1006)
-- repartidos entre los ejecutivos, jefes de local, Logística y el
-- administrador. Cada solicitud recorre las MISMAS transiciones que hace
-- SolicitudesService, con las validaciones de rol, alcance, estado y fechas
-- de la app, así los triggers reales de la BD se disparan igual que en
-- producción y cada paso queda en la auditoría con su actor y su hora.
--
-- Reparto de estados finales:
--   pendiente_aprobacion 10 · rechazada 6 · cancelada antes del despacho 6
--   aprobada 7 · priorizada 10 · asignada 7 · calendarizada 10
--   en_transito 9 (parte atrasadas) · cancelada en tránsito 3
--   entregada 8 · finalizada 24
--
-- Variantes dentro de cada estado: creadas por ejecutivo o por jefe de local
-- (con o sin delegación), ventas entre sucursales y eventos, 1 a 3 vehículos,
-- aprobaciones del administrador, colas con descalendarizaciones,
-- reprogramaciones, despachos revertidos, recepciones con novedades,
-- entregas fuera de plazo, insistencias y observaciones.
--
-- El reparto es determinista (hash del número de escenario): ejecutarlo de
-- nuevo genera la misma historia, con fechas relativas al día de ejecución.
--
-- Convive con 01_poblar_escenarios.sql (usa otros números) y usa la misma
-- marca `5eed`: 02_limpiar_escenarios.sql borra ambos y
-- 03_validar_escenarios.sql valida ambos.
--
-- Idempotente: si las solicitudes S1001..S1100 ya existen, no hace nada.
-- Toda la ejecución es una transacción: si un paso viola una regla, no queda
-- nada a medias.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- Tablas temporales
-- -----------------------------------------------------------------------------

create temp table seed_actor (
  alias text primary key,
  id    uuid not null,
  rol   public.rol_usuario not null
) on commit drop;

insert into seed_actor (alias, id, rol) values
  ('EJ9', 'ec508755-1bed-40df-9c2e-023919047520', 'ejecutivo'),   -- ejecutivo, VALPARAISO
  ('EJ6', '1ab3340c-2698-4728-8591-c9b7b829a9ce', 'ejecutivo'),   -- ejecutivo, 15 NORTE
  ('JL6', '1442fbe2-a3d8-42d4-bf76-b581bb6562e0', 'jefe_local'),  -- jefe de local 15 NORTE, encargado del resto
  ('JL7', 'c984ae01-e66a-4d18-a025-57638567fa86', 'jefe_local'),  -- jefe de local CONCON
  ('LG',  '9b0a00d5-7615-4d25-b418-cfb16061861a', 'logistica'),   -- logística con la zona 1 (6, 7, 9)
  ('ADM', '194aafc2-7fe3-47ac-937d-4e7d0b4915fc', 'administrador');

-- Stock disponible: sin ubicación y sin ningún historial de reservas ni
-- traslados. Así la limpieza sabe que su estado original es "sin ubicación".
create temp table seed_pool (
  idx         serial primary key,
  vehiculo_id uuid not null unique,
  usado       boolean not null default false
) on commit drop;

-- Vehículos ubicados en una sucursal y libres (para los traslados internos).
create temp table seed_pool_ubicado (
  vehiculo_id uuid primary key,
  ubicacion   bigint not null,
  usado       boolean not null default false
) on commit drop;

create temp table seed_evento (
  seq   serial primary key,
  ts    timestamptz not null,
  n     int not null,
  op    text not null,
  actor text not null,
  p     jsonb not null default '{}'
) on commit drop;

create temp table seed_esperado (
  n      int primary key,
  estado text not null
) on commit drop;

-- -----------------------------------------------------------------------------
-- Helpers (temporales)
-- -----------------------------------------------------------------------------

create function pg_temp.sid(n int) returns uuid language sql immutable
as $$ select ('5eed0001-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid $$;

create function pg_temp.tid(n int) returns uuid language sql immutable
as $$ select ('5eed0006-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid $$;

create function pg_temp.mid(prefijo text) returns uuid language sql volatile
as $$ select (prefijo || substr(gen_random_uuid()::text, 9))::uuid $$;

-- Día D relativo a hoy en Chile.
create function pg_temp.dia(d int) returns date language sql stable
as $$ select (now() at time zone 'America/Santiago')::date + d $$;

-- Fecha "YYYY-MM-DD" tal como la guarda la app (medianoche UTC).
create function pg_temp.fecha(d int) returns timestamptz language sql stable
as $$ select pg_temp.dia(d)::timestamp at time zone 'UTC' $$;

-- Momento del día D a la hora local indicada.
create function pg_temp.t(d int, hora text) returns timestamptz language sql stable
as $$ select (pg_temp.dia(d) + hora::time) at time zone 'America/Santiago' $$;

-- Hace N horas (para los eventos de hoy, siempre en el pasado).
create function pg_temp.hace(horas numeric) returns timestamptz language sql stable
as $$ select now() - make_interval(secs => horas * 3600) $$;

create function pg_temp.iso(ts timestamptz) returns text language sql immutable
as $$ select to_char(ts at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') $$;

create function pg_temp.ymd(ts timestamptz) returns text language sql immutable
as $$ select to_char(ts at time zone 'UTC', 'YYYY-MM-DD') $$;

-- Valor de una columna timestamptz tal como lo devuelve PostgREST.
create function pg_temp.pgts(ts timestamptz) returns text language sql immutable
as $$ select to_char(ts at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"+00:00"') $$;

create function pg_temp.actor(a text) returns uuid language sql stable
as $$ select id from pg_temp.seed_actor where alias = a $$;

create function pg_temp.ev(ts timestamptz, n int, op text, actor text, p jsonb default '{}')
returns void language sql
as $$ insert into pg_temp.seed_evento (ts, n, op, actor, p) values (ts, n, op, actor, p) $$;

create function pg_temp.aud(actor uuid, entidad text, eid uuid, accion text, ant jsonb, nue jsonb, ts timestamptz)
returns void language sql
as $$
  insert into public.auditoria (id, usuario_id, entidad, entidad_id, accion, valor_anterior, valor_nuevo, created_at)
  values (pg_temp.mid('5eed0004'), actor, entidad, eid, accion, ant, nue, ts)
$$;

create function pg_temp.obs(sol uuid, actor uuid, texto text, ts timestamptz)
returns void language sql
as $$
  insert into public.observacion (id, solicitud_id, usuario_id, observacion, created_at, updated_at)
  values (pg_temp.mid('5eed0003'), sol, actor, texto, ts, ts)
$$;

-- Jefe de local de la sucursal (SolicitudesService.getJefeLocalDeSucursal):
-- primero el de sucursal principal, después el encargado de la sucursal.
create function pg_temp.jefe_de(suc bigint) returns uuid language sql stable
as $$
  select coalesce(
    (select u.id from public.usuario u where u.rol = 'jefe_local' and u.sucursal_id = suc order by u.created_at limit 1),
    (select u.id from public.sucursal s join public.usuario u on u.id = s.usuario_id and u.rol = 'jefe_local' where s.id = suc)
  )
$$;

-- Alcance del jefe de local: sucursal principal o sucursal que encabeza.
create function pg_temp.tiene_sucursal(u uuid, suc bigint) returns boolean language sql stable
as $$
  select exists (select 1 from public.usuario where id = u and sucursal_id = suc)
      or exists (select 1 from public.sucursal where id = suc and usuario_id = u)
$$;

-- Alcance de Logística: la sucursal pertenece a una de sus zonas.
create function pg_temp.en_zona(u uuid, suc bigint) returns boolean language sql stable
as $$
  select exists (
    select 1 from public.usuario_zona uz join public.sucursal s on s.zona_id = uz.zona_id
    where uz.usuario_id = u and s.id = suc
  )
$$;

-- SolicitudesService.renumerarColaSucursal: compacta la cola a 1..N.
create function pg_temp.renumerar(suc bigint) returns void language plpgsql
as $$
declare
  v_ids uuid[];
begin
  update public.solicitud set posicion_prioridad = null
  where sucursal = suc and estado <> 'priorizada' and posicion_prioridad is not null;

  select array_agg(id order by posicion_prioridad) into v_ids
  from public.solicitud
  where sucursal = suc and estado = 'priorizada' and posicion_prioridad is not null;
  if v_ids is null then return; end if;

  update public.solicitud set posicion_prioridad = null where id = any(v_ids);
  for i in 1 .. array_length(v_ids, 1) loop
    update public.solicitud set posicion_prioridad = i where id = v_ids[i];
  end loop;
end
$$;

-- Ejecuta un evento con las mismas validaciones y efectos que el service.
create function pg_temp.ejecutar(p_ts timestamptz, p_n int, p_op text, p_alias text, p jsonb)
returns void language plpgsql
as $$
declare
  v_id     uuid := pg_temp.sid(p_n);
  v_tid    uuid := pg_temp.tid(p_n);
  v_actor  uuid := pg_temp.actor(p_alias);
  v_rol    public.rol_usuario;
  v_suc    bigint;
  s        public.solicitud%rowtype;
  tr       public.traslado_interno%rowtype;
  v_pos    bigint;
  v_fecha  timestamptz;
  v_vehs   uuid[];
  v_veh    uuid;
  v_txt    text;
  v_ej     uuid;
  v_hoy    date := (p_ts at time zone 'America/Santiago')::date;
  v_filas  int;
begin
  if v_actor is null then
    raise exception 'Escenario %: actor % desconocido', p_n, p_alias;
  end if;
  select rol into v_rol from public.usuario where id = v_actor;

  -- ---------------------------------------------------------------- traslados
  if p_op like 'tr\_%' then
    if p_op <> 'tr_crear' then
      select * into tr from public.traslado_interno where id = v_tid;
      if not found then raise exception 'Traslado %: no existe para %', p_n, p_op; end if;
    end if;

    case p_op
    when 'tr_crear' then
      if v_rol not in ('logistica', 'administrador') then
        raise exception 'Traslado %: solo Logística crea traslados', p_n;
      end if;
      if (p->>'origen')::bigint = (p->>'destino')::bigint then
        raise exception 'Traslado %: origen y destino iguales', p_n;
      end if;
      select vehiculo_id into v_veh from pg_temp.seed_pool_ubicado
      where not usado and ubicacion = (p->>'origen')::bigint
      order by vehiculo_id limit 1;
      if v_veh is null then
        raise exception 'Traslado %: no hay vehículos libres en la sucursal %', p_n, p->>'origen';
      end if;
      update pg_temp.seed_pool_ubicado set usado = true where vehiculo_id = v_veh;

      insert into public.traslado_interno (id, origen_id, destino_id, logistica_id, estado, observacion, created_at, updated_at)
      values (v_tid, (p->>'origen')::bigint, (p->>'destino')::bigint, v_actor, 'pendiente', p->>'obs', p_ts, p_ts);
      insert into public.traslado_interno_vehiculo (id, traslado_id, vehiculo_id, created_at)
      values (pg_temp.mid('5eed0007'), v_tid, v_veh, p_ts);

      perform pg_temp.aud(v_actor, 'traslado_interno', v_tid, 'creacion', null,
        jsonb_build_object('origen_id', (p->>'origen')::bigint, 'destino_id', (p->>'destino')::bigint,
                           'vehiculos', 1, 'estado', 'pendiente'), p_ts);

    when 'tr_despachar' then
      if tr.estado <> 'pendiente' then raise exception 'Traslado %: no está pendiente', p_n; end if;
      if tr.logistica_id <> v_actor and v_rol <> 'administrador' then
        raise exception 'Traslado %: solo el encargado despacha', p_n;
      end if;
      update public.traslado_interno set estado = 'en_transito', fecha_despacho = p_ts where id = v_tid;
      perform pg_temp.aud(v_actor, 'traslado_interno', v_tid, 'despacho',
        jsonb_build_object('estado', 'pendiente'),
        jsonb_build_object('estado', 'en_transito', 'fecha_despacho', pg_temp.iso(p_ts)), p_ts);

    when 'tr_recibir' then
      if tr.estado <> 'en_transito' then raise exception 'Traslado %: no está en tránsito', p_n; end if;
      if v_rol <> 'administrador' and not (v_rol = 'jefe_local' and pg_temp.tiene_sucursal(v_actor, tr.destino_id)) then
        raise exception 'Traslado %: solo el jefe de local de destino recibe', p_n;
      end if;
      update public.traslado_interno
      set estado = 'recepcionado', fecha_recepcion = p_ts,
          recepcion_con_novedades = coalesce((p->>'novedades')::boolean, false),
          observacion_recepcion = nullif(btrim(coalesce(p->>'obs', '')), '')
      where id = v_tid;
      perform pg_temp.aud(v_actor, 'traslado_interno', v_tid, 'recepcion',
        jsonb_build_object('estado', 'en_transito'),
        jsonb_build_object('estado', 'recepcionado', 'fecha_recepcion', pg_temp.iso(p_ts),
                           'con_novedades', coalesce((p->>'novedades')::boolean, false),
                           'observacion', nullif(btrim(coalesce(p->>'obs', '')), '')), p_ts);

    when 'tr_cancelar' then
      if v_rol <> 'logistica' then raise exception 'Traslado %: solo Logística cancela', p_n; end if;
      perform public.fn_cancelar_traslado_interno(v_tid, v_actor, p->>'motivo', (p->>'ubicacion')::bigint);
      -- La función sella now(); se lleva al momento histórico del evento.
      update public.traslado_interno set fecha_cancelacion = p_ts where id = v_tid;
      perform pg_temp.aud(v_actor, 'traslado_interno', v_tid, 'cancelacion_transito',
        jsonb_build_object('estado', 'en_transito'),
        jsonb_build_object('estado', 'cancelado', 'motivo', p->>'motivo', 'ubicacion', (p->>'ubicacion')::bigint), p_ts);

    else
      raise exception 'Operación de traslado desconocida: %', p_op;
    end case;
    return;
  end if;

  -- -------------------------------------------------------------- solicitudes
  if p_op <> 'crear' then
    select * into s from public.solicitud where id = v_id;
    if not found then raise exception 'Escenario %: la solicitud no existe para %', p_n, p_op; end if;
    v_suc := coalesce(s.sucursal_destino, s.sucursal);  -- sucursal de recepción
  end if;

  case p_op
  -- createSolicitudAction + SolicitudesService.createSolicitud
  when 'crear' then
    v_suc := (p->>'origen')::bigint;
    v_fecha := pg_temp.fecha((p->>'limite')::int);
    if v_fecha::date < v_hoy then
      raise exception 'Escenario %: fecha límite anterior a la creación', p_n;
    end if;

    if v_rol = 'ejecutivo' then
      if v_suc <> (select sucursal_id from public.usuario where id = v_actor) then
        raise exception 'Escenario %: el ejecutivo solo crea en su sucursal', p_n;
      end if;
      if p->>'tipo' = 'venta' and (p->>'destino')::bigint <> v_suc then
        raise exception 'Escenario %: el ejecutivo solo pide vehículos para su sucursal', p_n;
      end if;
      v_ej := v_actor;
      if pg_temp.jefe_de(v_suc) is null then
        raise exception 'Escenario %: la sucursal % no tiene jefe de local', p_n, v_suc;
      end if;
    elsif v_rol = 'jefe_local' then
      if not pg_temp.tiene_sucursal(v_actor, v_suc) then
        raise exception 'Escenario %: el jefe de local no tiene la sucursal %', p_n, v_suc;
      end if;
      v_ej := pg_temp.actor(p->>'delegada_a');
      if v_ej is not null and not exists (
        select 1 from public.usuario where id = v_ej and rol = 'ejecutivo' and activo and sucursal_id = v_suc
      ) then
        raise exception 'Escenario %: delegación a un ejecutivo de otra sucursal', p_n;
      end if;
    else
      raise exception 'Escenario %: el rol % no crea solicitudes', p_n, v_rol;
    end if;

    select array_agg(vehiculo_id order by idx) into v_vehs
    from (select vehiculo_id, idx from pg_temp.seed_pool where not usado order by idx limit (p->>'nveh')::int) x;
    if coalesce(array_length(v_vehs, 1), 0) <> (p->>'nveh')::int then
      raise exception 'Escenario %: no quedan vehículos de stock disponibles', p_n;
    end if;
    update pg_temp.seed_pool set usado = true where vehiculo_id = any(v_vehs);

    insert into public.solicitud (
      id, ejecutivo_id, jefe_local_id, estado, fecha_creacion, fecha_actualizacion,
      tipo_solicitud, sucursal, sucursal_destino, fecha_limite, direccion_evento, titulo_evento
    ) values (
      v_id, v_ej,
      case when v_rol = 'jefe_local' then v_actor else pg_temp.jefe_de(v_suc) end,
      case when v_rol = 'jefe_local' then 'aprobada' else 'pendiente_aprobacion' end::public.estado_solicitud,
      p_ts, p_ts,
      (p->>'tipo')::public.tipo_solicitud, v_suc,
      case when p->>'tipo' = 'venta' then (p->>'destino')::bigint end,
      v_fecha,
      case when p->>'tipo' = 'evento' then p->>'direccion' end,
      case when p->>'tipo' = 'evento' then p->>'titulo' end
    );

    foreach v_veh in array v_vehs loop
      insert into public.solicitud_vehiculo (id, solicitud_id, vehiculo_id, disponibilidad, created_at)
      values (pg_temp.mid('5eed0002'), v_id, v_veh, 'reservado', p_ts);
      perform pg_temp.aud(v_actor, 'solicitud_vehiculo', v_id, 'ASIGNACION_VEHICULO', null,
        jsonb_build_object('solicitud_id', v_id, 'vehiculo_id', v_veh), p_ts);
    end loop;

    if v_rol = 'jefe_local' and v_ej is not null then
      perform pg_temp.aud(v_actor, 'solicitud', v_id, 'delegacion', null,
        jsonb_build_object('ejecutivo_id', v_ej, 'jefe_local_id', v_actor), p_ts);
    end if;

    if p ? 'obs' then
      perform pg_temp.obs(v_id, v_actor, p->>'obs', p_ts);
    end if;

  -- SolicitudesService.aprobarSolicitud
  when 'aprobar' then
    if v_rol <> 'administrador' and not (v_rol = 'jefe_local' and pg_temp.tiene_sucursal(v_actor, s.sucursal)) then
      raise exception 'Escenario %: aprueba un jefe de local de la sucursal', p_n;
    end if;
    v_fecha := pg_temp.fecha((p->>'limite')::int);
    if v_fecha::date < v_hoy then raise exception 'Escenario %: fecha límite en el pasado', p_n; end if;
    update public.solicitud set estado = 'aprobada', fecha_limite = v_fecha, fecha_confirmacion = p_ts
    where id = v_id and estado = 'pendiente_aprobacion';
    get diagnostics v_filas = row_count;
    if v_filas <> 1 then raise exception 'Escenario %: aprobar desde %', p_n, s.estado; end if;
    perform pg_temp.aud(v_actor, 'solicitud', v_id, 'aprobacion',
      jsonb_build_object('estado', s.estado),
      jsonb_build_object('estado', 'aprobada', 'fecha_entrega', pg_temp.ymd(v_fecha),
                         'fecha_confirmacion', pg_temp.iso(p_ts)), p_ts);

  -- SolicitudesService.rechazarSolicitud
  when 'rechazar' then
    if v_rol <> 'administrador' and not (v_rol = 'jefe_local' and pg_temp.tiene_sucursal(v_actor, s.sucursal)) then
      raise exception 'Escenario %: rechaza un jefe de local de la sucursal', p_n;
    end if;
    if length(btrim(p->>'motivo')) < 5 then raise exception 'Escenario %: motivo muy corto', p_n; end if;
    update public.solicitud set estado = 'rechazada' where id = v_id and estado = 'pendiente_aprobacion';
    get diagnostics v_filas = row_count;
    if v_filas <> 1 then raise exception 'Escenario %: rechazar desde %', p_n, s.estado; end if;
    perform pg_temp.obs(v_id, v_actor, '[RECHAZO] ' || btrim(p->>'motivo'), p_ts);
    perform pg_temp.aud(v_actor, 'solicitud', v_id, 'rechazo',
      jsonb_build_object('estado', s.estado),
      jsonb_build_object('estado', 'rechazada', 'motivo', btrim(p->>'motivo')), p_ts);

  -- SolicitudesService.priorizarSolicitud
  when 'priorizar' then
    if v_rol <> 'administrador' and not (v_rol = 'jefe_local' and pg_temp.tiene_sucursal(v_actor, s.sucursal)) then
      raise exception 'Escenario %: prioriza un jefe de local de la sucursal', p_n;
    end if;
    select coalesce(max(posicion_prioridad), 0) + 1 into v_pos
    from public.solicitud where sucursal = s.sucursal and posicion_prioridad is not null;
    update public.solicitud set estado = 'priorizada', posicion_prioridad = v_pos
    where id = v_id and estado = s.estado and s.estado in ('pendiente', 'aprobada');
    get diagnostics v_filas = row_count;
    if v_filas <> 1 then raise exception 'Escenario %: priorizar desde %', p_n, s.estado; end if;
    perform pg_temp.aud(v_actor, 'solicitud', v_id, 'priorizacion',
      jsonb_build_object('estado', s.estado, 'posicion_prioridad', s.posicion_prioridad),
      jsonb_build_object('estado', 'priorizada', 'posicion_prioridad', v_pos), p_ts);

  -- SolicitudesService.asignarEncargadoLogistica
  when 'asignar' then
    if v_rol not in ('logistica', 'administrador') then
      raise exception 'Escenario %: asigna Logística', p_n;
    end if;
    if v_rol = 'logistica' and not pg_temp.en_zona(v_actor, s.sucursal) then
      raise exception 'Escenario %: la sucursal no está en la zona de Logística', p_n;
    end if;
    v_ej := coalesce(pg_temp.actor(p->>'encargado'), v_actor);
    update public.solicitud set estado = 'asignada', logistica_id = v_ej
    where id = v_id and estado = s.estado and s.estado in ('aprobada', 'priorizada');
    get diagnostics v_filas = row_count;
    if v_filas <> 1 then raise exception 'Escenario %: asignar desde %', p_n, s.estado; end if;
    perform pg_temp.aud(v_actor, 'solicitud', v_id, 'asignacion_logistica',
      jsonb_build_object('estado', s.estado, 'logistica_id', s.logistica_id),
      jsonb_build_object('estado', 'asignada', 'logistica_id', v_ej), p_ts);

  -- SolicitudesService.calendarizarSolicitud
  when 'calendarizar' then
    if v_rol = 'logistica' and not pg_temp.en_zona(v_actor, s.sucursal) then
      raise exception 'Escenario %: la sucursal no está en la zona de Logística', p_n;
    end if;
    if v_rol not in ('logistica', 'administrador', 'jefe_local') then
      raise exception 'Escenario %: el rol % no calendariza', p_n, v_rol;
    end if;
    v_fecha := pg_temp.fecha((p->>'fecha')::int);
    if v_fecha::date < v_hoy then raise exception 'Escenario %: despacho programado en el pasado', p_n; end if;
    update public.solicitud
    set estado = 'calendarizada', fecha_tentativa_despacho = v_fecha,
        logistica_id = coalesce(s.logistica_id, case when v_rol = 'jefe_local' then null else v_actor end),
        posicion_prioridad = null
    where id = v_id and estado = s.estado and s.estado in ('priorizada', 'asignada');
    get diagnostics v_filas = row_count;
    if v_filas <> 1 then raise exception 'Escenario %: calendarizar desde %', p_n, s.estado; end if;
    perform pg_temp.renumerar(s.sucursal);
    perform pg_temp.aud(v_actor, 'solicitud', v_id, 'calendarizacion',
      jsonb_build_object('estado', s.estado,
                         'fecha_tentativa_despacho', pg_temp.pgts(s.fecha_tentativa_despacho),
                         'posicion_prioridad', s.posicion_prioridad),
      jsonb_build_object('estado', 'calendarizada', 'fecha_tentativa_despacho', pg_temp.ymd(v_fecha),
                         'posicion_prioridad', null), p_ts);

  -- SolicitudesService.recalendarizarSolicitud (solo Logística)
  when 'recalendarizar' then
    if v_rol <> 'logistica' then raise exception 'Escenario %: solo Logística reprograma', p_n; end if;
    v_fecha := pg_temp.fecha((p->>'fecha')::int);
    if v_fecha::date < v_hoy then raise exception 'Escenario %: reprogramación al pasado', p_n; end if;
    if pg_temp.ymd(v_fecha) = pg_temp.ymd(s.fecha_tentativa_despacho) then
      raise exception 'Escenario %: la nueva fecha es igual a la programada', p_n;
    end if;
    update public.solicitud set fecha_tentativa_despacho = v_fecha
    where id = v_id and estado = 'calendarizada';
    get diagnostics v_filas = row_count;
    if v_filas <> 1 then raise exception 'Escenario %: reprogramar desde %', p_n, s.estado; end if;
    perform pg_temp.aud(v_actor, 'solicitud', v_id, 'recalendarizacion',
      jsonb_build_object('fecha_tentativa_despacho', pg_temp.pgts(s.fecha_tentativa_despacho)),
      jsonb_build_object('fecha_tentativa_despacho', pg_temp.ymd(v_fecha), 'motivo', p->>'motivo'), p_ts);

  -- SolicitudesService.descalendarizarSolicitud
  when 'descalendarizar' then
    select coalesce(max(posicion_prioridad), 0) + 1 into v_pos
    from public.solicitud where sucursal = s.sucursal and estado = 'priorizada' and posicion_prioridad is not null;
    update public.solicitud
    set estado = 'priorizada', posicion_prioridad = v_pos, fecha_tentativa_despacho = null, logistica_id = null
    where id = v_id and estado = 'calendarizada';
    get diagnostics v_filas = row_count;
    if v_filas <> 1 then raise exception 'Escenario %: descalendarizar desde %', p_n, s.estado; end if;
    perform pg_temp.aud(v_actor, 'solicitud', v_id, 'descalendarizacion',
      jsonb_build_object('estado', 'calendarizada', 'fecha_tentativa_despacho', pg_temp.pgts(s.fecha_tentativa_despacho)),
      jsonb_build_object('estado', 'priorizada', 'posicion_prioridad', v_pos, 'fecha_tentativa_despacho', null), p_ts);

  -- SolicitudesService.despacharSolicitud
  when 'despachar' then
    if v_rol not in ('logistica', 'administrador') then raise exception 'Escenario %: despacha Logística', p_n; end if;
    update public.solicitud
    set estado = 'en_transito', fecha_despacho = p_ts, fecha_inicio_transito = p_ts, posicion_prioridad = null
    where id = v_id and estado = 'calendarizada';
    get diagnostics v_filas = row_count;
    if v_filas <> 1 then raise exception 'Escenario %: despachar desde %', p_n, s.estado; end if;
    perform pg_temp.renumerar(s.sucursal);
    perform pg_temp.aud(v_actor, 'solicitud', v_id, 'despacho',
      jsonb_build_object('estado', 'calendarizada', 'fecha_despacho', null),
      jsonb_build_object('estado', 'en_transito', 'fecha_despacho', pg_temp.iso(p_ts),
                         'fecha_inicio_transito', pg_temp.iso(p_ts)), p_ts);

  -- SolicitudesService.cancelarDespacharSolicitud
  when 'cancelar_despacho' then
    if v_rol not in ('logistica', 'administrador') then raise exception 'Escenario %: revierte Logística', p_n; end if;
    update public.solicitud set estado = 'calendarizada', fecha_despacho = null, posicion_prioridad = null
    where id = v_id and estado = 'en_transito';
    get diagnostics v_filas = row_count;
    if v_filas <> 1 then raise exception 'Escenario %: revertir despacho desde %', p_n, s.estado; end if;
    perform pg_temp.aud(v_actor, 'solicitud', v_id, 'despacho',
      jsonb_build_object('estado', s.estado, 'fecha_despacho', pg_temp.pgts(s.fecha_despacho)),
      jsonb_build_object('estado', 'calendarizada', 'fecha_despacho', null), p_ts);

  -- SolicitudesService.recibirSolicitud (jefe de local de la sucursal de recepción)
  when 'recibir' then
    if v_rol <> 'administrador' and not (v_rol = 'jefe_local' and pg_temp.tiene_sucursal(v_actor, v_suc)) then
      raise exception 'Escenario %: recibe el jefe de local de destino', p_n;
    end if;
    update public.solicitud
    set estado = 'entregada', fecha_entrega = p_ts, fecha_recepcion = p_ts, posicion_prioridad = null
    where id = v_id and estado = 'en_transito';
    get diagnostics v_filas = row_count;
    if v_filas <> 1 then raise exception 'Escenario %: recibir desde %', p_n, s.estado; end if;
    v_txt := nullif(btrim(coalesce(p->>'obs', '')), '');
    if coalesce((p->>'novedades')::boolean, false) then
      perform pg_temp.obs(v_id, v_actor, '[RECEPCIÓN] Con novedades: ' || v_txt, p_ts);
    elsif v_txt is not null then
      perform pg_temp.obs(v_id, v_actor, '[RECEPCIÓN] Sin novedades: ' || v_txt, p_ts);
    end if;
    perform pg_temp.aud(v_actor, 'solicitud', v_id, 'entrega',
      jsonb_build_object('estado', 'en_transito', 'fecha_entrega', null),
      jsonb_build_object('estado', 'entregada', 'fecha_entrega', pg_temp.iso(p_ts),
                         'fecha_recepcion', pg_temp.iso(p_ts),
                         'con_novedades', coalesce((p->>'novedades')::boolean, false),
                         'observacion', v_txt), p_ts);

  -- SolicitudesService.finalizarSolicitud (jefe de local de destino o ejecutivo creador)
  when 'finalizar' then
    if v_rol <> 'administrador'
       and not (v_rol = 'jefe_local' and pg_temp.tiene_sucursal(v_actor, v_suc))
       and not (v_rol = 'ejecutivo' and s.ejecutivo_id = v_actor) then
      raise exception 'Escenario %: finaliza el jefe de destino o el ejecutivo creador', p_n;
    end if;
    update public.solicitud set estado = 'finalizada', fecha_entrega_cliente = p_ts, posicion_prioridad = null
    where id = v_id and estado = 'entregada';
    get diagnostics v_filas = row_count;
    if v_filas <> 1 then raise exception 'Escenario %: finalizar desde %', p_n, s.estado; end if;
    perform pg_temp.aud(v_actor, 'solicitud', v_id, 'finalizacion',
      jsonb_build_object('estado', 'entregada'), jsonb_build_object('estado', 'finalizada'), p_ts);

  -- cancelarSolicitudAction + SolicitudesService.cancelarSolicitud (pre-despacho)
  when 'cancelar' then
    if not (v_rol = 'administrador'
            or (v_rol = 'jefe_local' and pg_temp.tiene_sucursal(v_actor, s.sucursal))
            or (v_rol = 'ejecutivo' and s.ejecutivo_id = v_actor)
            or (v_rol = 'logistica' and pg_temp.en_zona(v_actor, s.sucursal))) then
      raise exception 'Escenario %: el actor no puede cancelar', p_n;
    end if;
    if length(btrim(p->>'motivo')) < 5 then raise exception 'Escenario %: motivo muy corto', p_n; end if;
    update public.solicitud set estado = 'cancelada', motivo_cancelacion = btrim(p->>'motivo'), posicion_prioridad = null
    where id = v_id and estado = s.estado and s.estado in ('pendiente_aprobacion', 'aprobada', 'pendiente', 'priorizada');
    get diagnostics v_filas = row_count;
    if v_filas <> 1 then raise exception 'Escenario %: cancelar desde %', p_n, s.estado; end if;
    if s.posicion_prioridad is not null then perform pg_temp.renumerar(s.sucursal); end if;
    perform pg_temp.aud(v_actor, 'solicitud', v_id, 'CAMBIO_ESTADO',
      jsonb_build_object('estado', s.estado),
      jsonb_build_object('estado', 'cancelada', 'motivo', btrim(p->>'motivo')), p_ts);

  -- SolicitudesService.cancelarEnTransito (función SQL real)
  when 'cancelar_transito' then
    if v_rol <> 'logistica' then raise exception 'Escenario %: cancela en tránsito Logística', p_n; end if;
    perform public.fn_cancelar_solicitud_en_transito(v_id, v_actor, p->>'motivo', (p->>'ubicacion')::bigint);
    perform pg_temp.aud(v_actor, 'solicitud', v_id, 'cancelacion_transito',
      jsonb_build_object('estado', 'en_transito'),
      jsonb_build_object('estado', 'cancelada', 'motivo', btrim(p->>'motivo'), 'ubicacion', (p->>'ubicacion')::bigint), p_ts);

  -- SolicitudesService.insistirSolicitud (cooldown de 24 h en el trigger)
  when 'insistir' then
    if s.ejecutivo_id <> v_actor then raise exception 'Escenario %: insiste el ejecutivo creador', p_n; end if;
    if s.estado not in ('pendiente_aprobacion', 'aprobada', 'priorizada', 'asignada', 'calendarizada') then
      raise exception 'Escenario %: no se puede insistir en %', p_n, s.estado;
    end if;
    insert into public.insistencia (id, solicitud_id, usuario_id, mensaje, created_at)
    values (pg_temp.mid('5eed0005'), v_id, v_actor, p->>'msg', p_ts);
    perform pg_temp.obs(v_id, v_actor, '[INSISTENCIA] ' || coalesce(p->>'msg', 'Solicito avanzar el estado de mi solicitud.'), p_ts);
    perform pg_temp.aud(v_actor, 'solicitud', v_id, 'insistencia',
      jsonb_build_object('estado', s.estado),
      jsonb_build_object('estado', s.estado, 'mensaje', p->>'msg'), p_ts);

  -- SolicitudesService.agregarObservacion
  when 'observar' then
    if s.estado in ('rechazada', 'cancelada') then
      raise exception 'Escenario %: solicitud cerrada, no admite observaciones', p_n;
    end if;
    perform pg_temp.obs(v_id, v_actor, p->>'texto', p_ts);

  else
    raise exception 'Operación desconocida: %', p_op;
  end case;
end
$$;

-- -----------------------------------------------------------------------------
-- Generador de escenarios
-- -----------------------------------------------------------------------------

-- Entero determinista en [0, m) para el escenario i y la decisión k.
create function pg_temp.rnd(i int, k int, m int) returns int language sql immutable
as $$ select (((hashtext(i::text || ':' || k::text)::bigint % m) + m) % m)::int $$;

create function pg_temp.pick(arr text[], i int, k int) returns text language sql immutable
as $$ select arr[1 + pg_temp.rnd(i, k, array_length(arr, 1))] $$;

-- Arma la historia del escenario i (solicitud 1000 + i) como eventos con
-- fecha. Primero decide el estado final, el creador y la secuencia de pasos;
-- después ubica cada paso en un día (hacia atrás desde el último) y calcula
-- las fechas de negocio a partir de esos días, para que siempre sean válidas.
create function pg_temp.generar(i int) returns void language plpgsql
as $$
declare
  n            int := 1000 + i;
  v_slot       int := (i * 37) % 100;   -- permutación de 0..99: mezcla los estados
  v_estado     text;
  v_cv         int := pg_temp.rnd(i, 3, 3);   -- variante de cancelación
  v_creador    text;
  v_origen     int;
  v_destino    int;
  v_tipo       text := 'venta';
  v_deleg      text;
  v_ej         text;
  v_jl_or      text;
  v_jl_rec     text;
  v_ops        text[] := array['crear'];
  v_gaps       int[]  := array[0];
  v_dias       int[];
  v_k          int;
  v_e          int;
  v_recal      boolean := pg_temp.rnd(i, 20, 100) < 25;
  v_revert     boolean := false;
  v_atrasada   boolean := pg_temp.rnd(i, 21, 100) < 35;
  v_tarde      boolean := pg_temp.rnd(i, 22, 100) < 25;
  v_insist     boolean;
  v_limite     int;
  v_cal_fecha  int;
  v_recal_fecha int;
  v_d_crear    int;
  v_d_aprob    int;
  v_d_cal      int;
  v_d_recal    int;
  v_d_desp     int;
  v_d_recep    int;
  v_d_ins      int;
  v_prev_dia   int;
  v_min        int := 0;
  v_ts         timestamptz;
  v_p          jsonb;
  v_actor      text;
  v_op         text;
  v_ev         int;

  v_obs_crear text[] := array[
    'Cliente con crédito automotriz aprobado; necesita la unidad antes del fin de semana.',
    'Venta al contado, el cliente ya pagó la reserva.',
    'Cliente empresa: factura a 30 días, retira con su propio conductor.',
    'El cliente entrega su auto actual en parte de pago.',
    'El cliente pide la unidad con láminas de seguridad instaladas.',
    'Cliente frecuente, segunda compra en el año.',
    'Venta cerrada en la feria del fin de semana.',
    'Entregar la unidad lavada y con el estanque lleno.'];
  v_rechazos text[] := array[
    'El cliente no tiene aprobado el crédito; reingresar cuando la financiera lo confirme.',
    'La unidad está comprometida para exhibición en sala hasta fin de mes.',
    'Falta la orden de compra firmada por el cliente.',
    'El precio informado no corresponde a la lista vigente; corregir y reingresar.',
    'Hay una unidad equivalente disponible en la sucursal; usar esa.'];
  v_cancelaciones text[] := array[
    'El cliente desistió de la compra.',
    'Se vendió una unidad equivalente que ya estaba en el local.',
    'El cliente cambió de modelo; se ingresará una nueva solicitud.',
    'La financiera rechazó el crédito después de la aprobación.',
    'El cliente postergó la compra para el próximo mes.'];
  v_reprogramaciones text[] := array[
    'El cliente pidió postergar la entrega.',
    'Sin cupo en el camión de la ruta.',
    'La unidad no tenía completada la inspección previa a la entrega (PDI).',
    'Camión en mantención programada.',
    'Feriado regional en la sucursal de destino.'];
  v_cancel_transito text[] := array[
    'Falla mecánica del camión en ruta; la unidad vuelve a bodega central.',
    'Corte de ruta por un accidente; el traslado se suspende.',
    'El cliente anuló la compra mientras la unidad viajaba.'];
  v_novedades text[] := array[
    'Rayón leve en la puerta trasera izquierda; se deriva a preparación.',
    'Falta una de las dos llaves; se solicita a bodega central.',
    'Neumático delantero con baja presión; se revisa en taller.',
    'Abolladura menor en el parachoques trasero.'];
  v_recepciones text[] := array[
    'Unidad recibida con kit de herramientas y dos llaves.',
    'Llegó limpia y con la documentación completa.',
    'Recibida conforme, sin observaciones del conductor.'];
  v_insistencias text[] := array[
    'El cliente pregunta por la fecha estimada de entrega.',
    'El cliente quiere firmar mañana, ¿se puede avanzar hoy?',
    'El cliente llamó dos veces hoy; necesitamos una fecha.',
    'Por favor priorizar, el cliente viaja la próxima semana.'];
  v_titulos text[] := array[
    'Exhibición Mall Marina Arauco',
    'Test drive Club de Golf Granadilla',
    'Feria automotriz Quinta Vergara',
    'Lanzamiento en Espacio Urbano Reñaca',
    'Exhibición en la plaza de Concón'];
  v_direcciones text[] := array[
    'Av. Libertad 1348, Viña del Mar',
    'Camino Granadilla s/n, Viña del Mar',
    'Errázuriz 563, Viña del Mar',
    'Av. Borgoño 15120, Reñaca',
    'Av. Borgoño 21300, Concón'];
begin
  -- ---- Estado final ---------------------------------------------------------
  v_estado := case
    when v_slot < 10 then 'pendiente_aprobacion'
    when v_slot < 16 then 'rechazada'
    when v_slot < 22 then 'cancelada'
    when v_slot < 29 then 'aprobada'
    when v_slot < 39 then 'priorizada'
    when v_slot < 46 then 'asignada'
    when v_slot < 56 then 'calendarizada'
    when v_slot < 65 then 'en_transito'
    when v_slot < 68 then 'cancelada_transito'
    when v_slot < 76 then 'entregada'
    else 'finalizada' end;

  -- ---- Creador, sucursales y tipo -------------------------------------------
  -- Pendientes, rechazos y cancelaciones antes de aprobar solo existen si las
  -- crea un ejecutivo (el jefe de local crea solicitudes ya aprobadas).
  if v_estado in ('pendiente_aprobacion', 'rechazada') or (v_estado = 'cancelada' and v_cv = 0) then
    v_creador := case when pg_temp.rnd(i, 1, 2) = 0 then 'EJ9' else 'EJ6' end;
  else
    v_creador := case
      when pg_temp.rnd(i, 2, 100) < 30 then 'EJ9'
      when pg_temp.rnd(i, 2, 100) < 60 then 'EJ6'
      when pg_temp.rnd(i, 2, 100) < 85 then 'JL6'
      else 'JL7' end;
  end if;

  if v_creador = 'EJ9' then
    v_origen := 9; v_destino := 9; v_ej := 'EJ9';
  elsif v_creador = 'EJ6' then
    v_origen := 6; v_destino := 6; v_ej := 'EJ6';
  elsif v_creador = 'JL6' then
    -- El jefe de local de 15 Norte también encabeza Valparaíso.
    v_origen := case when pg_temp.rnd(i, 4, 100) < 65 then 6 else 9 end;
    v_destino := case
      when pg_temp.rnd(i, 5, 100) < 70 then v_origen
      when v_origen = 6 then (array[7, 8, 9])[1 + pg_temp.rnd(i, 6, 3)]
      else (array[6, 7, 8])[1 + pg_temp.rnd(i, 6, 3)] end;
    if pg_temp.rnd(i, 7, 100) < 35 then
      v_deleg := case when v_origen = 6 then 'EJ6' else 'EJ9' end;
      v_ej := v_deleg;
    end if;
  else
    v_origen := 7;
    v_destino := case when pg_temp.rnd(i, 5, 100) < 80 then 7 else (array[6, 9])[1 + pg_temp.rnd(i, 6, 2)] end;
  end if;

  if pg_temp.rnd(i, 8, 100) < 12 then
    v_tipo := 'evento';
    v_destino := null;
  end if;

  v_jl_or  := case when v_origen = 7 then 'JL7' else 'JL6' end;
  v_jl_rec := case when coalesce(v_destino, v_origen) = 7 then 'JL7' else 'JL6' end;

  -- ---- Secuencia de pasos y días entre ellos --------------------------------
  if v_creador like 'EJ%' and v_estado not in ('pendiente_aprobacion', 'rechazada')
     and not (v_estado = 'cancelada' and v_cv = 0) then
    v_ops := array_append(v_ops, 'aprobar');
    v_gaps := array_append(v_gaps, pg_temp.rnd(i, 10, 2));
  end if;

  case v_estado
  when 'pendiente_aprobacion', 'aprobada' then
    null;
  when 'rechazada' then
    v_ops := array_append(v_ops, 'rechazar');
    v_gaps := array_append(v_gaps, pg_temp.rnd(i, 11, 3));
  when 'cancelada' then
    if v_cv = 2 then
      v_ops := array_append(v_ops, 'priorizar');
      v_gaps := array_append(v_gaps, pg_temp.rnd(i, 12, 2));
    end if;
    v_ops := array_append(v_ops, 'cancelar');
    v_gaps := array_append(v_gaps, 1 + pg_temp.rnd(i, 13, 4));
  when 'priorizada' then
    v_ops := array_append(v_ops, 'priorizar');
    v_gaps := array_append(v_gaps, pg_temp.rnd(i, 12, 2));
    if pg_temp.rnd(i, 14, 100) < 25 then
      v_ops := array_cat(v_ops, array['calendarizar', 'descalendarizar', 'observar']);
      v_gaps := array_cat(v_gaps, array[1 + pg_temp.rnd(i, 15, 3), 1 + pg_temp.rnd(i, 16, 3), 0]);
    end if;
  when 'asignada' then
    v_ops := array_append(v_ops, 'asignar');
    v_gaps := array_append(v_gaps, 1 + pg_temp.rnd(i, 12, 2));
  else
    -- calendarizada, en_transito, cancelada_transito, entregada, finalizada
    if pg_temp.rnd(i, 17, 100) < 50 then
      v_ops := array_append(v_ops, 'priorizar');
      v_gaps := array_append(v_gaps, pg_temp.rnd(i, 12, 2));
    else
      v_ops := array_append(v_ops, 'asignar');
      v_gaps := array_append(v_gaps, 1 + pg_temp.rnd(i, 12, 2));
    end if;
    v_ops := array_append(v_ops, 'calendarizar');
    v_gaps := array_append(v_gaps, 1 + pg_temp.rnd(i, 15, 3));

    if v_estado = 'calendarizada' and pg_temp.rnd(i, 18, 100) < 15 then
      v_revert := true;
      v_recal := false;
      v_ops := array_cat(v_ops, array['despachar', 'cancelar_despacho', 'recalendarizar']);
      v_gaps := array_cat(v_gaps, array[1 + pg_temp.rnd(i, 19, 2), 0, 0]);
    else
      if v_recal then
        v_ops := array_append(v_ops, 'recalendarizar');
        v_gaps := array_append(v_gaps, 1 + pg_temp.rnd(i, 19, 2));
      end if;
      if v_estado <> 'calendarizada' then
        v_ops := array_append(v_ops, 'despachar');
        v_gaps := array_append(v_gaps, 1 + pg_temp.rnd(i, 23, 3));
        if v_estado = 'cancelada_transito' then
          v_ops := array_append(v_ops, 'cancelar_transito');
          v_gaps := array_append(v_gaps, 0);
        elsif v_estado in ('entregada', 'finalizada') then
          v_ops := array_append(v_ops, 'recibir');
          v_gaps := array_append(v_gaps, case
            when v_tipo = 'evento' then 1 + pg_temp.rnd(i, 24, 3)
            when pg_temp.rnd(i, 24, 100) < 30 then 0
            else 1 end);
          if v_estado = 'finalizada' then
            v_ops := array_append(v_ops, 'finalizar');
            v_gaps := array_append(v_gaps, pg_temp.rnd(i, 25, 5));
          end if;
        end if;
      end if;
    end if;
  end case;

  -- ---- Días de cada paso (hacia atrás desde el último) -----------------------
  v_e := case v_estado
    when 'pendiente_aprobacion' then -pg_temp.rnd(i, 30, 5)
    when 'rechazada' then -1 - pg_temp.rnd(i, 30, 20)
    when 'cancelada' then -1 - pg_temp.rnd(i, 30, 20)
    when 'en_transito' then case when v_atrasada then -4 - pg_temp.rnd(i, 30, 4) else -1 - pg_temp.rnd(i, 30, 3) end
    when 'cancelada_transito' then -1 - pg_temp.rnd(i, 30, 15)
    when 'entregada' then -1 - pg_temp.rnd(i, 30, 8)
    when 'finalizada' then -1 - pg_temp.rnd(i, 30, 40)
    else -1 - pg_temp.rnd(i, 30, 6) end;

  v_k := array_length(v_ops, 1);
  v_dias := array_fill(0, array[v_k]);
  v_dias[v_k] := v_e;
  for j in reverse v_k - 1 .. 1 loop
    v_dias[j] := v_dias[j + 1] - v_gaps[j + 1];
  end loop;

  v_d_crear := v_dias[1];
  v_d_aprob := v_dias[array_position(v_ops, 'aprobar')];
  v_d_cal   := v_dias[array_position(v_ops, 'calendarizar')];
  v_d_recal := v_dias[array_position(v_ops, 'recalendarizar')];
  v_d_desp  := v_dias[array_position(v_ops, 'despachar')];
  v_d_recep := v_dias[array_position(v_ops, 'recibir')];

  -- ---- Fechas de negocio -----------------------------------------------------
  -- Fecha límite de entrega: a tiempo o fuera de plazo según la recepción;
  -- atrasada si sigue en tránsito; futura si aún no se despacha.
  v_limite := case
    when v_d_recep is not null then
      v_d_recep + case when v_tarde then -1 - pg_temp.rnd(i, 31, 2) else pg_temp.rnd(i, 31, 4) end
    when v_estado = 'en_transito' then
      v_d_desp + case when v_atrasada then 1 + pg_temp.rnd(i, 31, 2) else 2 + pg_temp.rnd(i, 31, 4) end
    when v_estado = 'cancelada_transito' then v_d_desp + 2 + pg_temp.rnd(i, 31, 3)
    else v_e + 2 + pg_temp.rnd(i, 31, 9) end;
  v_limite := greatest(v_limite, coalesce(v_d_aprob, v_d_crear));

  -- Fecha programada al calendarizar y nueva fecha al reprogramar.
  if v_revert then
    v_cal_fecha := v_d_desp;
    v_recal_fecha := 1 + pg_temp.rnd(i, 32, 4);
  elsif v_d_desp is not null then
    if v_d_recal is not null then
      v_cal_fecha := v_d_recal;
      v_recal_fecha := v_d_desp;
    else
      v_cal_fecha := v_d_desp;
    end if;
  elsif v_estado = 'calendarizada' then
    if v_d_recal is not null then
      v_cal_fecha := v_d_recal;
      v_recal_fecha := pg_temp.rnd(i, 32, 6);
    else
      v_cal_fecha := pg_temp.rnd(i, 32, 6);
    end if;
  elsif v_d_cal is not null then
    v_cal_fecha := v_d_cal + 1 + pg_temp.rnd(i, 32, 3);
  end if;

  -- ---- Eventos -----------------------------------------------------------------
  for j in 1 .. v_k loop
    v_op := v_ops[j];

    if v_prev_dia is not null and v_dias[j] = v_prev_dia then
      v_min := least(v_min + 15 + pg_temp.rnd(i, 100 + j, 75), 1260);
    else
      v_min := 510 + pg_temp.rnd(i, 100 + j, 300);   -- entre 08:30 y 13:30
    end if;
    v_prev_dia := v_dias[j];
    if v_dias[j] = 0 then
      v_ts := pg_temp.hace(1 + pg_temp.rnd(i, 35, 7));   -- creada hoy
    else
      v_ts := (pg_temp.dia(v_dias[j]) + make_interval(mins => v_min)) at time zone 'America/Santiago';
    end if;

    v_p := '{}';
    case v_op
    when 'crear' then
      v_actor := v_creador;
      v_p := jsonb_build_object(
        'tipo', v_tipo,
        'origen', v_origen,
        'nveh', case when pg_temp.rnd(i, 40, 100) < 78 then 1 when pg_temp.rnd(i, 40, 100) < 96 then 2 else 3 end,
        -- El ejecutivo propone una fecha; el jefe de local la fija al aprobar.
        'limite', case when v_creador like 'EJ%' then v_d_crear + 3 + pg_temp.rnd(i, 41, 8) else v_limite end);
      if v_destino is not null then
        v_p := v_p || jsonb_build_object('destino', v_destino);
      end if;
      if v_tipo = 'evento' then
        v_ev := 1 + pg_temp.rnd(i, 42, array_length(v_titulos, 1));
        v_p := v_p || jsonb_build_object('titulo', v_titulos[v_ev], 'direccion', v_direcciones[v_ev]);
      end if;
      if v_deleg is not null then
        v_p := v_p || jsonb_build_object('delegada_a', v_deleg);
      end if;
      if pg_temp.rnd(i, 43, 100) < 55 then
        v_p := v_p || jsonb_build_object('obs', pg_temp.pick(v_obs_crear, i, 44));
      end if;
    when 'aprobar' then
      v_actor := case when pg_temp.rnd(i, 45, 100) < 6 then 'ADM' else v_jl_or end;
      v_p := jsonb_build_object('limite', v_limite);
    when 'rechazar' then
      v_actor := v_jl_or;
      v_p := jsonb_build_object('motivo', pg_temp.pick(v_rechazos, i, 46));
    when 'priorizar' then
      v_actor := v_jl_or;
    when 'calendarizar' then
      v_actor := 'LG';
      v_p := jsonb_build_object('fecha', v_cal_fecha);
    when 'recalendarizar' then
      v_actor := 'LG';
      v_p := jsonb_build_object('fecha', v_recal_fecha, 'motivo', case
        when v_revert then 'Despacho revertido: el camión no salió por una falla en la rampa de carga.'
        else pg_temp.pick(v_reprogramaciones, i, 47) end);
    when 'observar' then
      v_actor := 'LG';
      v_p := jsonb_build_object('texto', 'Se libera el cupo del camión para una entrega urgente; se reprogramará esta semana.');
    when 'cancelar_transito' then
      v_actor := 'LG';
      v_p := jsonb_build_object('motivo', pg_temp.pick(v_cancel_transito, i, 48),
                                'ubicacion', case when pg_temp.rnd(i, 49, 2) = 0 then null else v_origen end);
    when 'recibir' then
      v_actor := v_jl_rec;
      v_p := case
        when pg_temp.rnd(i, 50, 100) < 15 then jsonb_build_object('novedades', true, 'obs', pg_temp.pick(v_novedades, i, 51))
        when pg_temp.rnd(i, 50, 100) < 45 then jsonb_build_object('novedades', false, 'obs', pg_temp.pick(v_recepciones, i, 51))
        else jsonb_build_object('novedades', false) end;
    when 'finalizar' then
      v_actor := case
        when pg_temp.rnd(i, 52, 100) < 8 then 'ADM'
        when v_ej is not null and pg_temp.rnd(i, 52, 100) < 60 then v_ej
        else v_jl_rec end;
    when 'cancelar' then
      v_actor := case v_cv
        when 0 then v_creador
        when 2 then v_jl_or
        else case when pg_temp.rnd(i, 53, 2) = 0 then v_jl_or else 'LG' end end;
      v_p := jsonb_build_object('motivo', pg_temp.pick(v_cancelaciones, i, 54));
    else
      -- asignar, descalendarizar, despachar, cancelar_despacho
      v_actor := 'LG';
    end case;

    perform pg_temp.ev(v_ts, n, v_op, v_actor, v_p);
  end loop;

  -- ---- Insistencia del ejecutivo (una como máximo: cooldown de 24 h) ----------
  v_insist := v_ej is not null and v_e <= -1 and pg_temp.rnd(i, 33, 100) < 30
              and v_estado in ('pendiente_aprobacion', 'aprobada', 'priorizada', 'asignada', 'calendarizada');
  if v_insist then
    v_d_ins := least(v_e + 1 + pg_temp.rnd(i, 34, 2), 0);
    perform pg_temp.ev(
      case when v_d_ins = 0 then pg_temp.hace(0.5 + pg_temp.rnd(i, 36, 2))
           else (pg_temp.dia(v_d_ins) + make_interval(mins => 600 + pg_temp.rnd(i, 36, 400))) at time zone 'America/Santiago' end,
      n, 'insistir', v_ej, jsonb_build_object('msg', pg_temp.pick(v_insistencias, i, 37)));
  end if;

  insert into pg_temp.seed_esperado (n, estado)
  values (n, case when v_estado = 'cancelada_transito' then 'cancelada' else v_estado end);
end
$$;

-- -----------------------------------------------------------------------------
-- Ejecución
-- -----------------------------------------------------------------------------

do $$
declare
  r          record;
  v_faltante text;
  v_nveh     int;
  v_mal      text;
  v_resumen  text;
begin
  -- Idempotencia: si ya existen estas solicitudes, no se hace nada.
  if exists (select 1 from public.solicitud where id between pg_temp.sid(1001) and pg_temp.sid(1100))
     or exists (select 1 from public.traslado_interno where id between pg_temp.tid(1001) and pg_temp.tid(1006)) then
    raise notice 'Las solicitudes S1001..S1100 ya existen. No se hizo nada. Para regenerarlas ejecuta antes 02_limpiar_escenarios.sql.';
    return;
  end if;

  select string_agg(a.alias, ', ') into v_faltante
  from pg_temp.seed_actor a
  left join public.usuario u on u.id = a.id and u.rol = a.rol and u.activo and u.aprobado
  where u.id is null;
  if v_faltante is not null then
    raise exception 'Usuarios de prueba no válidos (inexistentes, inactivos o con otro rol): %', v_faltante;
  end if;

  if (select count(*) from public.sucursal where id in (6, 7, 8, 9)) <> 4 then
    raise exception 'Faltan sucursales 6, 7, 8 o 9.';
  end if;

  -- 100 solicitudes.
  for i in 1 .. 100 loop
    perform pg_temp.generar(i);
  end loop;

  -- 6 traslados internos desde Valparaíso (1 vehículo cada uno).
  perform pg_temp.ev(pg_temp.t(-20, '10:30'), 1001, 'tr_crear', 'LG', '{"origen":9,"destino":6,"obs":"Rebalanceo de stock hacia 15 Norte."}');
  perform pg_temp.ev(pg_temp.t(-19, '08:15'), 1001, 'tr_despachar', 'LG');
  perform pg_temp.ev(pg_temp.t(-18, '12:40'), 1001, 'tr_recibir', 'JL6', '{"novedades":false}');

  perform pg_temp.ev(pg_temp.t(-15, '09:50'), 1002, 'tr_crear', 'LG', '{"origen":9,"destino":7}');
  perform pg_temp.ev(pg_temp.t(-14, '08:00'), 1002, 'tr_despachar', 'LG');
  perform pg_temp.ev(pg_temp.t(-13, '16:20'), 1002, 'tr_recibir', 'JL7', '{"novedades":true,"obs":"Rayón en el capó; se informa a bodega central."}');

  perform pg_temp.ev(pg_temp.t(-6, '11:10'), 1003, 'tr_crear', 'LG', '{"origen":9,"destino":8,"obs":"Unidad para la vitrina de Santiago Centro."}');
  perform pg_temp.ev(pg_temp.t(-5, '07:45'), 1003, 'tr_despachar', 'LG');
  perform pg_temp.ev(pg_temp.t(-4, '15:00'), 1003, 'tr_recibir', 'JL6', '{"novedades":false,"obs":"Llegó con la documentación completa."}');

  perform pg_temp.ev(pg_temp.t(-2, '14:30'), 1004, 'tr_crear', 'LG', '{"origen":9,"destino":7}');
  perform pg_temp.ev(pg_temp.t(-1, '08:10'), 1004, 'tr_despachar', 'LG');

  perform pg_temp.ev(pg_temp.hace(5), 1005, 'tr_crear', 'LG', '{"origen":9,"destino":6,"obs":"Pendiente de cupo en el camión de mañana."}');

  perform pg_temp.ev(pg_temp.t(-8, '10:00'), 1006, 'tr_crear', 'LG', '{"origen":9,"destino":6}');
  perform pg_temp.ev(pg_temp.t(-7, '08:30'), 1006, 'tr_despachar', 'LG');
  perform pg_temp.ev(pg_temp.t(-7, '11:45'), 1006, 'tr_cancelar', 'LG', '{"motivo":"El camión quedó detenido por una falla; la unidad retorna a Valparaíso.","ubicacion":9}');

  -- Stock sin ubicación ni historial, en orden determinista.
  insert into pg_temp.seed_pool (vehiculo_id)
  select v.id from public.vehiculo v
  where v.ubicacion is null
    and not exists (select 1 from public.solicitud_vehiculo sv where sv.vehiculo_id = v.id)
    and not exists (select 1 from public.traslado_interno_vehiculo tv where tv.vehiculo_id = v.id)
  order by md5(v.chasis)
  limit 400;

  select sum((p->>'nveh')::int) into v_nveh from pg_temp.seed_evento where op = 'crear';
  if (select count(*) from pg_temp.seed_pool) < v_nveh then
    raise exception 'Stock insuficiente: se necesitan % vehículos sin historial.', v_nveh;
  end if;

  -- Vehículos ubicados y libres según TrasladoService.crearTraslado.
  insert into pg_temp.seed_pool_ubicado (vehiculo_id, ubicacion)
  select v.id, v.ubicacion from public.vehiculo v
  where v.ubicacion is not null
    and not exists (
      select 1 from public.solicitud_vehiculo sv join public.solicitud s on s.id = sv.solicitud_id
      where sv.vehiculo_id = v.id and sv.disponibilidad = 'reservado'
        and s.estado in ('pendiente_aprobacion','aprobada','pendiente','priorizada','asignada','calendarizada','despachada','en_transito','entregada'))
    and not exists (select 1 from public.solicitud_vehiculo sv where sv.vehiculo_id = v.id and sv.disponibilidad = 'vendido')
    and not exists (
      select 1 from public.traslado_interno_vehiculo tv join public.traslado_interno t on t.id = tv.traslado_id
      where tv.vehiculo_id = v.id and t.estado in ('pendiente', 'en_transito'));

  -- Orden cronológico global: las colas quedan como si cada acción hubiera
  -- ocurrido en su momento.
  for r in select * from pg_temp.seed_evento order by ts, seq loop
    perform pg_temp.ejecutar(r.ts, r.n, r.op, r.actor, r.p);
  end loop;

  select string_agg(format('S%s: %s (esperado %s)', e.n, coalesce(s.estado::text, 'no existe'), e.estado), '; ')
  into v_mal
  from pg_temp.seed_esperado e
  left join public.solicitud s on s.id = pg_temp.sid(e.n)
  where s.estado is distinct from e.estado::public.estado_solicitud;
  if v_mal is not null then
    raise exception 'Estados finales incorrectos: %', v_mal;
  end if;

  select string_agg(estado || ' ' || c, ', ' order by c desc) into v_resumen
  from (select estado::text as estado, count(*) as c from public.solicitud
        where id between pg_temp.sid(1001) and pg_temp.sid(1100) group by 1) x;

  raise notice 'Creadas 100 solicitudes (%), % vehículos reservados y 6 traslados internos.', v_resumen, v_nveh;
end
$$;

commit;
