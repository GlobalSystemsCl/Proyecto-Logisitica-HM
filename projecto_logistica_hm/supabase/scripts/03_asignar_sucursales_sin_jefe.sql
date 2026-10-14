-- =============================================================================
-- Asignar a Joaquin Lepe las sucursales que quedan sin jefe de local
-- =============================================================================
-- Ejecutar DESPUÉS de migrations/20261013155000_asignacion_sucursales_y_zonas_por_rol.sql.
--
-- La migración quita los encargados que no son jefe de local. En producción
-- (2026-10-13) quedan sin jefe VALPARAISO (9), SANTIAGO CENTRO (8) y las
-- sucursales de prueba 407 y 408. Decisión del responsable: vuelven a quedar a
-- cargo de Joaquin Lepe (jefe de local, base 15 NORTE), como antes de que se
-- asignaran a un administrador. CONCON (7) queda con su jefe de base.
--
-- Solo asigna las que siguen sin jefe; los triggers de la migración rechazan
-- la asignación si la sucursal es base de otro jefe de local.
-- Equivale a marcarlas como "Sucursales adicionales a su cargo" en /admin/usuarios.
-- =============================================================================

begin;

update public.sucursal
set usuario_id = '1442fbe2-a3d8-42d4-bf76-b581bb6562e0'
where id in (8, 9, 407, 408)
  and usuario_id is null;

commit;

-- Verificación (solo lectura):
--   select s.id, s.nombre, u.nombre || ' ' || u.apellido as jefe
--   from public.sucursal s left join public.usuario u on u.id = s.usuario_id
--   order by s.id;
-- Esperado: 6, 8, 9, 407 y 408 → Joaquin Lepe; 7 → maickol concon.
