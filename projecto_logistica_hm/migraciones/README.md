# Base de datos — migraciones de la auditoría 2026-10-07

Hasta esta auditoría el esquema no estaba versionado (brecha 015). Esta carpeta
contiene las correcciones de base de datos de la auditoría como migraciones con
fecha, cada una con su script de reversión.

```
supabase/
├── scripts/00_respaldo_antes_de_migrar.sql   consultas de solo lectura para respaldar
├── migrations/                               cambios, en orden de aplicación
└── rollback/                                 reversión de cada migración (mismo nombre)
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
