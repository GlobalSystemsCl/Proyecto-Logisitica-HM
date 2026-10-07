# Brecha 007 — Contraseña del administrador principal hardcodeada en el script de seed

## Estado
Parcial: script corregido; **la rotación de la contraseña la debe hacer el responsable**

## Severidad
High

## Categoría
Security — Secrets in repository, Weak credentials

## Descripción
`scripts/seed-admin.mjs` crea o restablece la cuenta del administrador principal con un email fijo y una **contraseña literal en el código fuente**, débil (corta, de diccionario). Además, el script la imprime por consola al terminar. El archivo está versionado (no está en `.gitignore`).

> Por política de esta auditoría, el valor de la contraseña no se reproduce en ningún documento.

## Evidencia
- Archivo: `scripts/seed-admin.mjs`, función `seedAdmin()` (~líneas 35-40): constantes `email` y `password`.
- Línea ~116: `console.log` de la contraseña.
- Uso de `SUPABASE_SERVICE_ROLE_KEY` o `SUPABASE_SECRET_KEY` desde `.env.local`.

## Impacto
Si la contraseña actual del administrador principal coincide con la del script, que es el comportamiento por defecto si nunca se cambió, cualquiera con acceso de lectura al repositorio o a su historial tiene acceso de administrador. La contraseña es además adivinable por fuerza bruta, y el bloqueo de la app no protege el endpoint directo de Auth (brecha 012).

## Cómo reproducirlo
No aplica (no se probó iniciar sesión). Verificación sugerida al dueño: intentar iniciar sesión con la contraseña del script en un entorno controlado, o simplemente rotarla.

## Causa raíz
Script de bootstrap escrito para desarrollo, con credenciales embebidas en lugar de pedirlas por variable de entorno o prompt.

## Solución propuesta
1. **Rotar ya** la contraseña del administrador principal (y de cualquier cuenta creada con el script) por una larga y única. Evaluar MFA para administradores.
2. Modificar el script para leer email y contraseña de variables de entorno (`SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`) o generar una aleatoria fuerte con `crypto.randomBytes`. No imprimirla, o imprimirla solo con un flag explícito.
3. Exigir `requiere_cambio_clave = true` en la cuenta sembrada.
4. Evaluar si el valor quedó en el historial de git. Si el repo es o fue remoto, considerar la credencial comprometida (la rotación del paso 1 es suficiente; reescribir el historial es opcional).

## Riesgos de la solución
- Rotar la contraseña requiere que el dueño la conozca y la guarde en un gestor seguro.

## Tests necesarios
- Test del script (o revisión) que confirme que no hay literales de contraseña: búsqueda en CI de patrones `password\s*=\s*['"]`.

## Plan de implementación
1. Rotar la contraseña desde el panel o con `resetUserPasswordAction`.
2. Refactorizar el script.
3. Añadir una regla de detección de secretos (por ejemplo, gitleaks) en pre-commit o CI.

## Criterios de aceptación
- Ninguna contraseña literal en el repositorio.
- La contraseña actual del administrador principal no coincide con la del historial.

## Solución aplicada (2026-10-07)

**Rama:** `fix/brechas-auditoria-2026-10-07`

### Cambios
- `scripts/seed-admin.mjs` ya no contiene credenciales:
  - el correo se lee de `SEED_ADMIN_EMAIL`;
  - la contraseña sale de `SEED_ADMIN_PASSWORD` (mínimo 12 caracteres) o se genera aleatoria con `crypto.randomBytes` (24 caracteres);
  - la contraseña no se imprime salvo con el flag explícito `--mostrar-clave`;
  - la cuenta queda con `requiere_cambio_clave = true` y `aprobado = true`;
  - el rol ya no viaja en `user_metadata`.

### Archivos
- `projecto_logistica_hm/scripts/seed-admin.mjs`

### Pendiente (responsable) — urgente
1. **Rotar ya la contraseña del administrador principal** desde `/perfil`, desde `/recuperar-clave` o con "Restablecer contraseña" en `/admin/usuarios`. La contraseña anterior sigue en el historial de git (y en el remoto de GitHub): debe considerarse comprometida.
2. Rotar también la de cualquier cuenta creada con el script anterior.
3. Activar MFA para administradores en Supabase Auth.
4. Opcional: detección de secretos en CI (gitleaks).
