-- =============================================================================
-- Hallazgo #38 de la prueba QA (2026-11-12)
-- =============================================================================
-- El "origen" que mostraban tarjetas, Movimientos y En tránsito era la sucursal
-- que pide (`solicitud.sucursal`), no la sucursal desde la que sale el vehículo.
-- En una venta las dos son la misma ("15 NORTE → 15 NORTE") y "Por tramo"
-- agrupaba mal la factura del transportista.
--
-- `vehiculo.ubicacion` sí es el origen real hasta la recepción, pero al
-- recepcionar `tr_..._entregada` la cambia al destino y el dato se pierde. Por
-- eso se guarda en `solicitud_vehiculo.sucursal_origen` al pedir el vehículo.
--
-- 1. Columna `sucursal_origen` (FK a sucursal, nula = desconocida).
-- 2. Trigger BEFORE INSERT que la llena con `vehiculo.ubicacion`.
-- 3. Relleno: solicitudes aún no recepcionadas toman la ubicación actual del
--    vehículo. Las ya recepcionadas quedan nulas (la app muestra la sucursal
--    que pidió, como antes).
--
-- La app la lee en SOLICITUD_SELECT: aplicar ANTES de desplegar el código.
-- Rollback: supabase/rollback/20261113100000_origen_vehiculo_solicitud.sql
-- =============================================================================

begin;

alter table public.solicitud_vehiculo
  add column if not exists sucursal_origen bigint;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'solicitud_vehiculo_sucursal_origen_fkey'
  ) then
    alter table public.solicitud_vehiculo
      add constraint solicitud_vehiculo_sucursal_origen_fkey
      foreign key (sucursal_origen) references public.sucursal(id) on delete set null;
  end if;
end $$;

comment on column public.solicitud_vehiculo.sucursal_origen is
  'Sucursal desde la que sale el vehículo (su ubicación al pedirlo). Nula si no se conoce.';

create or replace function public.fn_fijar_origen_solicitud_vehiculo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.sucursal_origen is null then
    select v.ubicacion into new.sucursal_origen
    from public.vehiculo v
    where v.id = new.vehiculo_id;
  end if;
  return new;
end;
$$;

revoke execute on function public.fn_fijar_origen_solicitud_vehiculo() from public, anon, authenticated;

drop trigger if exists tr_fijar_origen_solicitud_vehiculo on public.solicitud_vehiculo;
create trigger tr_fijar_origen_solicitud_vehiculo
  before insert on public.solicitud_vehiculo
  for each row execute function public.fn_fijar_origen_solicitud_vehiculo();

-- Relleno de lo que todavía no se recepciona.
update public.solicitud_vehiculo sv
set sucursal_origen = v.ubicacion
from public.vehiculo v, public.solicitud s
where sv.vehiculo_id = v.id
  and sv.solicitud_id = s.id
  and sv.sucursal_origen is null
  and s.estado in ('pendiente_aprobacion', 'aprobada', 'pendiente', 'priorizada', 'asignada',
                   'calendarizada', 'despachada', 'en_transito', 'cancelada', 'rechazada');

commit;
