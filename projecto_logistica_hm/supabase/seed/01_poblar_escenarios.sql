-- =============================================================================
-- Datos de prueba: escenarios del ciclo de vida de solicitudes y traslados
-- =============================================================================
--
-- Puebla la base con 30 solicitudes y 4 traslados internos que cuentan una
-- historia coherente (ver supabase/seed/README.md). Cada solicitud recorre las
-- MISMAS transiciones que hace SolicitudesService (UPDATE ... WHERE estado =
-- <estado esperado>), así los triggers reales de la BD (fechas, slots,
-- reservas, movimiento de vehículos) se disparan igual que en producción, y
-- cada paso deja su fila de auditoría con el actor y la hora del evento.
--
-- No crea usuarios ni vehículos: usa los usuarios reales de cada rol y
-- vehículos del stock existente. No modifica el esquema: los helpers son
-- funciones temporales (pg_temp) que desaparecen al cerrar la sesión.
--
-- Marca de los datos de prueba: el id de cada fila creada empieza con `5eed`.
--   5eed0001  solicitud              5eed0005  insistencia
--   5eed0002  solicitud_vehiculo     5eed0006  traslado_interno
--   5eed0003  observacion            5eed0007  traslado_interno_vehiculo
--   5eed0004  auditoria
--
-- Idempotente: si ya hay datos de prueba, no hace nada (aviso NOTICE). Para
-- regenerarlos con fechas actuales: 02_limpiar_escenarios.sql y luego este.
--
-- Las fechas son relativas al día de ejecución (hora de Chile): D-0 = hoy.
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
  ('LG',  '9b0a00d5-7615-4d25-b418-cfb16061861a', 'logistica');   -- logística con la zona 1 (6, 7, 9)

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
-- Escenarios
-- -----------------------------------------------------------------------------
-- Sucursales: 6 = 15 NORTE, 7 = CONCON, 8 = SANTIAGO CENTRO, 9 = VALPARAISO.
-- `limite` y `fecha` son días relativos a hoy; `nveh` = vehículos de stock.

-- ---- Pendientes de aprobación (bandeja del jefe de local) -------------------

-- S01: venta recién creada por el ejecutivo de Valparaíso.
select pg_temp.ev(pg_temp.hace(3), 1, 'crear', 'EJ9', '{"tipo":"venta","origen":9,"destino":9,"limite":5,"nveh":1,
  "obs":"Cliente con crédito automotriz aprobado. Necesita la unidad con mantención de entrega lista para el sábado."}');
insert into seed_esperado values (1, 'pendiente_aprobacion');

-- S02: venta de flota (2 unidades) con insistencia del ejecutivo (cooldown activo).
select pg_temp.ev(pg_temp.t(-1, '10:20'), 2, 'crear', 'EJ6', '{"tipo":"venta","origen":6,"destino":6,"limite":6,"nveh":2,
  "obs":"Venta a empresa: 2 unidades para flota comercial, factura a 30 días."}');
select pg_temp.ev(pg_temp.hace(2), 2, 'insistir', 'EJ6', '{"msg":"El cliente quiere firmar mañana a primera hora, ¿se puede aprobar hoy?"}');
insert into seed_esperado values (2, 'pendiente_aprobacion');

-- S03: evento esperando aprobación hace 3 días (la más antigua de la bandeja).
select pg_temp.ev(pg_temp.t(-3, '11:05'), 3, 'crear', 'EJ9', '{"tipo":"evento","origen":9,"limite":5,"nveh":2,
  "titulo":"Exhibición Mall Marina Arauco","direccion":"Av. Libertad 1348, Viña del Mar",
  "obs":"Exhibición de fin de semana en el hall central. Se requieren las unidades lavadas el viernes."}');
insert into seed_esperado values (3, 'pendiente_aprobacion');

-- ---- Aprobadas por priorizar ---------------------------------------------------

-- S04: aprobada por el jefe de local, aún fuera de la cola.
select pg_temp.ev(pg_temp.t(-3, '09:30'), 4, 'crear', 'EJ6', '{"tipo":"venta","origen":6,"destino":6,"limite":7,"nveh":1}');
select pg_temp.ev(pg_temp.t(-2, '12:10'), 4, 'aprobar', 'JL6', '{"limite":6}');
insert into seed_esperado values (4, 'aprobada');

-- S05: creada por el jefe de local de Concón (queda aprobada de inmediato).
select pg_temp.ev(pg_temp.t(-1, '15:40'), 5, 'crear', 'JL7', '{"tipo":"venta","origen":7,"destino":7,"limite":9,"nveh":1,
  "obs":"Reposición de unidad de exhibición vendida la semana pasada."}');
insert into seed_esperado values (5, 'aprobada');

-- ---- En cola de prioridad ------------------------------------------------------

-- S06: primera de la cola de Valparaíso.
select pg_temp.ev(pg_temp.t(-6, '10:00'), 6, 'crear', 'EJ9', '{"tipo":"venta","origen":9,"destino":9,"limite":3,"nveh":1}');
select pg_temp.ev(pg_temp.t(-5, '09:15'), 6, 'aprobar', 'JL6', '{"limite":4}');
select pg_temp.ev(pg_temp.t(-5, '09:20'), 6, 'priorizar', 'JL6');
select pg_temp.ev(pg_temp.t(-4, '12:30'), 6, 'observar', 'EJ9', '{"texto":"Cliente confirma pago del pie. Queda pendiente solo el traslado."}');
insert into seed_esperado values (6, 'priorizada');

-- S07: segunda de la cola de Valparaíso, con insistencia de ayer.
select pg_temp.ev(pg_temp.t(-4, '16:10'), 7, 'crear', 'EJ9', '{"tipo":"venta","origen":9,"destino":9,"limite":9,"nveh":1}');
select pg_temp.ev(pg_temp.t(-3, '10:00'), 7, 'aprobar', 'JL6', '{"limite":10}');
select pg_temp.ev(pg_temp.t(-3, '10:05'), 7, 'priorizar', 'JL6');
select pg_temp.ev(pg_temp.t(-1, '10:00'), 7, 'insistir', 'EJ9', '{"msg":"El cliente pregunta por la fecha estimada de entrega."}');
insert into seed_esperado values (7, 'priorizada');

-- S08: creada por el jefe de local y delegada al ejecutivo de 15 Norte.
select pg_temp.ev(pg_temp.t(-5, '11:00'), 8, 'crear', 'JL6', '{"tipo":"venta","origen":6,"destino":6,"limite":5,"nveh":1,
  "delegada_a":"EJ6","obs":"Cliente derivado desde la sala de ventas; lo atiende el ejecutivo."}');
select pg_temp.ev(pg_temp.t(-4, '09:00'), 8, 'priorizar', 'JL6');
insert into seed_esperado values (8, 'priorizada');

-- S09: dos unidades en la cola de Concón hace una semana (pendiente para Logística).
select pg_temp.ev(pg_temp.t(-7, '10:30'), 9, 'crear', 'JL7', '{"tipo":"venta","origen":7,"destino":7,"limite":2,"nveh":2}');
select pg_temp.ev(pg_temp.t(-7, '10:35'), 9, 'priorizar', 'JL7');
insert into seed_esperado values (9, 'priorizada');

-- S29: estuvo calendarizada y Logística la devolvió a la cola.
select pg_temp.ev(pg_temp.t(-8, '09:00'), 29, 'crear', 'EJ6', '{"tipo":"venta","origen":6,"destino":6,"limite":6,"nveh":1}');
select pg_temp.ev(pg_temp.t(-7, '11:00'), 29, 'aprobar', 'JL6', '{"limite":6}');
select pg_temp.ev(pg_temp.t(-7, '11:05'), 29, 'priorizar', 'JL6');
select pg_temp.ev(pg_temp.t(-5, '10:00'), 29, 'calendarizar', 'LG', '{"fecha":3}');
select pg_temp.ev(pg_temp.t(-2, '09:30'), 29, 'descalendarizar', 'LG');
select pg_temp.ev(pg_temp.t(-2, '09:35'), 29, 'observar', 'LG', '{"texto":"Se libera el cupo del camión para una entrega urgente; se reprogramará esta semana."}');
insert into seed_esperado values (29, 'priorizada');

-- ---- Asignadas a un encargado de Logística ------------------------------------

-- S10
select pg_temp.ev(pg_temp.t(-5, '12:00'), 10, 'crear', 'EJ9', '{"tipo":"venta","origen":9,"destino":9,"limite":6,"nveh":1}');
select pg_temp.ev(pg_temp.t(-4, '09:40'), 10, 'aprobar', 'JL6', '{"limite":6}');
select pg_temp.ev(pg_temp.t(-3, '15:00'), 10, 'asignar', 'LG');
insert into seed_esperado values (10, 'asignada');

-- S11
select pg_temp.ev(pg_temp.t(-2, '10:00'), 11, 'crear', 'JL7', '{"tipo":"venta","origen":7,"destino":7,"limite":8,"nveh":1}');
select pg_temp.ev(pg_temp.t(-1, '11:30'), 11, 'asignar', 'LG');
insert into seed_esperado values (11, 'asignada');

-- ---- Calendarizadas ------------------------------------------------------------

-- S12: despachada por error y revertida; reprogramada para mañana.
select pg_temp.ev(pg_temp.t(-8, '10:15'), 12, 'crear', 'EJ9', '{"tipo":"venta","origen":9,"destino":9,"limite":3,"nveh":1}');
select pg_temp.ev(pg_temp.t(-7, '09:00'), 12, 'aprobar', 'JL6', '{"limite":2}');
select pg_temp.ev(pg_temp.t(-7, '09:05'), 12, 'priorizar', 'JL6');
select pg_temp.ev(pg_temp.t(-3, '10:00'), 12, 'calendarizar', 'LG', '{"fecha":-1}');
select pg_temp.ev(pg_temp.t(-1, '09:00'), 12, 'despachar', 'LG');
select pg_temp.ev(pg_temp.t(-1, '09:40'), 12, 'cancelar_despacho', 'LG');
select pg_temp.ev(pg_temp.t(-1, '10:00'), 12, 'recalendarizar', 'LG', '{"fecha":1,
  "motivo":"Despacho revertido: el camión no salió por una falla en la rampa de carga."}');
insert into seed_esperado values (12, 'calendarizada');

-- S13: reprogramada a pedido del cliente.
select pg_temp.ev(pg_temp.t(-10, '09:10'), 13, 'crear', 'EJ6', '{"tipo":"venta","origen":6,"destino":6,"limite":4,"nveh":1}');
select pg_temp.ev(pg_temp.t(-9, '10:00'), 13, 'aprobar', 'JL6', '{"limite":3}');
select pg_temp.ev(pg_temp.t(-8, '09:00'), 13, 'asignar', 'LG');
select pg_temp.ev(pg_temp.t(-6, '11:00'), 13, 'calendarizar', 'LG', '{"fecha":-1}');
select pg_temp.ev(pg_temp.t(-2, '16:00'), 13, 'recalendarizar', 'LG', '{"fecha":2,
  "motivo":"El cliente pidió postergar la entrega por un viaje."}');
insert into seed_esperado values (13, 'calendarizada');

-- S14: venta de 15 Norte para Santiago Centro, programada para hoy.
select pg_temp.ev(pg_temp.t(-6, '12:30'), 14, 'crear', 'JL6', '{"tipo":"venta","origen":6,"destino":8,"limite":2,"nveh":1,
  "obs":"Unidad vendida por la sucursal Santiago Centro; el cliente la retira allá."}');
select pg_temp.ev(pg_temp.t(-5, '09:00'), 14, 'priorizar', 'JL6');
select pg_temp.ev(pg_temp.t(-3, '09:30'), 14, 'calendarizar', 'LG', '{"fecha":0}');
insert into seed_esperado values (14, 'calendarizada');

-- ---- En tránsito ---------------------------------------------------------------

-- S15: despachada ayer, por recibir en Valparaíso.
select pg_temp.ev(pg_temp.t(-9, '09:30'), 15, 'crear', 'EJ9', '{"tipo":"venta","origen":9,"destino":9,"limite":1,"nveh":1}');
select pg_temp.ev(pg_temp.t(-9, '12:00'), 15, 'aprobar', 'JL6', '{"limite":1}');
select pg_temp.ev(pg_temp.t(-8, '09:00'), 15, 'priorizar', 'JL6');
select pg_temp.ev(pg_temp.t(-5, '10:00'), 15, 'calendarizar', 'LG', '{"fecha":-1}');
select pg_temp.ev(pg_temp.t(-1, '08:30'), 15, 'despachar', 'LG');
select pg_temp.ev(pg_temp.t(-1, '08:35'), 15, 'observar', 'LG', '{"texto":"Sale en el camión de la ruta costa; llegada estimada mañana en la mañana."}');
insert into seed_esperado values (15, 'en_transito');

-- S16: atrasada: la fecha límite ya pasó y sigue en tránsito.
select pg_temp.ev(pg_temp.t(-14, '10:00'), 16, 'crear', 'JL7', '{"tipo":"venta","origen":7,"destino":7,"limite":-2,"nveh":1}');
select pg_temp.ev(pg_temp.t(-13, '10:05'), 16, 'priorizar', 'JL7');
select pg_temp.ev(pg_temp.t(-10, '09:00'), 16, 'calendarizar', 'LG', '{"fecha":-6}');
select pg_temp.ev(pg_temp.t(-6, '16:30'), 16, 'recalendarizar', 'LG', '{"fecha":-3,
  "motivo":"Sin cupo en el camión de la ruta costa."}');
select pg_temp.ev(pg_temp.t(-3, '08:45'), 16, 'despachar', 'LG');
insert into seed_esperado values (16, 'en_transito');

-- S17: evento en curso (las unidades están en la exhibición).
select pg_temp.ev(pg_temp.t(-7, '10:00'), 17, 'crear', 'EJ6', '{"tipo":"evento","origen":6,"limite":1,"nveh":1,
  "titulo":"Test drive Club de Golf Granadilla","direccion":"Camino Granadilla s/n, Viña del Mar"}');
select pg_temp.ev(pg_temp.t(-6, '09:30'), 17, 'aprobar', 'JL6', '{"limite":1}');
select pg_temp.ev(pg_temp.t(-5, '10:00'), 17, 'asignar', 'LG');
select pg_temp.ev(pg_temp.t(-4, '10:00'), 17, 'calendarizar', 'LG', '{"fecha":-2}');
select pg_temp.ev(pg_temp.t(-2, '08:00'), 17, 'despachar', 'LG');
insert into seed_esperado values (17, 'en_transito');

-- ---- Recibidas, por entregar al cliente -----------------------------------------

-- S18: recibida sin novedades hace 6 días; el ejecutivo aún no la entrega.
select pg_temp.ev(pg_temp.t(-12, '09:00'), 18, 'crear', 'EJ9', '{"tipo":"venta","origen":9,"destino":9,"limite":-4,"nveh":1}');
select pg_temp.ev(pg_temp.t(-12, '11:30'), 18, 'aprobar', 'JL6', '{"limite":-4}');
select pg_temp.ev(pg_temp.t(-11, '09:10'), 18, 'priorizar', 'JL6');
select pg_temp.ev(pg_temp.t(-9, '10:00'), 18, 'calendarizar', 'LG', '{"fecha":-7}');
select pg_temp.ev(pg_temp.t(-7, '08:30'), 18, 'despachar', 'LG');
select pg_temp.ev(pg_temp.t(-6, '15:00'), 18, 'recibir', 'JL6', '{"novedades":false}');
insert into seed_esperado values (18, 'entregada');

-- S19: recibida con novedades.
select pg_temp.ev(pg_temp.t(-8, '15:00'), 19, 'crear', 'EJ6', '{"tipo":"venta","origen":6,"destino":6,"limite":-1,"nveh":1}');
select pg_temp.ev(pg_temp.t(-7, '09:20'), 19, 'aprobar', 'JL6', '{"limite":-1}');
select pg_temp.ev(pg_temp.t(-6, '10:00'), 19, 'asignar', 'LG');
select pg_temp.ev(pg_temp.t(-5, '09:00'), 19, 'calendarizar', 'LG', '{"fecha":-3}');
select pg_temp.ev(pg_temp.t(-3, '08:00'), 19, 'despachar', 'LG');
select pg_temp.ev(pg_temp.t(-2, '12:30'), 19, 'recibir', 'JL6', '{"novedades":true,
  "obs":"Rayón leve en la puerta trasera izquierda; se deriva a preparación antes de entregar."}');
insert into seed_esperado values (19, 'entregada');

-- ---- Finalizadas (entregadas al cliente) ----------------------------------------

-- S20: ciclo completo; la finaliza el ejecutivo creador.
select pg_temp.ev(pg_temp.t(-20, '10:00'), 20, 'crear', 'EJ9', '{"tipo":"venta","origen":9,"destino":9,"limite":-12,"nveh":1}');
select pg_temp.ev(pg_temp.t(-19, '09:00'), 20, 'aprobar', 'JL6', '{"limite":-12}');
select pg_temp.ev(pg_temp.t(-19, '09:05'), 20, 'priorizar', 'JL6');
select pg_temp.ev(pg_temp.t(-17, '10:00'), 20, 'calendarizar', 'LG', '{"fecha":-15}');
select pg_temp.ev(pg_temp.t(-15, '08:30'), 20, 'despachar', 'LG');
select pg_temp.ev(pg_temp.t(-14, '16:00'), 20, 'recibir', 'JL6', '{"novedades":false}');
select pg_temp.ev(pg_temp.t(-13, '11:00'), 20, 'finalizar', 'EJ9');
insert into seed_esperado values (20, 'finalizada');

-- S21: la finaliza el jefe de local de Concón.
select pg_temp.ev(pg_temp.t(-18, '09:00'), 21, 'crear', 'JL7', '{"tipo":"venta","origen":7,"destino":7,"limite":-10,"nveh":1}');
select pg_temp.ev(pg_temp.t(-18, '09:10'), 21, 'priorizar', 'JL7');
select pg_temp.ev(pg_temp.t(-16, '10:00'), 21, 'calendarizar', 'LG', '{"fecha":-13}');
select pg_temp.ev(pg_temp.t(-13, '08:00'), 21, 'despachar', 'LG');
select pg_temp.ev(pg_temp.t(-12, '14:00'), 21, 'recibir', 'JL7', '{"novedades":false,
  "obs":"Unidad recibida con kit de herramientas y dos llaves."}');
select pg_temp.ev(pg_temp.t(-9, '10:00'), 21, 'finalizar', 'JL7');
insert into seed_esperado values (21, 'finalizada');

-- S22: dos unidades, reprogramada y recibida fuera de plazo.
select pg_temp.ev(pg_temp.t(-16, '11:00'), 22, 'crear', 'EJ6', '{"tipo":"venta","origen":6,"destino":6,"limite":-10,"nveh":2}');
select pg_temp.ev(pg_temp.t(-15, '10:00'), 22, 'aprobar', 'JL6', '{"limite":-10}');
select pg_temp.ev(pg_temp.t(-14, '09:00'), 22, 'asignar', 'LG');
select pg_temp.ev(pg_temp.t(-12, '09:00'), 22, 'calendarizar', 'LG', '{"fecha":-11}');
select pg_temp.ev(pg_temp.t(-11, '08:00'), 22, 'recalendarizar', 'LG', '{"fecha":-8,
  "motivo":"Las unidades no tenían completada la inspección previa a la entrega (PDI)."}');
select pg_temp.ev(pg_temp.t(-8, '08:30'), 22, 'despachar', 'LG');
select pg_temp.ev(pg_temp.t(-7, '17:00'), 22, 'recibir', 'JL6', '{"novedades":false}');
select pg_temp.ev(pg_temp.t(-6, '10:30'), 22, 'finalizar', 'JL6');
insert into seed_esperado values (22, 'finalizada');

-- S23: evento terminado; las unidades volvieron a la sucursal.
select pg_temp.ev(pg_temp.t(-15, '09:00'), 23, 'crear', 'JL6', '{"tipo":"evento","origen":6,"limite":-9,"nveh":1,
  "titulo":"Lanzamiento SUV híbrido en Espacio Urbano","direccion":"Av. Libertad 1348, Viña del Mar"}');
select pg_temp.ev(pg_temp.t(-15, '09:10'), 23, 'priorizar', 'JL6');
select pg_temp.ev(pg_temp.t(-12, '10:00'), 23, 'calendarizar', 'LG', '{"fecha":-11}');
select pg_temp.ev(pg_temp.t(-11, '08:00'), 23, 'despachar', 'LG');
select pg_temp.ev(pg_temp.t(-9, '18:00'), 23, 'recibir', 'JL6', '{"novedades":false,
  "obs":"La unidad vuelve de la exhibición con 12 km recorridos."}');
select pg_temp.ev(pg_temp.t(-9, '18:10'), 23, 'finalizar', 'JL6');
insert into seed_esperado values (23, 'finalizada');

-- S30: finalizada ayer por el ejecutivo.
select pg_temp.ev(pg_temp.t(-11, '10:00'), 30, 'crear', 'EJ9', '{"tipo":"venta","origen":9,"destino":9,"limite":-3,"nveh":1}');
select pg_temp.ev(pg_temp.t(-10, '09:30'), 30, 'aprobar', 'JL6', '{"limite":-3}');
select pg_temp.ev(pg_temp.t(-10, '15:00'), 30, 'asignar', 'LG');
select pg_temp.ev(pg_temp.t(-9, '11:00'), 30, 'calendarizar', 'LG', '{"fecha":-5}');
select pg_temp.ev(pg_temp.t(-5, '08:30'), 30, 'despachar', 'LG');
select pg_temp.ev(pg_temp.t(-4, '11:00'), 30, 'recibir', 'JL6', '{"novedades":false}');
select pg_temp.ev(pg_temp.t(-1, '12:00'), 30, 'finalizar', 'EJ9');
insert into seed_esperado values (30, 'finalizada');

-- ---- Rechazadas -----------------------------------------------------------------

-- S24
select pg_temp.ev(pg_temp.t(-4, '09:00'), 24, 'crear', 'EJ9', '{"tipo":"venta","origen":9,"destino":9,"limite":4,"nveh":1}');
select pg_temp.ev(pg_temp.t(-3, '12:00'), 24, 'rechazar', 'JL6', '{"motivo":
  "La unidad está comprometida para exhibición en sala hasta fin de mes; elige otra del stock."}');
insert into seed_esperado values (24, 'rechazada');

-- S25
select pg_temp.ev(pg_temp.t(-11, '10:00'), 25, 'crear', 'EJ6', '{"tipo":"venta","origen":6,"destino":6,"limite":-4,"nveh":1}');
select pg_temp.ev(pg_temp.t(-10, '09:30'), 25, 'rechazar', 'JL6', '{"motivo":
  "El cliente no tiene aprobado el crédito; reingresar cuando la financiera lo confirme."}');
insert into seed_esperado values (25, 'rechazada');

-- ---- Canceladas -----------------------------------------------------------------

-- S26: la cancela el propio ejecutivo antes de la aprobación.
select pg_temp.ev(pg_temp.t(-8, '12:00'), 26, 'crear', 'EJ6', '{"tipo":"venta","origen":6,"destino":6,"limite":-2,"nveh":1}');
select pg_temp.ev(pg_temp.t(-7, '10:00'), 26, 'cancelar', 'EJ6', '{"motivo":"El cliente desistió de la compra."}');
insert into seed_esperado values (26, 'cancelada');

-- S27: cancelada estando en la cola de Concón.
select pg_temp.ev(pg_temp.t(-9, '10:00'), 27, 'crear', 'JL7', '{"tipo":"venta","origen":7,"destino":7,"limite":-3,"nveh":1}');
select pg_temp.ev(pg_temp.t(-9, '10:10'), 27, 'priorizar', 'JL7');
select pg_temp.ev(pg_temp.t(-5, '16:00'), 27, 'cancelar', 'JL7', '{"motivo":
  "Se vendió una unidad equivalente que ya estaba en el local."}');
insert into seed_esperado values (27, 'cancelada');

-- S28: cancelada en tránsito por una falla del camión.
select pg_temp.ev(pg_temp.t(-10, '09:00'), 28, 'crear', 'EJ9', '{"tipo":"venta","origen":9,"destino":9,"limite":-2,"nveh":1}');
select pg_temp.ev(pg_temp.t(-10, '10:00'), 28, 'aprobar', 'JL6', '{"limite":-2}');
select pg_temp.ev(pg_temp.t(-9, '09:00'), 28, 'priorizar', 'JL6');
select pg_temp.ev(pg_temp.t(-6, '10:00'), 28, 'calendarizar', 'LG', '{"fecha":-4}');
select pg_temp.ev(pg_temp.t(-4, '08:00'), 28, 'despachar', 'LG');
select pg_temp.ev(pg_temp.t(-4, '13:00'), 28, 'cancelar_transito', 'LG', '{"motivo":
  "Falla mecánica del camión en ruta; la unidad vuelve a bodega central.","ubicacion":null}');
insert into seed_esperado values (28, 'cancelada');

-- ---- Traslados internos (1 vehículo cada uno) ------------------------------------

-- T1: recepcionado en Concón.
select pg_temp.ev(pg_temp.t(-9, '11:00'), 1, 'tr_crear', 'LG', '{"origen":9,"destino":7,
  "obs":"Rebalanceo de stock: Concón sin unidades de exhibición de esta línea."}');
select pg_temp.ev(pg_temp.t(-8, '08:00'), 1, 'tr_despachar', 'LG');
select pg_temp.ev(pg_temp.t(-7, '12:00'), 1, 'tr_recibir', 'JL7', '{"novedades":false,"obs":"Llegó con la documentación completa."}');

-- T2: en tránsito hacia 15 Norte (aparece en la bandeja de recepciones).
select pg_temp.ev(pg_temp.t(-2, '15:00'), 2, 'tr_crear', 'LG', '{"origen":9,"destino":6}');
select pg_temp.ev(pg_temp.t(-1, '08:00'), 2, 'tr_despachar', 'LG');

-- T3: pendiente de despacho.
select pg_temp.ev(pg_temp.hace(4), 3, 'tr_crear', 'LG', '{"origen":6,"destino":9,
  "obs":"Unidad para la exhibición de Valparaíso de la próxima semana."}');

-- T4: cancelado en tránsito; la unidad vuelve a Valparaíso.
select pg_temp.ev(pg_temp.t(-5, '10:00'), 4, 'tr_crear', 'LG', '{"origen":9,"destino":7}');
select pg_temp.ev(pg_temp.t(-4, '08:30'), 4, 'tr_despachar', 'LG');
select pg_temp.ev(pg_temp.t(-4, '11:00'), 4, 'tr_cancelar', 'LG', '{"motivo":
  "El camión quedó detenido por una falla; la unidad retorna a Valparaíso.","ubicacion":9}');

-- -----------------------------------------------------------------------------
-- Ejecución
-- -----------------------------------------------------------------------------

do $$
declare
  r          record;
  v_faltante text;
  v_nveh     int;
  v_mal      text;
begin
  -- Idempotencia: si ya hay datos de prueba, no se hace nada.
  if exists (select 1 from public.solicitud where id::text like '5eed0001-%')
     or exists (select 1 from public.traslado_interno where id::text like '5eed0006-%') then
    raise notice 'Ya existen datos de prueba (prefijo 5eed). No se hizo nada. Para regenerarlos ejecuta antes 02_limpiar_escenarios.sql.';
    return;
  end if;

  -- Los actores deben existir, estar activos y aprobados, con el rol esperado.
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

  -- Pool de stock: orden determinista (md5 del chasis) para variar marcas.
  insert into pg_temp.seed_pool (vehiculo_id)
  select v.id from public.vehiculo v
  where v.ubicacion is null
    and not exists (select 1 from public.solicitud_vehiculo sv where sv.vehiculo_id = v.id)
    and not exists (select 1 from public.traslado_interno_vehiculo tv where tv.vehiculo_id = v.id)
  order by md5(v.chasis)
  limit 60;

  select sum((p->>'nveh')::int) into v_nveh from pg_temp.seed_evento where op = 'crear';
  if (select count(*) from pg_temp.seed_pool) < v_nveh then
    raise exception 'Stock insuficiente: se necesitan % vehículos sin historial.', v_nveh;
  end if;

  -- Vehículos ubicados y libres según TrasladoService.crearTraslado.
  insert into pg_temp.seed_pool_ubicado (vehiculo_id, ubicacion)
  select v.id, v.ubicacion from public.vehiculo v
  where v.ubicacion in (6, 9)
    and not exists (
      select 1 from public.solicitud_vehiculo sv join public.solicitud s on s.id = sv.solicitud_id
      where sv.vehiculo_id = v.id and sv.disponibilidad = 'reservado'
        and s.estado in ('pendiente_aprobacion','aprobada','pendiente','priorizada','asignada','calendarizada','despachada','en_transito','entregada'))
    and not exists (select 1 from public.solicitud_vehiculo sv where sv.vehiculo_id = v.id and sv.disponibilidad = 'vendido')
    and not exists (
      select 1 from public.traslado_interno_vehiculo tv join public.traslado_interno t on t.id = tv.traslado_id
      where tv.vehiculo_id = v.id and t.estado in ('pendiente', 'en_transito'));

  -- Los eventos se ejecutan en orden cronológico global: así las posiciones
  -- de las colas quedan como si cada acción hubiera ocurrido en su momento.
  for r in select * from pg_temp.seed_evento order by ts, seq loop
    perform pg_temp.ejecutar(r.ts, r.n, r.op, r.actor, r.p);
  end loop;

  -- Cada solicitud debe terminar en el estado del escenario.
  select string_agg(format('S%s: %s (esperado %s)', e.n, coalesce(s.estado::text, 'no existe'), e.estado), '; ')
  into v_mal
  from pg_temp.seed_esperado e
  left join public.solicitud s on s.id = pg_temp.sid(e.n)
  where s.estado is distinct from e.estado::public.estado_solicitud;
  if v_mal is not null then
    raise exception 'Estados finales incorrectos: %', v_mal;
  end if;

  raise notice 'Datos de prueba creados: % solicitudes, % reservas, % observaciones, % insistencias, % traslados, % registros de auditoría.',
    (select count(*) from public.solicitud where id::text like '5eed0001-%'),
    (select count(*) from public.solicitud_vehiculo where id::text like '5eed0002-%'),
    (select count(*) from public.observacion where id::text like '5eed0003-%'),
    (select count(*) from public.insistencia where id::text like '5eed0005-%'),
    (select count(*) from public.traslado_interno where id::text like '5eed0006-%'),
    (select count(*) from public.auditoria where id::text like '5eed0004-%');
end
$$;

commit;
