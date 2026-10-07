# Brecha 025 — Email del administrador principal hardcodeado en código y en la base de datos

## Estado
Corregida en código; trigger corregido en la migración **pendiente de aplicar**

## Severidad
Informational

## Categoría
Architecture / Security hardening

## Descripción
El correo personal del administrador principal aparece literal en 7 lugares del código y en el trigger `handle_new_auth_user`, con lógica especial:
- Si el perfil no existe, se crea con `rol='administrador'` para ese email (`getCurrentUserProfile`, `signIn`).
- El trigger fuerza `rol='administrador'` para ese email al crear o volver a sincronizar.
- No se puede desactivar ni autoregistrar.

Es un "superusuario por email". Si alguien controlara ese correo (compromiso de la cuenta de correo personal), podría recuperar la contraseña y obtener un administrador indesactivable desde la UI.

## Evidencia
- `src/services/auth.service.ts` líneas ~6, ~84, ~188, ~386.
- `src/services/users.service.ts` ~345.
- `src/app/admin/usuarios/UsersTableClient.tsx` ~213, ~544.
- `public.handle_new_auth_user()` (2 comparaciones `LOWER(NEW.email) = '<email>'`).
- `scripts/seed-admin.mjs`.

## Impacto
Bajo hoy. Acopla la seguridad del sistema a una cuenta de correo personal y dificulta el traspaso del sistema a la empresa.

## Cómo reproducirlo
No aplica.

## Causa raíz
Bootstrap del primer administrador resuelto en código.

## Solución propuesta
1. Reemplazar por un flag en BD (`usuario.es_admin_principal boolean`) o una variable de entorno (`ADMIN_PRINCIPAL_EMAIL`) leída en un solo módulo.
2. Quitar la autoasignación de rol administrador en `getCurrentUserProfile` y `signIn` (un perfil faltante debe crearse como ejecutivo no aprobado).
3. Usar un correo corporativo para el administrador principal, con MFA.

## Riesgos de la solución
- Si se elimina la protección sin sustituirla, el admin principal podría desactivarse por error. Mantener la regla con el flag.

## Tests necesarios
- Creación de perfil faltante → nunca administrador.
- El admin principal (por flag) no se puede desactivar.

## Plan de implementación
Constante única → flag en BD → limpieza del trigger.

## Criterios de aceptación
- El email no aparece en el código ni en las funciones SQL.

## Solución aplicada (2026-10-07)

**Rama:** `fix/brechas-auditoria-2026-10-07`

### Cambios
- El correo del administrador principal ya no está en el código: se configura con la variable de entorno de servidor `ADMIN_PRINCIPAL_EMAIL`, leída en un solo módulo (`src/lib/auth/admin-principal.ts`). Solo sirve para impedir que esa cuenta se desactive o se autoregistre; **nunca otorga rol ni permisos**.
- Se eliminó la autoasignación de rol administrador en `getCurrentUserProfile` y `signIn`. Un perfil faltante se registra como `ejecutivo` inactivo y pendiente de aprobación, y no se concede acceso.
- El trigger `handle_new_auth_user` ya no compara el email (migración de la brecha 002).
- `UsersTableClient` recibe el correo como prop desde el servidor.
- `scripts/seed-admin.mjs` usa `SEED_ADMIN_EMAIL`.

### Archivos
- `src/lib/auth/admin-principal.ts`, `src/services/auth.service.ts`, `src/services/users.service.ts`
- `src/app/admin/usuarios/page.tsx`, `src/app/admin/usuarios/UsersTableClient.tsx`, `scripts/seed-admin.mjs`

### Tests
- `admin-principal.test.ts`, `users.service.test.ts` (`should_protect_principal_admin_configured_by_env`), `auth.service.test.ts` (`should_never_create_administrador_for_principal_email`).

### Pendiente (responsable)
1. Definir `ADMIN_PRINCIPAL_EMAIL` en las variables de entorno del hosting. Si falta, simplemente no hay cuenta protegida contra desactivación.
2. Migrar el administrador principal a un correo corporativo con MFA.
