-- =============================================================================
-- Asignación de sucursales y zonas por rol
-- =============================================================================
-- Reglas:
--   - Ejecutivo: una sucursal (usuario.sucursal_id).
--   - Logística: sucursal base (usuario.sucursal_id) y UNA zona (usuario_zona).
--   - Jefe de local: sucursal base (usuario.sucursal_id) y sucursales
--     adicionales. Todas quedan a su cargo en sucursal.usuario_id: como es una
--     sola columna, una sucursal nunca tiene dos jefes. No hace falta una tabla
--     N:M (el código consultaba una tabla `usuario_sucursal` que no existe).
--
-- Problemas que corrige (verificados en producción el 2026-10-13):
--   1. sucursal.usuario_id aceptaba administradores. Al editar un administrador
--      con "sucursales a su cargo", el service le pasó TODAS las sucursales y
--      se las quitó en silencio a los jefes de local: hoy las 6 sucursales
--      están a cargo de un administrador y ninguna de un jefe de local.
--   2. Nada impedía que una sucursal fuera base de un jefe y estuviera a cargo
--      de otro, ni que dos jefes la tuvieran como base.
--   3. usuario_zona permitía varias zonas por usuario.
--   4. La RLS de `solicitud` solo dejaba ver al jefe de local su sucursal base
--      y solo en estado pendiente o priorizada; observaciones y vehículos, solo
--      a los participantes directos.
--
-- Qué hace:
--   A. Datos: quita los encargados que no son jefe de local y deja la
--      sucursal base de cada jefe a su cargo (si nadie más la tiene).
--   B. sucursal: el encargado debe ser jefe de local y la sucursal no puede
--      ser la base de otro jefe.
--   C. usuario: la sucursal base de un jefe no puede tener otro jefe; al
--      guardarla queda a su cargo; si deja de ser jefe, se liberan sus
--      sucursales.
--   D. usuario_zona: una zona por usuario (índice único).
--   E. RLS: el jefe de local lee solicitudes, vehículos, observaciones y
--      traslados de todas sus sucursales (base + adicionales), origen o destino.
--
-- Después de aplicarla, asignar desde /admin/usuarios las sucursales que
-- quedaron sin jefe (ver la consulta de "Verificación posterior").
--
-- Rollback: supabase/rollback/20261013155000_asignacion_sucursales_y_zonas_por_rol.sql
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- A. Datos
-- -----------------------------------------------------------------------------

do $$
declare
  v_detalle text;
begin
  select string_agg(format('%s (%s → encargado %s, rol %s)', s.id, s.nombre, u.nombre || ' ' || u.apellido, u.rol), '; ')
  into v_detalle
  from public.sucursal s join public.usuario u on u.id = s.usuario_id
  where u.rol <> 'jefe_local';
  if v_detalle is not null then
    raise notice 'Se quitan encargados que no son jefe de local: %', v_detalle;
  end if;
end
$$;

update public.sucursal s
set usuario_id = null
from public.usuario u
where u.id = s.usuario_id and u.rol <> 'jefe_local';

-- La base de cada jefe queda a su cargo, salvo que esté en conflicto.
update public.sucursal s
set usuario_id = u.id
from public.usuario u
where u.rol = 'jefe_local'
  and u.sucursal_id = s.id
  and s.usuario_id is null
  and not exists (
    select 1 from public.usuario u2
    where u2.rol = 'jefe_local' and u2.sucursal_id = s.id and u2.id <> u.id
  );

-- Conflictos que no se resuelven solos: se informan y la migración se detiene.
do $$
declare
  v_detalle text;
begin
  select string_agg(format('sucursal %s: jefes %s', x.sucursal_id, x.jefes), '; ')
  into v_detalle
  from (
    select u.sucursal_id, string_agg(u.nombre || ' ' || u.apellido, ', ') as jefes
    from public.usuario u
    where u.rol = 'jefe_local' and u.sucursal_id is not null
    group by u.sucursal_id
    having count(*) > 1
    union all
    select s.id, e.nombre || ' ' || e.apellido || ' (encargado) y ' || b.nombre || ' ' || b.apellido || ' (base)'
    from public.sucursal s
    join public.usuario e on e.id = s.usuario_id
    join public.usuario b on b.sucursal_id = s.id and b.rol = 'jefe_local' and b.id <> e.id
  ) x;
  if v_detalle is not null then
    raise exception 'Hay sucursales con más de un jefe de local. Reasignarlas antes de aplicar: %', v_detalle;
  end if;

  select string_agg(usuario_id::text, ', ') into v_detalle
  from (select usuario_id from public.usuario_zona group by usuario_id having count(*) > 1) x;
  if v_detalle is not null then
    raise exception 'Hay usuarios con más de una zona. Dejar una sola antes de aplicar: %', v_detalle;
  end if;
end
$$;

-- -----------------------------------------------------------------------------
-- B. sucursal: el encargado es un jefe de local y no es base de otro jefe
-- -----------------------------------------------------------------------------

create or replace function public.validar_encargado_sucursal()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_rol text;
  v_otro text;
begin
  if new.usuario_id is not null then
    select rol into v_rol from public.usuario where id = new.usuario_id;
    if v_rol is distinct from 'jefe_local' then
      raise exception 'El encargado de la sucursal debe tener rol Jefe de Local.' using errcode = 'P0001';
    end if;

    select u.nombre || ' ' || u.apellido into v_otro
    from public.usuario u
    where u.rol = 'jefe_local' and u.sucursal_id = new.id and u.id <> new.usuario_id
    limit 1;
    if v_otro is not null then
      raise exception 'La sucursal % es la sucursal base de %: cada sucursal tiene un solo jefe de local.',
        coalesce(new.nombre, new.id::text), v_otro using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

-- El trigger trg_validar_encargado_sucursal (BEFORE INSERT OR UPDATE OF
-- usuario_id) ya existe y usa esta función.

-- -----------------------------------------------------------------------------
-- C. usuario: sucursal base del jefe de local
-- -----------------------------------------------------------------------------

create or replace function public.fn_validar_base_jefe_local()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_otro text;
begin
  if new.rol = 'jefe_local' and new.sucursal_id is not null then
    select e.nombre || ' ' || e.apellido into v_otro
    from public.sucursal s
    join public.usuario e on e.id = s.usuario_id
    where s.id = new.sucursal_id and s.usuario_id <> new.id and e.rol = 'jefe_local';

    if v_otro is null then
      select u.nombre || ' ' || u.apellido into v_otro
      from public.usuario u
      where u.rol = 'jefe_local' and u.sucursal_id = new.sucursal_id and u.id <> new.id
      limit 1;
    end if;

    if v_otro is not null then
      raise exception 'La sucursal ya tiene un jefe de local (%): cada sucursal tiene un solo jefe.', v_otro
        using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.fn_sincronizar_sucursales_jefe_local()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- Deja de ser jefe de local: sus sucursales quedan sin jefe.
  if tg_op = 'UPDATE' and old.rol = 'jefe_local' and new.rol <> 'jefe_local' then
    update public.sucursal set usuario_id = null where usuario_id = new.id;
  end if;

  -- La sucursal base del jefe queda a su cargo.
  if new.rol = 'jefe_local' and new.sucursal_id is not null then
    update public.sucursal
    set usuario_id = new.id
    where id = new.sucursal_id and usuario_id is distinct from new.id;
  end if;
  return new;
end;
$$;

revoke execute on function public.fn_validar_base_jefe_local() from public, anon, authenticated;
revoke execute on function public.fn_sincronizar_sucursales_jefe_local() from public, anon, authenticated;

drop trigger if exists tr_validar_base_jefe_local on public.usuario;
create trigger tr_validar_base_jefe_local
  before insert or update of rol, sucursal_id on public.usuario
  for each row execute function public.fn_validar_base_jefe_local();

drop trigger if exists tr_sincronizar_sucursales_jefe_local on public.usuario;
create trigger tr_sincronizar_sucursales_jefe_local
  after insert or update of rol, sucursal_id on public.usuario
  for each row execute function public.fn_sincronizar_sucursales_jefe_local();

-- -----------------------------------------------------------------------------
-- D. usuario_zona: una zona por usuario
-- -----------------------------------------------------------------------------

create unique index if not exists usuario_zona_una_por_usuario on public.usuario_zona (usuario_id);

-- -----------------------------------------------------------------------------
-- E. RLS: alcance del jefe de local = todas sus sucursales
-- -----------------------------------------------------------------------------

drop policy if exists solicitud_select_participantes on public.solicitud;
create policy solicitud_select_participantes on public.solicitud
  for select to authenticated
  using (
    usuario_activo() and (
      tiene_rol('administrador')
      or ejecutivo_id = auth.uid()
      or jefe_local_id = auth.uid()
      or logistica_id = auth.uid()
      or (tiene_rol('jefe_local') and (
        usuario_tiene_sucursal(auth.uid(), sucursal)
        or usuario_tiene_sucursal(auth.uid(), sucursal_destino)
      ))
    )
  );

drop policy if exists sv_select_participantes on public.solicitud_vehiculo;
create policy sv_select_participantes on public.solicitud_vehiculo
  for select to authenticated
  using (
    usuario_activo() and (
      tiene_rol('administrador')
      or exists (
        select 1 from public.solicitud s
        where s.id = solicitud_vehiculo.solicitud_id
          and (
            s.ejecutivo_id = auth.uid()
            or s.jefe_local_id = auth.uid()
            or s.logistica_id = auth.uid()
            or (tiene_rol('jefe_local') and (
              usuario_tiene_sucursal(auth.uid(), s.sucursal)
              or usuario_tiene_sucursal(auth.uid(), s.sucursal_destino)
            ))
          )
      )
    )
  );

drop policy if exists observacion_select_participantes on public.observacion;
create policy observacion_select_participantes on public.observacion
  for select to authenticated
  using (
    usuario_activo() and (
      tiene_rol('administrador')
      or exists (
        select 1 from public.solicitud s
        where s.id = observacion.solicitud_id
          and (
            s.ejecutivo_id = auth.uid()
            or s.jefe_local_id = auth.uid()
            or s.logistica_id = auth.uid()
            or (tiene_rol('jefe_local') and (
              usuario_tiene_sucursal(auth.uid(), s.sucursal)
              or usuario_tiene_sucursal(auth.uid(), s.sucursal_destino)
            ))
          )
      )
    )
  );

-- Igual que traslado_select: el jefe ve los traslados de origen o destino.
drop policy if exists traslado_veh_select on public.traslado_interno_vehiculo;
create policy traslado_veh_select on public.traslado_interno_vehiculo
  for select to authenticated
  using (
    usuario_activo() and exists (
      select 1 from public.traslado_interno t
      where t.id = traslado_interno_vehiculo.traslado_id
        and (
          tiene_rol('administrador')
          or (tiene_rol('logistica') and t.logistica_id = auth.uid())
          or (tiene_rol('jefe_local') and (
            usuario_tiene_sucursal(auth.uid(), t.destino_id)
            or usuario_tiene_sucursal(auth.uid(), t.origen_id)
          ))
        )
    )
  );

commit;

-- =============================================================================
-- Verificación posterior (solo lectura)
-- =============================================================================
-- 1. Sucursales y su jefe de local (las que quedan sin jefe hay que asignarlas
--    desde /admin/usuarios):
--   select s.id, s.nombre, u.nombre || ' ' || u.apellido as jefe
--   from public.sucursal s left join public.usuario u on u.id = s.usuario_id
--   order by s.id;
--
-- 2. Todo encargado es jefe de local y ninguna sucursal tiene dos jefes (0 filas):
--   select s.id from public.sucursal s join public.usuario u on u.id = s.usuario_id where u.rol <> 'jefe_local'
--   union all
--   select u.sucursal_id from public.usuario u join public.sucursal s on s.id = u.sucursal_id
--   where u.rol = 'jefe_local' and s.usuario_id is distinct from u.id;
--
-- 3. Triggers e índice:
--   select tgname from pg_trigger where tgrelid = 'public.usuario'::regclass and tgname like 'tr_%jefe_local';
--   select indexname from pg_indexes where indexname = 'usuario_zona_una_por_usuario';
