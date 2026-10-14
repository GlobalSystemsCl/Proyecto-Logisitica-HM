-- =============================================================================
-- Quién inició cada solicitud: columna solicitud.creado_por
-- =============================================================================
-- La interfaz mostraba "Encargado" = ejecutivo_id o, si no había, jefe_local_id.
-- No es quien la inició: si un jefe de local crea y delega, aparecía el
-- ejecutivo, y jefe_local_id se llena siempre con el jefe de la sucursal. La
-- tabla no guardaba al creador (decisión del responsable, 2026-10-14: mostrar
-- "Iniciada por").
--
-- Qué hace:
--   1. Agrega creado_por (FK a usuario, ON DELETE SET NULL) con su índice.
--   2. Completa las solicitudes existentes, en este orden:
--      a. el usuario del primer registro ASIGNACION_VEHICULO de la auditoría:
--         SolicitudesService.createSolicitud lo escribe con el creador al
--         crear (149 de 153 solicitudes al 2026-10-14);
--      b. si no hay: el jefe de local que registró una delegación;
--      c. si no: el jefe de local cuando no hay ejecutivo; si no, el ejecutivo.
--   Desde ahora la app la guarda al crear.
--
-- Rollback: supabase/rollback/20261014130000_solicitud_creado_por.sql
-- =============================================================================

begin;

alter table public.solicitud
  add column if not exists creado_por uuid
  references public.usuario (id) on delete set null;

create index if not exists solicitud_creado_por_idx on public.solicitud (creado_por);

with primera_reserva as (
  select distinct on (a.entidad_id) a.entidad_id, a.usuario_id
  from public.auditoria a
  where a.accion = 'ASIGNACION_VEHICULO' and a.entidad = 'solicitud_vehiculo'
  order by a.entidad_id, a.created_at
),
delegacion as (
  select distinct on (a.entidad_id) a.entidad_id, a.usuario_id
  from public.auditoria a
  where a.accion = 'delegacion' and a.entidad = 'solicitud'
  order by a.entidad_id, a.created_at
)
update public.solicitud s
set creado_por = coalesce(
  (select p.usuario_id from primera_reserva p join public.usuario u on u.id = p.usuario_id where p.entidad_id = s.id),
  (select d.usuario_id from delegacion d join public.usuario u on u.id = d.usuario_id where d.entidad_id = s.id),
  case when s.ejecutivo_id is null then s.jefe_local_id else s.ejecutivo_id end
)
where s.creado_por is null;

commit;

-- =============================================================================
-- Verificación posterior (solo lectura)
-- =============================================================================
-- select count(*) filter (where creado_por is null) as sin_creador, count(*) as total from public.solicitud;
-- select u.rol, count(*) from public.solicitud s join public.usuario u on u.id = s.creado_por group by u.rol;
