-- ROLLBACK de 20261013120000_fix_cancelar_traslado_slots_ocupados.sql
-- Restaura la versión de 20261009120000, que descuenta solo slots_reservados
-- (reabre el desfase de slots_ocupados al cancelar un traslado interno).
begin;

create or replace function public.fn_cancelar_traslado_interno(
  p_traslado_id uuid,
  p_usuario_id uuid,
  p_motivo text,
  p_ubicacion bigint
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_estado    public.estado_traslado;
  v_destino   bigint;
  v_vehiculos uuid[];
begin
  select t.estado, t.destino_id into v_estado, v_destino
  from public.traslado_interno t
  where t.id = p_traslado_id
  for update;

  if not found then
    raise exception 'Traslado no encontrado.' using errcode = 'P0001';
  end if;
  if v_estado <> 'en_transito' then
    raise exception 'Solo los traslados en tránsito pueden cancelarse.' using errcode = 'P0001';
  end if;
  if p_motivo is null or length(btrim(p_motivo)) < 5 then
    raise exception 'El motivo de la cancelación es obligatorio (mínimo 5 caracteres).' using errcode = 'P0001';
  end if;
  if p_ubicacion is not null and not exists (select 1 from public.sucursal s where s.id = p_ubicacion) then
    raise exception 'La sucursal indicada como ubicación no existe.' using errcode = 'P0001';
  end if;

  update public.traslado_interno
  set estado = 'cancelado',
      motivo_cancelacion = btrim(p_motivo),
      fecha_cancelacion = now(),
      cancelado_por = p_usuario_id
  where id = p_traslado_id;

  with liberadas as (
    update public.traslado_interno_vehiculo
    set disponibilidad = 'liberado'
    where traslado_id = p_traslado_id and disponibilidad = 'reservado'
    returning vehiculo_id
  )
  select coalesce(array_agg(vehiculo_id), '{}') into v_vehiculos from liberadas;

  update public.vehiculo set ubicacion = p_ubicacion where id = any(v_vehiculos);

  update public.sucursal
  set slots_reservados = greatest(coalesce(slots_reservados, 0) - coalesce(array_length(v_vehiculos, 1), 0), 0)
  where id = v_destino;
end;
$$;

revoke execute on function public.fn_cancelar_traslado_interno(uuid, uuid, text, bigint) from public, anon, authenticated;
grant execute on function public.fn_cancelar_traslado_interno(uuid, uuid, text, bigint) to service_role;

commit;
