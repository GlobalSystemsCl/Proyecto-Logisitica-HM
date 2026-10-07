# Brecha 016 — Eliminar una sucursal borra físicamente sus solicitudes y deja archivos huérfanos

## Estado
Pendiente

## Severidad
Medium

## Categoría
Bug / Database — Data loss, Referential integrity

## Descripción
`SucursalesService.deleteSucursal` solo impide borrar si hay usuarios con `sucursal_id`. Si no, borra la sucursal. La FK `solicitud.sucursal → sucursal(id)` es `ON DELETE CASCADE`, y desde `solicitud` cascadean `solicitud_vehiculo`, `observacion`, `insistencia` y `solicitud_documento`. Resultado:
- Se pierden solicitudes históricas, incluidas las finalizadas (ventas).
- Los archivos en Storage (`solicitud-documentos/<solicitud_id>/...`) quedan huérfanos, porque la cascada solo borra filas.
- `auditoria` conserva registros que apuntan a IDs inexistentes.
- Si la sucursal es `sucursal_destino` de alguna solicitud, de `ubicacion` de vehículos o de un traslado, la FK (sin cascade o con RESTRICT) hará fallar el borrado con un error de Postgres crudo.
- No considera encargados (`sucursal.usuario_id`) ni `usuario_zona`.
- Solo cuenta las solicitudes con origen en la sucursal para el mensaje.

## Evidencia
- `src/services/sucursales.service.ts` `deleteSucursal` (~239-285).
- `pg_constraint`: `solicitud_sucursal_fkey ... ON UPDATE CASCADE ON DELETE CASCADE`; `observacion`, `solicitud_vehiculo`, `solicitud_documento` e `insistencia` con `ON DELETE CASCADE`.
- `src/app/actions/sucursales.actions.ts` `deleteSucursalAction`: el mensaje informa "eliminada junto con N solicitudes", lo que confirma que es intencional, pero sin confirmación de doble paso ni respaldo.

## Impacto
Pérdida irreversible de datos de negocio con un solo clic de un administrador (o de un atacante con la brecha 001).

## Cómo reproducirlo
No ejecutado (destructivo).

## Causa raíz
FK con cascada en una relación que debería ser de restricción. Sin soft delete.

## Solución propuesta
1. Cambiar la FK a `ON DELETE RESTRICT`.
2. Implementar **soft delete** de sucursal (`activa boolean`, `deleted_at`), ocultarla en selectores y bloquear nuevas solicitudes hacia ella.
3. Si se requiere borrado físico, validar que no haya solicitudes (origen o destino), vehículos, traslados ni encargados, y devolver un mensaje claro.
4. Si se mantiene la cascada, borrar también los objetos de Storage de las solicitudes afectadas.

## Riesgos de la solución
- Cambia el comportamiento esperado por el administrador (hoy puede borrar sucursales con solicitudes). Comunicarlo.

## Tests necesarios
- Borrar una sucursal con solicitudes → error (o soft delete) y datos intactos.
- Sucursal sin dependencias → se elimina.

## Plan de implementación
1. Migración: FK a RESTRICT + columna `activa`.
2. Ajustar el service, la action y la UI (`SucursalesTableClient`).
3. Tests.

## Criterios de aceptación
- Ninguna operación de sucursal elimina solicitudes ni documentos.
