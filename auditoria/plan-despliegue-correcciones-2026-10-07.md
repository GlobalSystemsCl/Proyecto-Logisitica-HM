# Plan de despliegue — correcciones de la auditoría 2026-10-07

| Campo | Valor |
|---|---|
| Rama | `fix/brechas-auditoria-2026-10-07` (creada desde `auditoria/2026-10-07`) |
| Entorno | Producción directa (decisión 1 del responsable): no hay staging |
| Base de datos | Proyecto Supabase `Proyecto Logistica-HM` (`yaqbccvlenouqmtqrlrq`) |
| Estado | Código verificado localmente. **Migraciones no aplicadas, código no desplegado** |

Verificación local de la rama: 699 tests unitarios en verde, `tsc --noEmit` sin errores, ESLint sin errores, `next build` correcto y `npm audit --omit=dev` con 0 vulnerabilidades.

> El orden importa. El código nuevo lee la columna `usuario.aprobado`, que crea la migración 2. Si el código se despliega antes que las migraciones, el middleware cierra todas las sesiones.

---

## Paso 0 — Urgente, independiente del despliegue

- [ ] **Rotar la contraseña del administrador principal** (brecha 007). La anterior está en el historial de git y en GitHub: debe considerarse comprometida. Se puede hacer desde `/perfil` o desde "Restablecer contraseña" en `/admin/usuarios`.
- [ ] Rotar la de cualquier otra cuenta creada con el script `seed-admin.mjs` antiguo.

## Paso 1 — Respaldo (solo lectura)

- [ ] Ejecutar `projecto_logistica_hm/supabase/scripts/00_respaldo_antes_de_migrar.sql` en el SQL Editor y guardar el resultado de cada consulta **fuera del repositorio**.
- [ ] Con la CLI, si está disponible: `supabase db dump --linked -f respaldo_esquema_2026-10-07.sql`.
- [ ] Auditoría post-incidente (brechas 001 y 002): con la consulta 8 del respaldo y la consulta de auditoría de la migración 2, confirmar que los 2 administradores actuales son legítimos.

## Paso 2 — Migraciones (en este orden)

Ver `projecto_logistica_hm/supabase/README.md`. Cada archivo es transaccional (`begin; … commit;`).

| # | Archivo | Brechas |
|---|---|---|
| 1 | `20261007120000_brecha_001_005_permisos_escritura.sql` | 001, 005 |
| 2 | `20261007120100_brecha_002_003_025_registro_y_aprobacion.sql` | 002, 003, 025 |
| 3 | `20261007120200_brecha_014_funciones_security_definer.sql` | 014 |
| 4 | `20261007120300_brecha_010_bloqueo_doble_reserva.sql` | 010, 008 |
| 5 | `20261007120400_brecha_016_fk_sucursal_restrict.sql` | 016 |
| 6 | `20261007120500_brecha_024_indices_fk.sql` | 024 |
| 7 | `20261007120600_brecha_012_intentos_fallidos_atomico.sql` | 012, 010 |

- [ ] Después de cada una, ejecutar su consulta de "Verificación posterior".
- [ ] Revisar los advisors de seguridad y rendimiento.
- [ ] Si algo falla: el archivo homónimo de `supabase/rollback/` lo revierte.

## Paso 3 — Variables de entorno del hosting

- [ ] `NEXT_PUBLIC_APP_URL` = URL pública de la app. Es obligatoria en producción: sin ella fallan la recuperación de contraseña y el correo de credenciales (brecha 026).
- [ ] `ADMIN_PRINCIPAL_EMAIL` = correo del administrador principal. Impide desactivarlo; no otorga permisos (brecha 025).
- [ ] Quitar `BREVO_SMTP_*` (no se usan).

## Paso 4 — Despliegue del código

- [ ] Revisar y fusionar `fix/brechas-auditoria-2026-10-07` (incluye Next.js 16.4.0, brecha 027).
- [ ] Desplegar.

## Paso 5 — Prueba manual en producción

- [ ] Login de cada rol (administrador, jefe de local, ejecutivo, logística) y navegación a su módulo.
- [ ] Ejecutivo: crear una solicitud, ver su detalle (observaciones, historial, documentos), subir y descargar un PDF.
- [ ] Jefe de local: aprobar, priorizar y reordenar la cola.
- [ ] Logística: asignar, calendarizar y despachar una solicitud de su zona.
- [ ] Registro público: registrarse en `/registro`. Debe responder "Solicitud de acceso enviada" y no poder ingresar hasta que un admin lo autorice. Autorizar desde `/admin/usuarios` y comprobar el ingreso.
- [ ] Desactivar un usuario con sesión abierta: en su siguiente navegación debe volver a `/login`. Reactivar y comprobar el ingreso.
- [ ] Crear un usuario desde el admin: llega el correo y en el primer ingreso se exige cambiar la contraseña, en cualquier ruta.
- [ ] Recuperar contraseña con un correo inexistente: el mensaje es el mismo que para uno existente.
- [ ] Revisar la consola del navegador: la CSP está en modo Report-Only y solo reporta.

## Paso 6 — Configuración de Supabase Auth (dashboard)

- [ ] Attack Protection → **Leaked password protection**: activar (brecha 012).
- [ ] Policies → contraseña: mínimo 10, con mayúsculas, minúsculas y números (igual que la app).
- [ ] Revisar los rate limits de Auth.
- [ ] MFA (TOTP) para administradores.
- [ ] Decidir si el registro público sigue habilitado ("Allow new users to sign up").
- [ ] Migrar a las claves nuevas (publishable/secret) y desactivar las legacy, primero en el hosting (brecha 026).

## Paso 7 — Trabajo pendiente (siguientes iteraciones)

| Brecha | Pendiente |
|---|---|
| 011 | Recalcular slots y unificar los triggers (requiere versionar las funciones actuales) |
| 010 | RPCs transaccionales para crear solicitud, crear traslado y reordenar la cola |
| 014 | `usuario_tiene_sucursal` basada en `auth.uid()`; `COALESCE(activo, false)` en las funciones de rol |
| 015 | Migración base con `supabase db pull` y tipos generados |
| 017 | Tests de RLS, triggers e integración con Supabase local; CI |
| 018 | Decidir la fuente única de auditoría; auditar acciones de admin; notificaciones |
| 019 | Pasar la CSP a modo enforce con nonces |
| 021 | Índice único `lower(nombre)` en sucursal y zona |
| 024 | Paginación del historial y listados; `(select auth.uid())` en policies |
| 026 / 027 | Actualizar vitest (5.x) y eslint; migrar `middleware.ts` → `proxy.ts` |
| 008 / 016 / 018 | Decisiones de negocio: reglas de calendarización, soft delete de sucursales, notificaciones |
