# Brecha 019 — Headers de seguridad HTTP ausentes

## Estado
Corregida (CSP en modo Report-Only)

## Severidad
Low

## Categoría
Security — Configuration

## Descripción
`next.config.ts` no define `headers()` y el middleware no añade cabeceras. No se encontraron: `Content-Security-Policy`, `Strict-Transport-Security`, `X-Frame-Options` / `frame-ancestors`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`. La plataforma de hosting podría añadir algunas: No determinado.

## Evidencia
- `next.config.ts`: solo `reactCompiler` y `serverActions.bodySizeLimit: '15mb'`.
- `src/lib/supabase/middleware.ts`: no establece cabeceras.

## Impacto
Bajo hoy (no hay sinks de XSS conocidos), pero sin defensa en profundidad: clickjacking de pantallas de admin, sniffing de MIME y fuga de URLs con UUID por Referer.

## Cómo reproducirlo
`curl -I https://<dominio>/login` y revisar las cabeceras (No ejecutado).

## Causa raíz
Configuración por defecto de Next.js.

## Solución propuesta
Añadir en `next.config.ts`:
```ts
async headers() {
  return [{ source: '/(.*)', headers: [
    { key: 'X-Frame-Options', value: 'DENY' },
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
    { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
    // CSP: empezar en modo Report-Only, permitiendo *.supabase.co
  ]}];
}
```
Además, reducir `bodySizeLimit` al mínimo necesario (10 MB de documento + overhead), o mover la subida a URLs firmadas de subida directa a Storage.

## Riesgos de la solución
- Una CSP estricta puede romper scripts inline de Next.js. Empezar con `Content-Security-Policy-Report-Only` y nonces.

## Tests necesarios
- Test (Playwright o fetch) que verifique la presencia de las cabeceras en `/login`.

## Plan de implementación
1. Cabeceras simples. 2. CSP report-only. 3. CSP enforce.

## Criterios de aceptación
- Las cabeceras están presentes en todas las rutas; securityheaders.com con nota ≥ A.

## Solución aplicada (2026-10-07)

**Rama:** `fix/brechas-auditoria-2026-10-07`

### Cambios
- `next.config.ts` aplica a todas las rutas: `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Strict-Transport-Security` (2 años, includeSubDomains), `Permissions-Policy` y `Content-Security-Policy-Report-Only`.
- `poweredByHeader: false` (oculta `X-Powered-By: Next.js`).
- Las cabeceras viven en `src/config/security-headers.ts` para poder testearlas.

### Tests
- `tests/unitarios/security-headers.test.ts`.

### Pendiente
1. Revisar en producción la consola del navegador (violaciones de CSP reportadas) y pasar la clave a `Content-Security-Policy` con nonces.
2. Validar con securityheaders.com.
3. `bodySizeLimit` sigue en 15 MB, porque se suben varios archivos de hasta 10 MB por petición. Valorar URLs firmadas de subida directa a Storage.
