# Base de datos — migraciones de la auditoría 2026-10-07

Hasta esta auditoría el esquema no estaba versionado (brecha 015). Esta carpeta
contiene las correcciones de base de datos de la auditoría como migraciones con
fecha, cada una con su script de reversión.

```
supabase/
├── scripts/00_respaldo_antes_de_migrar.sql   consultas de solo lectura para respaldar
├── scripts/04_limpiar_datos_prueba.sql       vacía los datos de prueba (una vez, no es migración)
├── migrations/                               cambios, en orden de aplicación
├── rollback/                                 reversión de cada migración (mismo nombre)
└── seed/                                     datos de prueba del ciclo de vida (ver seed/README.md)
```

## Orden de aplicación

> **Importante:** aplicar las migraciones **antes** de desplegar el código de la
> rama `fix/brechas-auditoria-2026-10-07`. El middleware nuevo lee
> `usuario.aprobado`; si la columna no existe, todas las sesiones se cierran.

| # | Archivo | Brechas | Riesgo |
|---|---|---|---|
| 0 | `scripts/00_respaldo_antes_de_migrar.sql` | — | Ninguno (solo lectura). Guardar los resultados |
| 1 | `20261007120000_brecha_001_005_permisos_escritura.sql` | 001, 005 | Bajo: la app escribe solo con service_role |
| 2 | `20261007120100_brecha_002_003_025_registro_y_aprobacion.sql` | 002, 003, 025 | Medio: reemplaza el trigger de alta de usuarios |
| 3 | `20261007120200_brecha_014_funciones_security_definer.sql` | 014 | Medio: fija search_path en todas las funciones |
| 4 | `20261007120300_brecha_010_bloqueo_doble_reserva.sql` | 010, 008 | Bajo: valida reservas en la BD |
| 5 | `20261007120400_brecha_016_fk_sucursal_restrict.sql` | 016 | Bajo |
| 6 | `20261007120500_brecha_024_indices_fk.sql` | 024 | Bajo: solo índices |
| 7 | `20261007120600_brecha_012_intentos_fallidos_atomico.sql` | 012, 010 | Bajo |

## Migraciones de los requisitos (rama `feature/requisitos-2026-10`)

Aplicar **antes** de desplegar el código de esa rama, en este orden:

| # | Archivo | Requisitos | Riesgo |
|---|---|---|---|
| 8 | `20261009110000_req_estado_traslado_cancelado.sql` | R8 | Bajo: agrega el valor `cancelado` al enum (va solo, fuera de transacción) |
| 9 | `20261009120000_req_traslados_cancelacion_recepcion.sql` | R8, R13, R14 | Bajo: columnas nuevas, trigger de 1 vehículo por traslado nuevo y funciones de cancelación |
| 10 | `20261009130000_req_indices_calendario_reportes.sql` | R16, R17 | Bajo: solo índices |
| 11 | `20261013120000_fix_cancelar_traslado_slots_ocupados.sql` | R8 | Bajo: reemplaza `fn_cancelar_traslado_interno` para que descuente también `slots_ocupados` del destino (las 8–10 ya están aplicadas en producción) |

## Brecha 011 — contadores de slots (aplicar en este orden)

| # | Archivo | Riesgo |
|---|---|---|
| 12 | `20261013130000_brecha_011_recalculo_slots_unificado.sql` | Bajo: `fn_recalcular_slots_sucursal` calcula ambos contadores (incluye traslados); `fn_recalcular_slots_ocupados` delega en ella |
| 13 | `20261013140000_brecha_011_triggers_recalculo.sql` | Medio: los triggers de reservas recalculan en vez de sumar/restar; triggers de borrado nuevos; elimina `trigger_disponibilidad` |
| 14 | `20261013150000_brecha_011_trigger_vehiculos.sql` | Medio: reactiva el recálculo por movimientos de vehículos con triggers por sentencia |
| 15 | `20261013160000_brecha_011_recalculo_global.sql` | Bajo: corrección única de datos; se puede repetir |

Marcha blanca: superar la capacidad solo emite un aviso (`RAISE NOTICE`); nunca bloquea.

## Asignaciones por rol

| # | Archivo | Riesgo |
|---|---|---|
| 16 | `20261013155000_asignacion_sucursales_y_zonas_por_rol.sql` | Medio: quita los encargados de sucursal que no son jefe de local (datos), agrega triggers de "un jefe por sucursal", una zona por usuario de Logística y amplía la RLS de lectura del jefe de local a todas sus sucursales. Después, ejecutar `scripts/03_asignar_sucursales_sin_jefe.sql` (deja Valparaíso, Santiago Centro y las sucursales de prueba a cargo de Joaquin Lepe). Ambos ya están aplicados en producción |

Se aplicó con la versión `20261013150000`, la misma de `brecha_011_trigger_vehiculos`. Como Supabase exige versiones únicas, se renombró a `20261013155000` (el contenido no cambió).

## Brecha 014 — puntos pendientes

| # | Archivo | Riesgo |
|---|---|---|
| 17 | `20261013170000_brecha_014_funciones_rol_y_sucursal.sql` | Medio: `es_administrador`, `tiene_rol` y `usuario_activo` solo cuentan `activo = true` (antes NULL contaba como activo); `usuario.activo` pasa a NOT NULL; `usuario_tiene_sucursal` no deja que un usuario con sesión consulte las sucursales de otro. Las policies sostienen casi todo el acceso: probar el login de cada rol después de aplicarla |

## Notificaciones en la app

| # | Archivo | Riesgo |
|---|---|---|
| 18 | `20261014120000_notificaciones_en_app.sql` | Bajo: agrega tipos al enum `tipo_notificacion`, índices de `notificacion`, publica la tabla en Realtime y elimina 3 funciones de trigger antiguas sin uso (`notificar_*`). Aplicada y registrada en el historial el 2026-10-14 |

## Quién inició la solicitud

| # | Archivo | Riesgo |
|---|---|---|
| 19 | `20261014130000_solicitud_creado_por.sql` | Bajo: agrega `solicitud.creado_por` y la completa desde la auditoría. **Aplicarla antes de desplegar el código**: la app la lee en todas las listas de solicitudes. Después, volver a ejecutar `scripts/01_alinear_historial_migraciones.sql` |

## Búsqueda de vehículos para traslados internos

| # | Archivo | Riesgo |
|---|---|---|
| 20 | `20261020120000_fn_vehiculos_disponibles_traslado.sql` | Bajo: crea la función `fn_vehiculos_disponibles_traslado` (solo `service_role`). Excluye reservados y vendidos en SQL, ordena por chasis y pagina. Mientras no esté aplicada, la app usa la consulta anterior, así que el orden de despliegue no importa. Ensayada en producción (revertida): 2.113 vehículos disponibles. Después de aplicarla, volver a ejecutar `scripts/01_alinear_historial_migraciones.sql` |

## Transportista

| # | Archivo | Riesgo |
|---|---|---|
| 21 | `20261020130000_transportista.sql` | Bajo: tabla `transportista` (nombre, RUT único normalizado `12345678-9`, activo) y `transportista_id` en `solicitud` y `traslado_interno` (nulas, ON DELETE RESTRICT). **Aplicarla antes de desplegar el código**: las listas de solicitudes y traslados leen `transportista_id` y, sin la columna, quedan vacías. Después, volver a ejecutar `scripts/01_alinear_historial_migraciones.sql` |
| 22 | `20261020140000_notificacion_nuevo_usuario.sql` | Bajo: agrega `NUEVO_USUARIO` al enum `tipo_notificacion` (notificación al administrador cuando alguien se registra). Sin transacción explícita. Si el código se despliega antes, el registro funciona igual y solo se pierde la notificación (el error queda en el log). Después, volver a ejecutar `scripts/01_alinear_historial_migraciones.sql` |
| 23 | `20261024120000_codigo_solicitud_por_sucursal.sql` | Medio: n° de solicitud `<código de sucursal de origen>-<correlativo>` (101-15). `sucursal.id` es el código del Excel de concesionarios: carga las 42 sucursales (101-145, sin slots ni zona) y deja igual las 4 de prueba (6-9). Agrega `sucursal.ultimo_numero_solicitud`, `solicitud.numero` (único por sucursal), numera las existentes por fecha de creación y crea el trigger `tr_asignar_numero_solicitud`. **Aplicarla antes de desplegar el código**: las listas leen `solicitud.numero` y, sin la columna, quedan vacías. Después, volver a ejecutar `scripts/01_alinear_historial_migraciones.sql` |
| 24 | `20261027120000_recrear_vehiculo_formato_stock.sql` | Alto si se omite: la tabla `vehiculo` se borró con `DROP TABLE vehiculo CASCADE` el 2026-10-26 y sin ella el inventario, los traslados y las entregas fallan. Recrea la tabla con las columnas originales y las del Excel de stock (`tipo_vehiculo`, `marca_codigo`, `idv`; `anio` opcional), sus FK (`vehiculo_ubicacion_fkey` RESTRICT y las de `solicitud_vehiculo` y `traslado_interno_vehiculo`), los triggers de slots y la RLS. Requiere que las tablas de vínculo estén vacías (lo están tras `scripts/04_limpiar_datos_prueba.sql`). **Aplicarla antes de desplegar el código.** Después, volver a ejecutar `scripts/01_alinear_historial_migraciones.sql` |

## Historial de migraciones (brecha 015)

Las migraciones aplicadas desde el SQL Editor no quedan registradas en `supabase_migrations.schema_migrations`. **Ejecutado el 2026-10-14**, junto con `scripts/02_limpiar_sucursales_test.sql`: las 17 migraciones están aplicadas y registradas. `scripts/01_alinear_historial_migraciones.sql` registra los archivos de `migrations/` con su versión y nombre exactos. Un test (`tests/unitarios/script-historial-migraciones.test.ts`) falla si se agrega una migración sin registrarla en el script.

Desde ahí, aplicar todo cambio con la CLI (`supabase db push`) o actualizar el script en la misma tarea.

Después de aplicar la 9, ejecutar su "Verificación posterior". En particular,
tras la primera cancelación de una solicitud en tránsito, comprobar que los
slots reservados del destino bajaron.

## Cómo aplicarlas

Opción A — SQL Editor de Supabase (producción): pegar y ejecutar cada archivo
en el orden de la tabla. Cada migración está envuelta en `begin; … commit;`:
si algo falla, no queda aplicada a medias.

Opción B — Supabase CLI:

```bash
supabase link --project-ref yaqbccvlenouqmtqrlrq
supabase db push
```

Después de aplicar:

1. Ejecutar las consultas de "Verificación posterior" que trae cada archivo.
2. Revisar los advisors de seguridad y rendimiento en el dashboard.
3. Desplegar el código.
4. Prueba manual: login de cada rol, crear y aprobar una solicitud, registrar
   un usuario nuevo y aprobarlo, desactivar y reactivar un usuario.

## Reversión

Cada archivo de `rollback/` revierte la migración del mismo nombre. Algunos
requieren pegar la definición original obtenida con el script de respaldo
(se indica dentro del archivo). Revertir reabre la brecha correspondiente.

## Pendiente (brecha 015)

Generar la migración base del esquema completo con
`supabase db pull` (requiere la contraseña de la base y Docker) y, desde ahí,
hacer todo cambio de esquema como migración nueva.
