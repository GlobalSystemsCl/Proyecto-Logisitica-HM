-- =============================================================================
-- Rollback de 20261013150000_asignacion_sucursales_y_zonas_por_rol.sql
-- =============================================================================
-- Restaura la función, los triggers, el índice y las policies anteriores.
--
-- Los datos (encargados de sucursal) NO se restauran automáticamente. Antes de
-- la migración (2026-10-13) las 6 sucursales estaban a cargo del usuario
-- 47ef25df-78f1-4ec2-9d33-e2187d3b6cdb (rol administrador). Si se necesitara
-- volver a ese estado, ejecutar después de este rollback:
--   update public.sucursal set usuario_id = '47ef25df-78f1-4ec2-9d33-e2187d3b6cdb'
--   where id in (6, 7, 8, 9, 407, 408);
-- =============================================================================

begin;

drop trigger if exists tr_validar_base_jefe_local on public.usuario;
drop trigger if exists tr_sincronizar_sucursales_jefe_local on public.usuario;
drop function if exists public.fn_validar_base_jefe_local();
drop function if exists public.fn_sincronizar_sucursales_jefe_local();

drop index if exists public.usuario_zona_una_por_usuario;

create or replace function public.validar_encargado_sucursal()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_rol text;
begin
  if new.usuario_id is not null then
    select rol into v_rol from public.usuario where id = new.usuario_id;

    if v_rol is null or (v_rol <> 'jefe_local' and v_rol <> 'administrador') then
      raise exception
        'El encargado de la sucursal debe tener rol Jefe de Local o Administrador.'
        using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

drop policy if exists solicitud_select_participantes on public.solicitud;
create policy solicitud_select_participantes on public.solicitud
  for select to authenticated
  using (
    usuario_activo() and (
      tiene_rol('administrador')
      or ejecutivo_id = auth.uid()
      or jefe_local_id = auth.uid()
      or logistica_id = auth.uid()
      or (tiene_rol('jefe_local')
          and estado = any (array['pendiente'::estado_solicitud, 'priorizada'::estado_solicitud])
          and sucursal = (select u.sucursal_id from public.usuario u where u.id = auth.uid()))
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
          and (s.ejecutivo_id = auth.uid() or s.jefe_local_id = auth.uid() or s.logistica_id = auth.uid())
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
          and (s.ejecutivo_id = auth.uid() or s.jefe_local_id = auth.uid() or s.logistica_id = auth.uid())
      )
    )
  );

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
          or (tiene_rol('jefe_local') and usuario_tiene_sucursal(auth.uid(), t.destino_id))
        )
    )
  );

commit;
