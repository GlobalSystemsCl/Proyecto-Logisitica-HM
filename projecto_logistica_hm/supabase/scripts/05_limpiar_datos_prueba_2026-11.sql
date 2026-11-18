-- =============================================================================
-- Limpieza de TODOS los datos de prueba (2026-11-18)
-- =============================================================================
-- NO es una migración. Ejecutar UNA vez en el SQL Editor, después de bajar un
-- respaldo (Database → Backups). Todo va en una transacción: si algo falla,
-- no se borra nada.
--
-- Qué hay hoy (lectura del 2026-11-18):
--   - Prueba de estrés del 2026-11-17 (rama `stress-test`): 114+ cuentas
--     `@prueba-carga.invalid`, sucursales 9001-9029 y zona 9001 "STRESS",
--     15.635 vehículos con chasis `STRESS…`, ~10.800 solicitudes y su historial,
--     transportista RUT 99999990-1.
--   - Seeds (`5eed…`) y pruebas manuales/QA: el resto de las solicitudes
--     (todas son de prueba), 3 traslados internos (T-1 a T-3), las empresas
--     "logistica" y "empresa de prueba", 1 ausencia, notificaciones, correos
--     registrados y auditoría.
--
-- Borra: solicitudes (y sus vehículos, observaciones, insistencias,
--        documentos), traslados internos, transportistas y camiones,
--        notificaciones, registro de correos, auditoría, ausencias, los
--        vehículos `STRESS…`, las sucursales y la zona STRESS y las cuentas
--        `@prueba-carga.invalid`.
-- Conserva: las sucursales reales (101-145), zonas, marcas, los 2.471
--        vehículos reales del inventario y las cuentas reales (@hmotores.cl y
--        las del equipo).
--
-- Efectos a revisar después:
--   - La prueba de estrés dejó como jefe de 40 sucursales reales a una cuenta
--     ficticia ("Constanza Martínez [STRESS]"). Al borrarla, esas sucursales
--     quedan SIN jefe de local (sucursal.usuario_id pasa a null): asignarlas
--     en /admin/usuarios.
--   - Los 2 vehículos reales que las pruebas movieron de sucursal vuelven a
--     la sucursal donde estaban antes de la primera prueba.
--   - Los archivos del bucket `solicitud-documentos` (2 documentos de prueba)
--     no se borran por SQL: vaciarlos desde Storage.
-- =============================================================================

begin;

-- 0. Seguridad: ningún usuario real puede depender de lo que se borra.
do $$
begin
  if exists (
    select 1 from public.usuario
    where sucursal_id >= 9001 and email not like '%@prueba-carga.invalid'
  ) then
    raise exception 'Hay usuarios reales con base en una sucursal STRESS: reasignarlos antes';
  end if;
  if exists (
    select 1 from public.sucursal
    where id >= 9001 and nombre not like 'STRESS%'
  ) then
    raise exception 'Hay una sucursal 9001+ sin la marca STRESS: revisar a mano';
  end if;
  if exists (
    select 1 from public.vehiculo
    where ubicacion >= 9001 and chasis not like 'STRESS%'
  ) then
    raise exception 'Hay vehículos reales ubicados en sucursales STRESS: moverlos antes';
  end if;
end $$;

-- 1. Vehículos reales movidos por las pruebas: vuelven a su sucursal inicial
--    (la de origen de su primer movimiento de prueba).
with movimientos as (
  select sv.vehiculo_id, sv.sucursal_origen as origen, s.fecha_creacion as t
  from public.solicitud_vehiculo sv
  join public.solicitud s on s.id = sv.solicitud_id
  where sv.sucursal_origen is not null
  union all
  select tv.vehiculo_id, t.origen_id, t.created_at
  from public.traslado_interno_vehiculo tv
  join public.traslado_interno t on t.id = tv.traslado_id
), primero as (
  select distinct on (vehiculo_id) vehiculo_id, origen
  from movimientos
  order by vehiculo_id, t
)
update public.vehiculo v
set ubicacion = p.origen
from primero p
where v.id = p.vehiculo_id
  and v.chasis not like 'STRESS%'
  and v.ubicacion is distinct from p.origen;

-- 2. Ausencias. DELETE y no TRUNCATE: usuario_zona (que se conserva) tiene
--    una FK a ausencia_usuario. Primero las zonas temporales del sustituto.
delete from public.usuario_zona where ausencia_id is not null;
delete from public.ausencia_traspaso;
delete from public.ausencia_usuario;

-- 3. Flujo de solicitudes y traslados. TRUNCATE no dispara los triggers por
--    fila (slots, numeración); los contadores se recalculan en el paso 6.
truncate table
  public.solicitud_documento,
  public.insistencia,
  public.observacion,
  public.solicitud_vehiculo,
  public.solicitud,
  public.traslado_documento,
  public.traslado_interno_vehiculo,
  public.traslado_interno,
  public.camion,
  public.transportista,
  public.notificacion,
  public.correo_envio,
  public.auditoria
restart identity;

alter sequence public.traslado_interno_numero_seq restart with 1;

-- 4. Datos de la prueba de estrés.
delete from public.vehiculo where chasis like 'STRESS%';

-- Las cuentas ficticias (borra public.usuario por cascada; las sucursales que
-- tenían a cargo quedan sin jefe).
delete from auth.users where email like '%@prueba-carga.invalid';

delete from public.sucursal where id >= 9001 and nombre like 'STRESS%';
delete from public.zona where id = 9001 and nombre like 'STRESS%';

-- 5. Correlativos de solicitudes desde 1 en cada sucursal.
update public.sucursal set ultimo_numero_solicitud = 0;

-- 6. Slots: solo vehículos físicos (ya no hay reservas).
select public.fn_recalcular_slots_sucursal(id) from public.sucursal;

-- 7. Verificación: todas las filas deben quedar en 0, salvo las indicadas.
select 'solicitud' as tabla, count(*) from public.solicitud
union all select 'traslado_interno', count(*) from public.traslado_interno
union all select 'transportista', count(*) from public.transportista
union all select 'notificacion', count(*) from public.notificacion
union all select 'auditoria', count(*) from public.auditoria
union all select 'ausencia_usuario', count(*) from public.ausencia_usuario
union all select 'vehiculos STRESS', count(*) from public.vehiculo where chasis like 'STRESS%'
union all select 'cuentas de prueba', count(*) from auth.users where email like '%@prueba-carga.invalid'
union all select 'sucursales/zona STRESS', (select count(*) from public.sucursal where id >= 9001) + (select count(*) from public.zona where id = 9001)
union all select 'sucursal con reservas o correlativo', count(*) from public.sucursal
  where slots_reservados <> 0 or ultimo_numero_solicitud <> 0
-- Estas NO deben quedar en 0:
union all select '(se conservan) vehiculos reales', count(*) from public.vehiculo
union all select '(se conservan) usuarios', count(*) from public.usuario
union all select '(se conservan) sucursales', count(*) from public.sucursal
union all select '(revisar) sucursales sin jefe', count(*) from public.sucursal where usuario_id is null;

commit;
