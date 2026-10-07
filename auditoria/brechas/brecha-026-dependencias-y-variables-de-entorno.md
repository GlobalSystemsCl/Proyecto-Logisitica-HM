# Brecha 026 — Dependencias y variables de entorno: elementos sin uso, faltantes o duplicados

## Estado
Parcial

## Severidad
Informational

## Categoría
Configuration / Supply chain

## Descripción
1. **Dependencia `claude` (^0.1.1)** en `dependencies`: no se importa en ningún archivo de `src/` ni de `scripts/`. Es un paquete de terceros con un nombre genérico. Las dependencias sin uso aumentan la superficie de cadena de suministro (sus scripts `postinstall` se ejecutan en cada `npm install`). Su contenido y autoría: No determinado.
2. **`xlsx` desde `https://cdn.sheetjs.com/...tgz`**: es el canal oficial de SheetJS y la versión 0.20.3 corrige las vulnerabilidades conocidas de las versiones de npm. Queda fuera de `npm audit`; mantenerla actualizada manualmente.
3. **`NEXT_PUBLIC_APP_URL` no está en `.env.local`**: `sendPasswordResetEmail` y `EmailService` caen a `http://localhost:3000`. En producción: No determinado. Si falta, los enlaces de recuperación y el botón del correo apuntan a localhost (bug funcional).
4. **Claves duplicadas**: coexisten las claves legacy (`ANON_KEY`/`SERVICE_ROLE_KEY`) y las nuevas (`PUBLISHABLE_KEY`/`SECRET_KEY`), con fallback `||` en 3 sitios. Hay que rotar ambas si alguna se filtra; se recomienda migrar a las nuevas y desactivar las legacy en Supabase.
5. **`BREVO_SMTP_HOST/PORT/USER`** definidas y sin uso (el envío es por API HTTP).
6. `tests/setup-env.ts` carga `.env.local` (con service_role) en los tests: si algún test no mockeara el cliente admin, escribiría en **producción**. Hoy todos mockean, pero la documentación de testing menciona una suite de integración que usaba service_role contra la BD.
7. `npm audit`: No determinado (no se ejecutó por instrucción).

## Evidencia
- `package.json`; búsqueda de imports de `claude` → 0 resultados.
- `.env.local` (solo nombres de variables revisados); usos de `process.env` en `src/`.
- `tests/setup-env.ts`.

## Impacto
Bajo o informativo. El punto 3 puede romper la recuperación de contraseña. El punto 6 es un riesgo de borrar o ensuciar datos de producción.

## Cómo reproducirlo
No aplica.

## Causa raíz
Higiene de configuración.

## Solución propuesta
1. `npm uninstall claude` (verificar antes que no lo use ninguna herramienta local).
2. Definir `NEXT_PUBLIC_APP_URL` en todos los entornos y fallar al arrancar si falta (validación de env con zod).
3. Migrar a las claves nuevas de Supabase y desactivar las legacy.
4. Eliminar las variables SMTP sin uso.
5. Tests: usar `.env.test` que apunte a Supabase local; prohibir la URL de producción en `setup-env.ts`.
6. Ejecutar `npm audit` y añadir Dependabot o Renovate.

## Riesgos de la solución
- Desactivar las claves legacy rompe cualquier despliegue que aún las use: actualizar primero las variables en el hosting.

## Tests necesarios
- Validación de env al arranque (unit).
- `setup-env.ts` aborta si detecta la URL de producción.

## Plan de implementación
Limpieza de package.json → validación de env → rotación de claves → separación de entorno de tests.

## Criterios de aceptación
- Sin dependencias sin uso; todas las variables requeridas validadas; los tests no pueden tocar producción.

## Solución aplicada (2026-10-07)

**Rama:** `fix/brechas-auditoria-2026-10-07`

### Cambios
- Se eliminó la dependencia `claude` (`npm uninstall claude`), que no se usaba en ningún archivo.
- `NEXT_PUBLIC_APP_URL`: `src/lib/env.ts` (`getAppUrl`) falla de forma explícita en producción si falta, en lugar de generar enlaces a `localhost`. Se usa en la recuperación de contraseña y en el correo de credenciales.
- `tests/setup-env.ts` ya no carga `.env.local`: los tests no pueden tocar producción (punto 6).
- `npm audit` ejecutado. Ver la brecha 027: Next.js tenía vulnerabilidades críticas y se actualizó. `npm audit fix` (sin `--force`) corrigió `brace-expansion` y `source-map-js`.

### Tests
- `env.test.ts`.

### Pendiente
1. **Responsable:** definir `NEXT_PUBLIC_APP_URL` y `ADMIN_PRINCIPAL_EMAIL` en el hosting.
2. **Responsable:** migrar a las claves nuevas de Supabase (`PUBLISHABLE_KEY` / `SECRET_KEY`), desactivar las legacy y eliminar los fallbacks `||` del código.
3. **Responsable:** quitar `BREVO_SMTP_*` de `.env.local` y del hosting (no se usan).
4. Vulnerabilidades restantes, solo en herramientas de desarrollo (no llegan a producción):
   - `vitest` / `tinypool` (crítica): requiere vitest 5 (major);
   - `eslint-config-next` / `micromatch` (alta).
   Actualizarlas en un cambio aparte y verificar la suite.
5. Dependabot o Renovate.
