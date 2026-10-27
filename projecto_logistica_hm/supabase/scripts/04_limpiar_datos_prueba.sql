-- =============================================================================
-- Limpieza de los datos de prueba antes de la puesta en marcha (2026-10-26)
-- =============================================================================
-- NO es una migración: las migraciones se repiten en cada entorno nuevo
-- (branch, `supabase db reset`) y esto vaciaría los datos reales. Ejecutar
-- UNA vez en el SQL Editor, después de bajar un respaldo (Database → Backups).
--
-- Borra: solicitudes, vehículos del inventario (`solicitud_vehiculo`, también
--        los importados con "Importar Stock"), traslados internos,
--        observaciones, insistencias, documentos, notificaciones, auditoría y
--        transportistas, y las 4 sucursales de prueba (6-9).
-- Conserva: las sucursales reales (101-145), zonas, marcas y usuarios.
--
-- Los archivos del bucket `solicitud-documentos` no se pueden borrar por SQL:
-- vaciarlo desde Storage en el panel de Supabase.
-- =============================================================================

begin;

-- TRUNCATE no dispara los triggers por fila (slots, reservas, numeración).
truncate table
  public.solicitud_documento,
  public.insistencia,
  public.observacion,
  public.solicitud_vehiculo,
  public.solicitud,
  public.traslado_interno_vehiculo,
  public.traslado_interno,
  public.transportista,
  public.notificacion,
  public.auditoria
restart identity;

-- Slots en 0 y el correlativo de solicitudes de cada sucursal vuelve a 1.
update public.sucursal
set slots_ocupados = 0,
    slots_reservados = 0,
    ultimo_numero_solicitud = 0;

-- Sucursales de prueba (6 15 NORTE, 7 CONCON, 8 SANTIAGO CENTRO, 9 VALPARAISO).
-- usuario.sucursal_id es ON DELETE CASCADE: si alguien sigue asignado a una
-- de ellas, se aborta todo en vez de borrar su cuenta.
do $$
begin
  if exists (select 1 from public.usuario where sucursal_id in (6, 7, 8, 9)) then
    raise exception 'Hay usuarios asignados a las sucursales 6-9: reasignarlos antes de ejecutar este script';
  end if;
end $$;

delete from public.sucursal where id in (6, 7, 8, 9);

-- Verificación: todas las filas deben quedar en 0.
select 'solicitud' as tabla, count(*) from public.solicitud
union all select 'solicitud_vehiculo', count(*) from public.solicitud_vehiculo
union all select 'traslado_interno', count(*) from public.traslado_interno
union all select 'notificacion', count(*) from public.notificacion
union all select 'auditoria', count(*) from public.auditoria
union all select 'sucursal con contadores', count(*) from public.sucursal
  where slots_ocupados <> 0 or slots_reservados <> 0 or ultimo_numero_solicitud <> 0
union all select 'sucursales de prueba (6-9)', count(*) from public.sucursal
  where id in (6, 7, 8, 9);

commit;

-- -----------------------------------------------------------------------------
-- Opcional: borrar las cuentas de prueba y dejar solo al administrador.
-- Borra la cuenta de acceso y, en cascada, su fila en `usuario`; las
-- sucursales que tenían a cargo quedan sin encargado. Ejecutar aparte.
-- -----------------------------------------------------------------------------
-- delete from auth.users
-- where id not in (select id from public.usuario where rol = 'administrador');
