-- =============================================================================
-- Datos de prueba: notificaciones de la campana para los escenarios poblados
-- =============================================================================
--
-- Ejecutar DESPUÉS de 01, 04 y 05 (01_poblar_escenarios, 04_poblar_100_solicitudes, 05_poblar_10_priorizadas).
--
-- Recorre la historia de las solicitudes y traslados de prueba (auditoría con
-- prefijo 5eed y la creación de cada solicitud) y crea, por cada cambio de
-- estado, las mismas notificaciones que crearía la app:
--   - destinatarios por evento: DESTINATARIOS_APP de src/lib/notificaciones-app.ts
--     (sin el actor y sin repetir usuarios; solo usuarios activos);
--   - títulos y mensajes: textoNotificacion() del mismo archivo;
--   - ruta: rutaNotificacion() (detalle de la solicitud o bandeja de traslados).
--
-- Solo los eventos de los últimos 14 días. Las de más de 2 días quedan leídas;
-- las recientes, sin leer (así la campana muestra contador y bandeja mixta).
--
-- No envía correos: escribe directo en la tabla.
-- Marca: el id de cada notificación empieza con 5eed0008.
-- Idempotente: si ya existen notificaciones 5eed0008, no hace nada.
-- =============================================================================

begin;

do $$
begin
  if exists (select 1 from public.notificacion where id::text like '5eed0008-%') then
    raise notice 'Las notificaciones de prueba ya existen. No se hizo nada.';
  end if;
end
$$;

-- -----------------------------------------------------------------------------
-- Helpers (temporales)
-- -----------------------------------------------------------------------------

-- Usuario activo (o nada).
create function pg_temp.activo(uid uuid) returns setof uuid language sql stable
as $$ select id from public.usuario where id = uid and activo $$;

-- Jefes de local de una sucursal: su base y su encargado (NotificacionService.jefesDeSucursal).
create function pg_temp.jefes(suc bigint) returns setof uuid language sql stable
as $$
  select id from public.usuario where rol = 'jefe_local' and activo and sucursal_id = suc
  union
  select u.id from public.sucursal s join public.usuario u on u.id = s.usuario_id
  where s.id = suc and u.rol = 'jefe_local' and u.activo
$$;

-- Logística de la zona de una sucursal (NotificacionService.logisticaDeSucursal).
create function pg_temp.logistica_zona(suc bigint) returns setof uuid language sql stable
as $$
  select u.id
  from public.sucursal s
  join public.usuario_zona uz on uz.zona_id = s.zona_id
  join public.usuario u on u.id = uz.usuario_id
  where s.id = suc and u.rol = 'logistica' and u.activo
$$;

-- Fecha como formatFecha() de lib/fechas: d/MM/yyyy en UTC.
create function pg_temp.ff(valor text) returns text language sql immutable
as $$ select case when valor is null or valor = '' then null
                  else to_char((valor::timestamptz) at time zone 'UTC', 'FMDD/MM/YYYY') end $$;

-- -----------------------------------------------------------------------------
-- Eventos
-- -----------------------------------------------------------------------------

create temp table seed_ev (
  id         serial primary key,
  ts         timestamptz not null,
  actor      uuid not null,
  entidad    text not null,
  entidad_id uuid not null,
  evento     text not null,
  motivo     text,
  fecha_prog text,
  fecha_ant  text,
  novedades  boolean
) on commit drop;

-- Creación de cada solicitud (no queda en la auditoría de la solicitud).
-- Ejecutivo → solicitud_creada. Jefe de local (con o sin delegación) → solicitud_aprobada.
insert into seed_ev (ts, actor, entidad, entidad_id, evento)
select s.fecha_creacion,
       coalesce(d.usuario_id, case when s.ejecutivo_id is null then s.jefe_local_id else s.ejecutivo_id end),
       'solicitud', s.id,
       case when d.usuario_id is null and s.ejecutivo_id is not null then 'solicitud_creada' else 'solicitud_aprobada' end
from public.solicitud s
left join lateral (
  select a.usuario_id from public.auditoria a
  where a.entidad = 'solicitud' and a.entidad_id = s.id and a.accion = 'delegacion'
  limit 1
) d on true
where s.id::text like '5eed0001-%'
  and coalesce(d.usuario_id, case when s.ejecutivo_id is null then s.jefe_local_id else s.ejecutivo_id end) is not null;

-- Cambios de estado registrados en la auditoría.
insert into seed_ev (ts, actor, entidad, entidad_id, evento, motivo, fecha_prog, fecha_ant, novedades)
select a.created_at, a.usuario_id, a.entidad, a.entidad_id, x.evento,
       a.valor_nuevo->>'motivo',
       pg_temp.ff(a.valor_nuevo->>'fecha_tentativa_despacho'),
       pg_temp.ff(a.valor_anterior->>'fecha_tentativa_despacho'),
       coalesce((a.valor_nuevo->>'con_novedades')::boolean, false)
from public.auditoria a
cross join lateral (
  select case
    when a.entidad = 'solicitud' and a.accion = 'aprobacion' then 'solicitud_aprobada'
    when a.entidad = 'solicitud' and a.accion = 'rechazo' then 'solicitud_rechazada'
    when a.entidad = 'solicitud' and a.accion = 'priorizacion'
         and coalesce(a.valor_anterior->>'estado', '') <> 'priorizada' then 'solicitud_priorizada'
    when a.entidad = 'solicitud' and a.accion = 'asignacion_logistica' then 'solicitud_asignada'
    when a.entidad = 'solicitud' and a.accion = 'calendarizacion' then 'solicitud_calendarizada'
    when a.entidad = 'solicitud' and a.accion = 'recalendarizacion' then 'solicitud_recalendarizada'
    when a.entidad = 'solicitud' and a.accion = 'descalendarizacion' then 'solicitud_descalendarizada'
    when a.entidad = 'solicitud' and a.accion = 'despacho'
         and a.valor_nuevo->>'estado' = 'en_transito' then 'solicitud_despachada'
    when a.entidad = 'solicitud' and a.accion = 'despacho'
         and a.valor_nuevo->>'estado' = 'calendarizada' then 'solicitud_despacho_revertido'
    when a.entidad = 'solicitud' and a.accion = 'entrega' then 'solicitud_recepcionada'
    when a.entidad = 'solicitud' and a.accion = 'finalizacion' then 'solicitud_finalizada'
    when a.entidad = 'solicitud' and a.accion = 'CAMBIO_ESTADO'
         and a.valor_nuevo->>'estado' = 'cancelada' then 'solicitud_cancelada'
    when a.entidad = 'solicitud' and a.accion = 'cancelacion_transito' then 'solicitud_cancelada_transito'
    when a.entidad = 'traslado_interno' and a.accion = 'cancelacion_transito' then 'traslado_interno_cancelado'
  end as evento
) x
where x.evento is not null
  and (a.entidad_id::text like '5eed0001-%' or a.entidad_id::text like '5eed0006-%');

delete from seed_ev where ts < now() - interval '14 days' or ts > now();

-- -----------------------------------------------------------------------------
-- Destinatarios por evento (DESTINATARIOS_APP)
-- -----------------------------------------------------------------------------

create temp table seed_dest on commit drop as
with sol as (
  select s.id, s.sucursal, coalesce(s.sucursal_destino, s.sucursal) as recepcion,
         s.ejecutivo_id, s.logistica_id
  from public.solicitud s where s.id::text like '5eed0001-%'
),
roles(evento, rol) as (
  values
    ('solicitud_creada', 'jefe_origen'),
    ('solicitud_aprobada', 'ejecutivo'), ('solicitud_aprobada', 'logistica_zona'),
    ('solicitud_rechazada', 'ejecutivo'),
    ('solicitud_priorizada', 'ejecutivo'),
    ('solicitud_asignada', 'logistica_encargado'), ('solicitud_asignada', 'ejecutivo'),
    ('solicitud_calendarizada', 'ejecutivo'), ('solicitud_calendarizada', 'jefe_origen'), ('solicitud_calendarizada', 'jefe_recepcion'),
    ('solicitud_recalendarizada', 'ejecutivo'), ('solicitud_recalendarizada', 'jefe_origen'), ('solicitud_recalendarizada', 'jefe_recepcion'),
    ('solicitud_descalendarizada', 'ejecutivo'), ('solicitud_descalendarizada', 'jefe_origen'),
    ('solicitud_despachada', 'jefe_recepcion'), ('solicitud_despachada', 'ejecutivo'),
    ('solicitud_despacho_revertido', 'jefe_recepcion'), ('solicitud_despacho_revertido', 'ejecutivo'),
    ('solicitud_recepcionada', 'ejecutivo'), ('solicitud_recepcionada', 'logistica_encargado'),
    ('solicitud_finalizada', 'jefe_origen'), ('solicitud_finalizada', 'logistica_encargado'),
    ('solicitud_cancelada', 'ejecutivo'), ('solicitud_cancelada', 'jefe_origen'), ('solicitud_cancelada', 'logistica_encargado'),
    ('solicitud_cancelada_transito', 'ejecutivo'), ('solicitud_cancelada_transito', 'jefe_origen'),
    ('solicitud_cancelada_transito', 'jefe_recepcion'), ('solicitud_cancelada_transito', 'logistica_encargado'),
    ('traslado_interno_cancelado', 'jefe_origen'), ('traslado_interno_cancelado', 'jefe_recepcion'),
    ('traslado_interno_cancelado', 'logistica_encargado')
)
select distinct e.id as ev_id, d.usuario_id
from seed_ev e
join roles r on r.evento = e.evento
left join sol s on e.entidad = 'solicitud' and s.id = e.entidad_id
left join public.traslado_interno t on e.entidad = 'traslado_interno' and t.id = e.entidad_id
cross join lateral (
  select u as usuario_id from (
    select pg_temp.activo(s.ejecutivo_id) where r.rol = 'ejecutivo' and s.id is not null
    union all select pg_temp.jefes(s.sucursal) where r.rol = 'jefe_origen' and s.id is not null
    union all select pg_temp.jefes(s.recepcion) where r.rol = 'jefe_recepcion' and s.id is not null
    union all select pg_temp.activo(s.logistica_id) where r.rol = 'logistica_encargado' and s.id is not null
    union all select pg_temp.logistica_zona(s.sucursal) where r.rol = 'logistica_zona' and s.id is not null
    union all select pg_temp.jefes(t.origen_id) where r.rol = 'jefe_origen' and t.id is not null
    union all select pg_temp.jefes(t.destino_id) where r.rol = 'jefe_recepcion' and t.id is not null
    union all select pg_temp.activo(t.logistica_id) where r.rol = 'logistica_encargado' and t.id is not null
  ) q(u)
) d
where d.usuario_id is not null
  and d.usuario_id <> e.actor;

-- -----------------------------------------------------------------------------
-- Notificaciones (textoNotificacion + TIPO_NOTIFICACION_POR_EVENTO)
-- -----------------------------------------------------------------------------

insert into public.notificacion (id, usuario_id, emisor_id, tipo, titulo, mensaje, leida, entidad, entidad_id, ruta, created_at)
select
  ('5eed0008' || substr(gen_random_uuid()::text, 9))::uuid,
  d.usuario_id,
  e.actor,
  (case e.evento
     when 'solicitud_creada' then 'NUEVA_SOLICITUD'
     when 'solicitud_aprobada' then 'SOLICITUD_APROBADA'
     when 'solicitud_rechazada' then 'SOLICITUD_RECHAZADA'
     when 'solicitud_priorizada' then 'SOLICITUD_PRIORIZADA'
     when 'solicitud_asignada' then 'SOLICITUD_ASIGNADA'
     when 'solicitud_calendarizada' then 'SOLICITUD_CALENDARIZADA'
     when 'solicitud_recalendarizada' then 'SOLICITUD_RECALENDARIZADA'
     when 'solicitud_descalendarizada' then 'SOLICITUD_DESCALENDARIZADA'
     when 'solicitud_despachada' then 'SOLICITUD_EN_TRANSITO'
     when 'solicitud_despacho_revertido' then 'SOLICITUD_DESPACHO_REVERTIDO'
     when 'solicitud_recepcionada' then 'SOLICITUD_ENTREGADA'
     when 'solicitud_finalizada' then 'SOLICITUD_FINALIZADA'
     when 'solicitud_cancelada' then 'SOLICITUD_CANCELADA'
     when 'solicitud_cancelada_transito' then 'SOLICITUD_CANCELADA_TRANSITO'
     when 'traslado_interno_cancelado' then 'TRASLADO_INTERNO_CANCELADO'
   end)::public.tipo_notificacion,
  txt.titulo,
  case when length(txt.mensaje) <= 300 then txt.mensaje else rtrim(left(txt.mensaje, 299)) || '…' end,
  e.ts < now() - interval '2 days',
  e.entidad,
  e.entidad_id,
  case when e.entidad = 'solicitud' then '/solicitudes?solicitud=' || e.entidad_id::text else '/solicitudes/traslados' end,
  e.ts
from seed_dest d
join seed_ev e on e.id = d.ev_id
left join public.solicitud s on e.entidad = 'solicitud' and s.id = e.entidad_id
left join public.sucursal so on so.id = s.sucursal
left join public.sucursal sd on sd.id = s.sucursal_destino
left join public.traslado_interno t on e.entidad = 'traslado_interno' and t.id = e.entidad_id
left join public.sucursal tor on tor.id = t.origen_id
left join public.sucursal tde on tde.id = t.destino_id
cross join lateral (
  select
    upper(left(e.entidad_id::text, 8)) as codigo,
    coalesce(so.nombre, tor.nombre, 'Sucursal ' || coalesce(s.sucursal, t.origen_id)) as origen,
    coalesce(sd.nombre, s.titulo_evento, tde.nombre, 'Evento') as destino,
    case when coalesce(trim(e.motivo), '') <> '' then ' Motivo: ' || trim(e.motivo) else '' end as motivo,
    case when e.fecha_prog is not null then ' para el ' || e.fecha_prog else '' end as fecha
) b
cross join lateral (
  select '#' || b.codigo || ' (' || b.origen || ' → ' || b.destino || ')' as ref
) r
cross join lateral (
  select
    case e.evento
      when 'solicitud_creada' then 'Nueva solicitud por aprobar'
      when 'solicitud_aprobada' then 'Solicitud aprobada'
      when 'solicitud_rechazada' then 'Solicitud rechazada'
      when 'solicitud_priorizada' then 'Solicitud en la cola'
      when 'solicitud_asignada' then 'Encargado de Logística asignado'
      when 'solicitud_calendarizada' then 'Traslado programado'
      when 'solicitud_recalendarizada' then 'Traslado reprogramado'
      when 'solicitud_descalendarizada' then 'Programación quitada'
      when 'solicitud_despachada' then 'Vehículo en camino'
      when 'solicitud_despacho_revertido' then 'Despacho revertido'
      when 'solicitud_recepcionada' then case when e.novedades then 'Recibida con novedades' else 'Vehículo recibido' end
      when 'solicitud_finalizada' then 'Solicitud finalizada'
      when 'solicitud_cancelada' then 'Solicitud cancelada'
      when 'solicitud_cancelada_transito' then 'Traslado cancelado en tránsito'
      when 'traslado_interno_cancelado' then 'Traslado interno cancelado'
    end as titulo,
    case e.evento
      when 'solicitud_creada' then 'La solicitud ' || r.ref || ' espera tu aprobación.'
      when 'solicitud_aprobada' then 'La solicitud ' || r.ref || ' fue aprobada.'
      when 'solicitud_rechazada' then 'La solicitud ' || r.ref || ' fue rechazada.' || b.motivo
      when 'solicitud_priorizada' then 'La solicitud ' || r.ref || ' entró a la cola de prioridades.'
      when 'solicitud_asignada' then 'La solicitud ' || r.ref || ' ya tiene encargado de Logística.'
      when 'solicitud_calendarizada' then 'El traslado de la solicitud ' || r.ref || ' quedó programado' || b.fecha || '.'
      when 'solicitud_recalendarizada' then 'El traslado de la solicitud ' || r.ref || ' se reprogramó' || b.fecha
        || case when e.fecha_ant is not null then ' (antes: ' || e.fecha_ant || ')' else '' end || '.' || b.motivo
      when 'solicitud_descalendarizada' then 'La solicitud ' || r.ref || ' volvió a la cola sin fecha de despacho.'
      when 'solicitud_despachada' then 'La solicitud ' || r.ref || ' fue despachada y va en tránsito.'
      when 'solicitud_despacho_revertido' then 'Se revirtió el despacho de la solicitud ' || r.ref || ': vuelve a estar programada.'
      when 'solicitud_recepcionada' then 'La solicitud ' || r.ref || ' fue recibida en destino'
        || case when e.novedades then ' con novedades' else '' end || '.'
      when 'solicitud_finalizada' then 'La solicitud ' || r.ref || ' se entregó al cliente y quedó finalizada.'
      when 'solicitud_cancelada' then 'La solicitud ' || r.ref || ' fue cancelada.' || b.motivo
      when 'solicitud_cancelada_transito' then 'El traslado de la solicitud ' || r.ref || ' se canceló en tránsito.' || b.motivo
      when 'traslado_interno_cancelado' then 'El traslado interno #' || b.codigo || ' (' || b.origen || ' → ' || b.destino
        || ') se canceló en tránsito.' || b.motivo
    end as mensaje
) txt
where not exists (select 1 from public.notificacion where id::text like '5eed0008-%');

-- Resumen por usuario
select u.nombre || ' ' || u.apellido as usuario, u.rol,
       count(*) as notificaciones,
       count(*) filter (where not n.leida) as sin_leer
from public.notificacion n
join public.usuario u on u.id = n.usuario_id
where n.id::text like '5eed0008-%'
group by 1, 2
order by 2, 1;

commit;
