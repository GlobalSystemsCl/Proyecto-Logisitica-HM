# Brecha 027 — Versión de Next.js con vulnerabilidades críticas de ejecución remota de código

## Estado
Corregida (pendiente de desplegar)

## Severidad
Critical

## Categoría
Security / Supply chain — Dependencia vulnerable

## Descripción
Detectada al ejecutar `npm audit` durante la corrección de la brecha 026 (la auditoría inicial no lo ejecutó por instrucción). La aplicación usaba `next@16.3.2`, dentro del rango afectado (16.0.0 a 16.3.5) por tres avisos de seguridad:

| Aviso | Descripción |
|---|---|
| GHSA-p293-qw3h-jr36 | Ejecución remota de código sin autenticación en servidores Windows |
| GHSA-2xp9-vwfh-vxw4 | Ejecución remota de código en la API de optimización de imágenes con archivos AVIF |
| GHSA-vcvr-r3jv-pc5j | Ejecución remota de código en `next/og` (`ImageResponse`) |

La explotabilidad real depende del hosting (sistema operativo, uso de `next/image` y `next/og`): **No determinado**. Por severidad, se trató como crítica.

## Evidencia
- `package.json`: `"next": "16.3.2"`.
- `npm audit` (2026-10-07): `next 16.0.0 - 16.3.5, Severity: critical`, corrección disponible en 16.4.0 (versión menor, sin cambios incompatibles según npm).

## Impacto
Compromiso del servidor de la aplicación, que tiene la `SUPABASE_SERVICE_ROLE_KEY`. Equivale a acceso total a la base de datos.

## Solución propuesta
Actualizar `next` y `eslint-config-next` a 16.4.0.

## Solución aplicada (2026-10-07)

**Rama:** `fix/brechas-auditoria-2026-10-07`

### Cambios
- `next` 16.3.2 → **16.4.0** y `eslint-config-next` 16.3.2 → 16.4.0, ambas con versión exacta, como estaban.
- `npm audit fix` (sin `--force`): corrige `brace-expansion` y `source-map-js`.
- `npm audit` ya no reporta `next`.

### Verificación
- `next build` correcto con 16.4.0.
- `npm audit --omit=dev`: **0 vulnerabilidades** en las dependencias de producción.
- 699 tests en verde, `tsc --noEmit` sin errores y ESLint sin errores.

### Pendiente
1. Desplegar (junto con el resto de la rama, después de aplicar las migraciones).
2. Next 16 marca `middleware.ts` como obsoleto (renombrado a `proxy.ts`). Sigue funcionando; migrarlo con `npx @next/codemod@canary middleware-to-proxy .` en un cambio aparte.
3. Vulnerabilidades restantes, solo en herramientas de desarrollo (no llegan a producción): `vitest`/`tinypool` (crítica, requiere vitest 5) y `eslint-config-next`/`micromatch` (alta). Ver la brecha 026.

## Criterios de aceptación
- `npm audit --omit=dev` sin vulnerabilidades críticas ni altas.
